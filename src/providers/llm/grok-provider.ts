import type { LlmProvider, LlmMessage } from "../types";

const XAI_BASE = process.env.XAI_BASE_URL ?? "https://api.x.ai/v1";

/**
 * xAI Grok provider. The API is OpenAI-compatible, so the chat/completions
 * message shape — including multimodal `content` part arrays — carries over
 * unchanged.
 *
 * Model ids are env-driven rather than hardcoded: xAI's published model list
 * moves, and which chat models accept image input is not stable. Run
 * `npm run verify:grok` to see what the current key can actually reach.
 */
export class GrokProvider implements LlmProvider {
  readonly name = "grok";

  private apiKey: string;
  private textModel: string;
  private visionModel: string;
  /** Latches on once vision is proven unavailable, so we stop paying for retries. */
  private visionDisabled = false;

  constructor() {
    this.apiKey = process.env.XAI_API_KEY ?? "";
    this.textModel = process.env.GROK_TEXT_MODEL ?? "grok-4.6";
    this.visionModel = process.env.GROK_VISION_MODEL ?? this.textModel;
    if (!this.apiKey) {
      console.warn("[grok] XAI_API_KEY not set — calls will fail.");
    }
  }

  private async chat(model: string, messages: unknown[], opts?: { maxTokens?: number; temperature?: number }) {
    const response = await fetch(`${XAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: opts?.temperature ?? 0.5,
        max_tokens: opts?.maxTokens ?? 400,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      const err = new Error(`Grok ${model} failed: ${response.status} ${text}`);
      (err as Error & { status?: number }).status = response.status;
      throw err;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error(`Grok ${model} returned an empty completion.`);
    return content as string;
  }

  async complete(messages: LlmMessage[], opts?: { maxTokens?: number; temperature?: number }): Promise<string> {
    return this.chat(this.textModel, messages, opts);
  }

  async describeImage(
    imageBase64: string,
    instruction: string,
    opts?: { maxTokens?: number; temperature?: number },
  ): Promise<string> {
    if (!this.visionDisabled) {
      // Sniff the container from the base64 magic bytes; Meshy and xAI both
      // only accept jpeg/png, so anything else is worth failing loudly on.
      const mime = imageBase64.startsWith("/9j/")
        ? "image/jpeg"
        : imageBase64.startsWith("iVBOR")
          ? "image/png"
          : "image/jpeg";

      try {
        return await this.chat(
          this.visionModel,
          [
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: `data:${mime};base64,${imageBase64}`, detail: "high" } },
                { type: "text", text: instruction },
              ],
            },
          ],
          opts,
        );
      } catch (err) {
        // A model that cannot see images answers 400/404/422. Degrade to
        // text-only rather than failing the whole generation.
        const status = (err as Error & { status?: number }).status;
        if (status && status >= 400 && status < 500) {
          console.warn(
            `[grok] vision model "${this.visionModel}" rejected image input (${status}); ` +
              `falling back to text-only for the rest of this process.`,
          );
          this.visionDisabled = true;
        } else {
          throw err;
        }
      }
    }

    return this.complete([{ role: "user", content: instruction }], opts);
  }
}
