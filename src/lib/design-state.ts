/**
 * The design state is the durable memory of the product.
 *
 * Meshy has no endpoint that edits an existing mesh, so geometric continuity
 * between versions cannot come from the vendor — it has to be carried
 * semantically. This module owns that: every version stores a full design state,
 * and each edit evolves the previous state rather than starting from a bare
 * chat message.
 *
 * The state is the thing that persists. The Meshy prompt is a lossy visual
 * projection of it, recompiled per generation and never treated as the record.
 *
 * Every function degrades to a deterministic non-LLM path when no LLM provider
 * is configured, so the whole pipeline runs with no API keys at all.
 */

import { callLLM } from "./llm";

export interface DesignState {
  summary: string;
  geometry: string;
  materials: string;
  dimensions: string;
  constraints: string;
  function: string;
  rationale: string;
}

export interface HistoryEntry {
  author: string;
  body: string;
}

const FIELDS: Array<keyof DesignState> = [
  "summary",
  "geometry",
  "materials",
  "dimensions",
  "constraints",
  "function",
  "rationale",
];

const EMPTY: DesignState = {
  summary: "An unspecified product concept.",
  geometry: "Not yet described.",
  materials: "Not yet specified.",
  dimensions: "Not yet specified.",
  constraints: "None recorded.",
  function: "Not yet specified.",
  rationale: "Initial concept; no design decisions recorded yet.",
};

/**
 * A brief that names no object at all ("hi", "test", a bare greeting).
 * Seeding one of these against the LLM is what produces the confidently
 * hallucinated identity: told to never answer "unknown", the model invents a
 * full concrete product out of nothing, and that invention then becomes canon
 * that every later edit is instructed to preserve. Short-circuiting here
 * means nothing is ever invented from a brief this thin — see the placeholder
 * branch in evolveDesignState below for how the first real instruction then
 * defines the object instead of editing a fiction.
 */
const FILLER_ONLY =
  /^(hi|hey|hello|hiya|yo|sup|howdy|ok|okay|k|kk|test|testing|hmm+|uh+|um+|lol)[\s.!?]*$/i;

function isDescriptiveBrief(brief: string): boolean {
  const trimmed = brief.trim();
  return trimmed.length > 0 && !FILLER_ONLY.test(trimmed);
}

/** Sentinel: identifies a design state whose object has never been established. */
const UNSET_SUMMARY =
  "No object has been defined yet — the next request will establish what this is.";

const PLACEHOLDER: DesignState = {
  summary: UNSET_SUMMARY,
  geometry: "Not yet described.",
  materials: "Not yet specified.",
  dimensions: "Not yet specified.",
  constraints: "None recorded.",
  function: "Not yet specified.",
  rationale: "The initial brief named no object, so nothing was invented.",
};

/** Human-readable rendering, stored as `raw` and shown in the design panel. */
export function renderDesignState(state: DesignState): string {
  return [
    `SUMMARY\n${state.summary}`,
    `GEOMETRY\n${state.geometry}`,
    `MATERIALS & FINISH\n${state.materials}`,
    `DIMENSIONS\n${state.dimensions}`,
    `MANUFACTURING CONSTRAINTS\n${state.constraints}`,
    `FUNCTION\n${state.function}`,
    `DESIGN RATIONALE\n${state.rationale}`,
  ].join("\n\n");
}

function parseState(raw: string | null, fallback: DesignState): DesignState {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof DesignState, unknown>>;
    const next = { ...fallback };
    for (const field of FIELDS) {
      const value = parsed[field];
      if (typeof value === "string" && value.trim()) next[field] = value.trim();
    }
    return next;
  } catch {
    return fallback;
  }
}

// ── Seeding ──

const SEED_SYSTEM = `You write the canonical design state for a product being developed collaboratively.

Given a short brief, produce a detailed, concrete design state. Be specific and physical — this text is the only durable memory of the product, and every future edit is applied on top of it.

Where the brief is silent, choose sensible, explicitly-stated defaults rather than leaving a field vague. Never answer "unknown".

Respond with strict JSON containing exactly these string fields:
summary, geometry, materials, dimensions, constraints, function, rationale

- summary: one paragraph capturing the product vision
- geometry: form, proportions, silhouette, key features
- materials: materials, finish, colour
- dimensions: overall sizes and any tolerances, with units
- constraints: manufacturing constraints that apply
- function: intended function and use
- rationale: the design decisions made and why`;

export async function seedDesignState(input: {
  brief: string;
  constraints?: string | null;
}): Promise<DesignState> {
  if (!isDescriptiveBrief(input.brief)) {
    return {
      ...PLACEHOLDER,
      constraints: input.constraints?.trim() || PLACEHOLDER.constraints,
    };
  }

  const fallback: DesignState = {
    ...EMPTY,
    summary: input.brief,
    geometry: input.brief,
    constraints: input.constraints?.trim() || EMPTY.constraints,
    rationale: "Seeded directly from the initial brief.",
  };

  const raw = await callLLM(
    SEED_SYSTEM,
    `Brief: "${input.brief}"\n\nProject manufacturing constraints: ${
      input.constraints?.trim() || "none stated"
    }`,
    { json: true },
  );

  return parseState(raw, fallback);
}

// ── Evolution ──

const EVOLVE_SYSTEM = `You maintain the canonical design state of a product being iteratively designed by a team.

You receive the CURRENT design state and ONE change request. Produce the NEXT design state.

Rules, in order of importance:
1. Apply only the requested change. Do not redesign the product.
2. Preserve every existing detail verbatim unless the request directly contradicts it. Detail loss across iterations is the primary failure mode — copy untouched fields through unchanged.
3. Never invent a different object. The result must read as the same product, modified.
4. Append to "rationale" a one-line note of what changed and why. Keep all prior rationale lines; this field is a running log.
5. Respect the manufacturing constraints. If the request conflicts with them, apply the closest feasible interpretation and record the conflict in rationale.
6. Keep dimensions numerically consistent. If a change implies new measurements, update them explicitly with units.

Respond with strict JSON containing exactly these string fields:
summary, geometry, materials, dimensions, constraints, function, rationale`;

export async function evolveDesignState(input: {
  current: DesignState;
  instruction: string;
  history?: HistoryEntry[];
  constraints?: string | null;
}): Promise<DesignState> {
  // Nothing has been established yet. Merging an edit onto an invented
  // placeholder is exactly what produced the reported bug — the first
  // substantive instruction defines the object from scratch instead.
  if (input.current.summary === UNSET_SUMMARY) {
    return seedDesignState({ brief: input.instruction, constraints: input.constraints });
  }

  // Without a key, record the request honestly rather than silently dropping it.
  const fallback: DesignState = {
    ...input.current,
    rationale: `${input.current.rationale}\n- Requested: "${input.instruction}" (applied without LLM refinement; no LLM provider configured).`,
  };

  const historyText = (input.history ?? [])
    .slice(-12)
    .map((h) => `${h.author}: ${h.body}`)
    .join("\n");

  const user = [
    `CURRENT DESIGN STATE:\n${renderDesignState(input.current)}`,
    `PROJECT MANUFACTURING CONSTRAINTS:\n${input.constraints?.trim() || "none stated"}`,
    historyText ? `RECENT ROOM DISCUSSION:\n${historyText}` : null,
    `CHANGE REQUEST:\n"${input.instruction}"`,
    `Produce the next design state.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const raw = await callLLM(EVOLVE_SYSTEM, user, { json: true, maxTokens: 1600 });
  return parseState(raw, fallback);
}

// ── Clarity check ──

/**
 * Whether an instruction can be acted on as written, or is genuinely
 * ambiguous enough to ask about first. This runs before a job is ever
 * created — an ambiguous instruction produces no GenerationJob at all, only a
 * chat question; nothing is generated until someone picks an option, so this
 * never spends a Meshy call on a guess.
 */
export type ClarityCheck =
  | { clear: true; confirmation: string | null }
  | { clear: false; question: string; options: string[] };

const CLARITY_SYSTEM = `You decide whether a change request for a product under collaborative design is clear enough to act on directly, or genuinely ambiguous.

You receive the CURRENT design state and ONE change request, plus recent room discussion for context.

Default to clear. Most requests are — only flag ambiguity when acting on the request as written would require guessing between genuinely different outcomes (e.g. "make it bigger" on an object with several independently-sized parts, where which part is unstated and the room discussion doesn't settle it). Do not flag ambiguity over a minor detail a reasonable default handles fine (an unspecified exact shade, a vague-but-conventional dimension) — filling those in sensibly is already evolveDesignState's job, not something worth interrupting the room for.

If clear:
Respond with {"clear": true, "confirmation": string | null}. Set "confirmation" only when your reading of the request resolves something a reader might not have caught (a pronoun, an implicit target, a choice between plausible interpretations you picked one of) — one short clause, e.g. "reading 'it' as the handle." Otherwise set it to null; most clear requests need no confirmation at all.

If genuinely ambiguous:
Respond with {"clear": false, "question": string, "options": string[]}. "question" is one short sentence naming the ambiguity. "options" is 2 to 4 complete, concrete, standalone instructions — each one fully replaces the original request if picked, phrased exactly as a user would type it ("Make the handle 15% thicker", not "the handle").

Respond with strict JSON only, one of the two shapes above.`;

function parseClarity(raw: string | null): ClarityCheck {
  const fallback: ClarityCheck = { clear: true, confirmation: null };
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as {
      clear?: unknown;
      confirmation?: unknown;
      question?: unknown;
      options?: unknown;
    };

    if (parsed.clear === false) {
      const question = typeof parsed.question === "string" ? parsed.question.trim() : "";
      const options = Array.isArray(parsed.options)
        ? parsed.options
            .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
            .map((o) => o.trim())
        : [];

      // A malformed "ambiguous" answer is less trustworthy than just
      // proceeding — never block generation on a broken clarity check.
      if (question && options.length >= 2) {
        return { clear: false, question, options: options.slice(0, 4) };
      }
      return fallback;
    }

    const confirmation =
      typeof parsed.confirmation === "string" && parsed.confirmation.trim()
        ? parsed.confirmation.trim()
        : null;
    return { clear: true, confirmation };
  } catch {
    return fallback;
  }
}

export async function checkInstructionClarity(input: {
  current: DesignState;
  instruction: string;
  history?: HistoryEntry[];
}): Promise<ClarityCheck> {
  // The first instruction against an unestablished design defines the object
  // from scratch (see evolveDesignState's placeholder branch) — nothing to
  // disambiguate yet, and seeding already fills gaps with sensible defaults.
  if (input.current.summary === UNSET_SUMMARY) {
    return { clear: true, confirmation: null };
  }

  const historyText = (input.history ?? [])
    .slice(-12)
    .map((h) => `${h.author}: ${h.body}`)
    .join("\n");

  const user = [
    `CURRENT DESIGN STATE:\n${renderDesignState(input.current)}`,
    historyText ? `RECENT ROOM DISCUSSION:\n${historyText}` : null,
    `CHANGE REQUEST:\n"${input.instruction}"`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const raw = await callLLM(CLARITY_SYSTEM, user, { json: true, maxTokens: 400 });
  return parseClarity(raw);
}

// ── Instruction classification ──

export type Strategy = "REGENERATE" | "RETEXTURE";

/**
 * Appearance-only edits can use Meshy's retexture endpoint, which operates on the
 * base version's existing task and therefore preserves geometry exactly. Anything
 * else has to regenerate, which only carries continuity through the design state.
 */
const APPEARANCE_ONLY =
  /\b(colou?r|paint|matte|gloss|satin|finish|texture|anodi[sz]ed|brushed|polished|chrome|wood grain|material look|shade|tint)\b/i;

const GEOMETRY_HINT =
  /\b(thick|thin|long|short|wide|narrow|tall|bigger|smaller|scale|round|fillet|chamfer|move|add|remove|hole|slot|handle|mount|angle|curve|taper|extend|shorten)\b/i;

const CLASSIFY_SYSTEM = `Classify a 3D product change request.

Answer RETEXTURE only if the request changes appearance alone — colour, finish, material look, surface texture — with no change to shape, size, proportion, or features.

Answer REGENERATE for anything affecting geometry.

When uncertain, answer REGENERATE.

Reply with exactly one word: RETEXTURE or REGENERATE.`;

export async function classifyInstruction(instruction: string): Promise<Strategy> {
  const raw = await callLLM(CLASSIFY_SYSTEM, instruction, { maxTokens: 5 });

  if (raw) {
    const answer = raw.toUpperCase();
    if (answer.includes("RETEXTURE")) return "RETEXTURE";
    if (answer.includes("REGENERATE")) return "REGENERATE";
  }

  // Conservative heuristic: appearance words only count when no geometry word
  // is present, so "make the material thicker" still regenerates.
  if (APPEARANCE_ONLY.test(instruction) && !GEOMETRY_HINT.test(instruction)) {
    return "RETEXTURE";
  }
  return "REGENERATE";
}

// ── Prompt projection ──

const PROMPT_SYSTEM = `You write prompts for a text-to-3D generation model.

Given a product's design state, write a single dense visual description of the physical object: form, proportions, key features, materials, finish, colour.

Text-to-3D models default strongly to the ordinary shape for a recognized object
category — a mug defaults to cylindrical, a bottle to round, a plate to circular —
and tend to ignore a single soft adjective that contradicts it. If the geometry
describes a shape that departs from that default for this category (angular,
rectangular, square, flat-sided, faceted, asymmetric, and similar), state the
departure emphatically: put it in the first sentence, describe concretely what
makes it non-default (flat vertical walls, sharp corners, straight edges), and say
plainly what it is NOT ("not round, not cylindrical") rather than mentioning it
once as one adjective among many ordinary descriptors. If the shape is ordinary
for the category, describe it plainly — do not invent a departure nobody asked for.

Constraints:
- One paragraph, under 90 words.
- Describe only what is physically visible. No rationale, no requirements language, no bullet points, no headings.
- Write it as a description of the object itself, not as instructions.

Output only the prompt text.`;

/**
 * Projects the design state down to a prompt Meshy can use. Deliberately lossy —
 * the state remains the record of truth; this is a per-generation rendering.
 */
export async function compileMeshyPrompt(state: DesignState): Promise<string> {
  const raw = await callLLM(PROMPT_SYSTEM, renderDesignState(state), { maxTokens: 200 });
  if (raw) return raw;

  // Deterministic projection: the visually-relevant fields, trimmed.
  return [state.summary, state.geometry, state.materials, state.dimensions]
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 600);
}
