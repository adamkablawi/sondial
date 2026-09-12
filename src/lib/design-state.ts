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
 * Every function degrades to a deterministic non-LLM path when OPENAI_API_KEY is
 * absent, so the whole pipeline runs with no API keys at all.
 */

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

// ── OpenAI plumbing ──

async function callOpenAI(
  system: string,
  user: string,
  opts: { json?: boolean; model?: string; maxTokens?: number } = {},
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model ?? "gpt-4o-mini",
        temperature: 0.4,
        max_tokens: opts.maxTokens ?? 1200,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!response.ok) {
      console.error("[design-state] OpenAI error:", response.status, await response.text());
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    console.error("[design-state] OpenAI call failed:", err);
    return null;
  }
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
  const fallback: DesignState = {
    ...EMPTY,
    summary: input.brief,
    geometry: input.brief,
    constraints: input.constraints?.trim() || EMPTY.constraints,
    rationale: "Seeded directly from the initial brief.",
  };

  const raw = await callOpenAI(
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
  // Without a key, record the request honestly rather than silently dropping it.
  const fallback: DesignState = {
    ...input.current,
    rationale: `${input.current.rationale}\n- Requested: "${input.instruction}" (applied without LLM refinement; OPENAI_API_KEY not set).`,
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

  const raw = await callOpenAI(EVOLVE_SYSTEM, user, { json: true, maxTokens: 1600 });
  return parseState(raw, fallback);
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
  const raw = await callOpenAI(CLASSIFY_SYSTEM, instruction, { maxTokens: 5 });

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
  const raw = await callOpenAI(PROMPT_SYSTEM, renderDesignState(state), { maxTokens: 200 });
  if (raw) return raw;

  // Deterministic projection: the visually-relevant fields, trimmed.
  return [state.summary, state.geometry, state.materials, state.dimensions]
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 600);
}
