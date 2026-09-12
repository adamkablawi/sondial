import type { LlmProvider, LlmMessage } from "../types";

const BASE = process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com/v1";
const API_VERSION = "2023-06-01";

/**
 * Anthropic Claude provider.
 *
 * Differs from the OpenAI-compatible shape in two ways that matter here:
 *   1. the system prompt is a top-level `system` field, not a message role, so
 *      any `role: "system"` entries are hoisted out;
 *   2. images are `{type:"image", source:{type:"base64", media_type, data}}`
 *      rather than `image_url`.
 *
 * Every Claude model in the Messages API accepts image input, so unlike the
 * Grok provider there is no vision fallback latch to maintain.
 */
export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";

  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY ?? "";
    this.model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
    if (!this.apiKey) {
      console.warn("[anthropic] ANTHROPIC_API_KEY not set — calls will fail.");
    }
  }

  private async send(
    system: string | undefined,
    messages: unknown[],
    opts?: { maxTokens?: number; temperature?: number },
  ): Promise<string> {
    const response = await fetch(`${BASE}/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": API_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        ...(system ? { system } : {}),
        messages,
        max_tokens: opts?.maxTokens ?? 400,
        temperature: opts?.temperature ?? 0.5,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      const err = new Error(`Anthropic ${this.model} failed: ${response.status} ${text}`);
      (err as Error & { status?: number }).status = response.status;
      throw err;
    }

    const data = await response.json();
    // Content is a list of blocks; concatenate the text ones.
    const text = (data.content ?? [])
      .filter((b: { type?: string }) => b.type === "text")
      .map((b: { text?: string }) => b.text ?? "")
      .join("")
      .trim();
    if (!text) throw new Error(`Anthropic ${this.model} returned an empty completion.`);
    return text;
  }

  async complete(messages: LlmMessage[], opts?: { maxTokens?: number; temperature?: number }): Promise<string> {
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");

    const turns = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    // The Messages API requires at least one turn and rejects a leading
    // assistant message; a system-only call is a real possibility here.
    if (turns.length === 0 || turns[0].role !== "user") {
      turns.unshift({ role: "user", content: "Proceed." });
    }

    return this.send(system || undefined, turns, opts);
  }

  async describeImage(
    imageBase64: string,
    instruction: string,
    opts?: { maxTokens?: number; temperature?: number },
  ): Promise<string> {
    const mediaType = imageBase64.startsWith("/9j/")
      ? "image/jpeg"
      : imageBase64.startsWith("iVBOR")
        ? "image/png"
        : imageBase64.startsWith("R0lGOD")
          ? "image/gif"
          : imageBase64.startsWith("UklGR")
            ? "image/webp"
            : "image/jpeg";

    return this.send(
      undefined,
      [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: instruction },
          ],
        },
      ],
      opts,
    );
  }
}
