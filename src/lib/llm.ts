/**
 * Text-completion plumbing for the design-state layer.
 *
 * One entry point, `callLLM`, selected by `LLM_PROVIDER`. It follows the same
 * contract every provider in this repo follows: **it never throws, and it
 * returns `null` whenever a completion could not be obtained** — no key, a
 * bad response, a network failure. Callers treat `null` as "fall back to the
 * deterministic non-LLM path", which is what keeps the whole pipeline
 * exercisable with zero API keys.
 *
 * Vision lives in `src/providers/`; this file is deliberately text-only,
 * because design state is text-only.
 */

export type LlmProviderName = "anthropic" | "openai" | "mock";

export interface LlmCallOptions {
  /** Ask for strict JSON. Enforced natively on OpenAI, by prefill on Anthropic. */
  json?: boolean;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Which provider to use. Defaults to whichever key is present so that a
 * developer who sets only ANTHROPIC_API_KEY gets real completions without
 * also having to remember a second variable.
 */
export function resolveLlmProvider(): LlmProviderName {
  const explicit = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (explicit === "anthropic" || explicit === "openai" || explicit === "mock") {
    return explicit;
  }
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "mock";
}

// ── Anthropic ──

const ANTHROPIC_BASE = process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

async function callAnthropic(
  system: string,
  user: string,
  opts: LlmCallOptions,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  // The Messages API has no `response_format`. The reliable equivalent is to
  // prefill the assistant turn with an opening brace: the model can only
  // continue a JSON object from there. The brace is stripped from the reply,
  // so it must be added back before parsing.
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    { role: "user", content: user },
  ];
  if (opts.json) messages.push({ role: "assistant", content: "{" });

  try {
    const response = await fetch(`${ANTHROPIC_BASE}/messages`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
        system,
        messages,
        max_tokens: opts.maxTokens ?? 1200,
        temperature: opts.temperature ?? 0.4,
      }),
    });

    if (!response.ok) {
      console.error("[llm] Anthropic error:", response.status, await response.text());
      return null;
    }

    const data = await response.json();
    const text = (data.content ?? [])
      .filter((b: { type?: string }) => b.type === "text")
      .map((b: { text?: string }) => b.text ?? "")
      .join("")
      .trim();

    if (!text) return null;
    return opts.json ? `{${text}` : text;
  } catch (err) {
    console.error("[llm] Anthropic call failed:", err);
    return null;
  }
}

// ── OpenAI ──

async function callOpenAI(
  system: string,
  user: string,
  opts: LlmCallOptions,
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
        model: opts.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.maxTokens ?? 1200,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!response.ok) {
      console.error("[llm] OpenAI error:", response.status, await response.text());
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    console.error("[llm] OpenAI call failed:", err);
    return null;
  }
}

// ── Entry point ──

export async function callLLM(
  system: string,
  user: string,
  opts: LlmCallOptions = {},
): Promise<string | null> {
  switch (resolveLlmProvider()) {
    case "anthropic":
      return callAnthropic(system, user, opts);
    case "openai":
      return callOpenAI(system, user, opts);
    case "mock":
      // Not an error: the deterministic paths in design-state.ts are the
      // intended behaviour with no provider configured.
      return null;
  }
}
