import type { LlmProvider, LlmMessage } from "../types";

/**
 * Keyless LLM stand-in. Echoes the user's own words back in brief-ish form so
 * the pipeline shape is identical with or without an API key.
 */
export class MockLlmProvider implements LlmProvider {
  readonly name = "mock";

  async complete(messages: LlmMessage[]): Promise<string> {
    const last = [...messages].reverse().find((m) => m.role === "user");
    const text = last?.content ?? "An object.";
    // Pull the quoted payload out of our own prompt templates when present.
    const quoted = [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const subject = quoted.length ? quoted.join(", now ") : text;
    return `${subject}. Rendered as a single solid form with clean proportions, a matte finish, and softly chamfered edges.`;
  }

  async describeImage(_imageBase64: string, instruction: string): Promise<string> {
    return this.complete([{ role: "user", content: instruction }]);
  }
}
