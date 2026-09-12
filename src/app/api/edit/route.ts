import { NextResponse } from "next/server";

/**
 * Merges a current model description with an edit instruction to produce
 * a new image generation prompt.
 *
 * Uses Gemini when GEMINI_API_KEY is set; falls back to simple string concat.
 */
async function mergePrompt(
  description: string | null,
  instruction: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey && description) {
    try {
      const model = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "x-goog-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text: "You are a product design brief writer. Given a current design brief for a 3D object and an edit instruction, produce an updated brief that incorporates the edit. The brief should be 2–4 sentences describing the object's form, materials, finish, colour, and key features — specific enough to guide AI image generation. Output only the updated brief, nothing else.",
                },
              ],
            },
            contents: [
              {
                parts: [
                  {
                    text: `Current description: "${description}"\nEdit instruction: "${instruction}"\n\nNew description:`,
                  },
                ],
              },
            ],
            generationConfig: { temperature: 0.7 },
          }),
        },
      );

      if (response.ok) {
        const data = await response.json();
        const newPrompt = (data.candidates?.[0]?.content?.parts ?? [])
          .map((p: { text?: string }) => p.text ?? "")
          .join("")
          .trim();
        if (newPrompt) return newPrompt;
      }
    } catch {
      // fall through to simple concat
    }
  }

  // Fallback: simple concat
  if (description) {
    return `${description}, but ${instruction}`;
  }
  return instruction;
}

export async function POST(request: Request) {
  try {
    const { description, instruction } = (await request.json()) as {
      description: string | null;
      instruction: string;
    };

    if (!instruction) {
      return NextResponse.json({ error: "instruction is required" }, { status: 400 });
    }

    const newPrompt = await mergePrompt(description, instruction);

    return NextResponse.json({ newPrompt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
