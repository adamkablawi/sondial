import { NextResponse } from "next/server";

/**
 * Merges a current model description with an edit instruction to produce
 * a new image generation prompt.
 *
 * Uses OpenAI GPT when OPENAI_API_KEY is set; falls back to simple string concat.
 */
async function mergePrompt(
  description: string | null,
  instruction: string,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey && description) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.7,
          messages: [
            {
              role: "system",
              content:
                "You are a product design brief writer. Given a current design brief for a 3D object and an edit instruction, produce an updated brief that incorporates the edit. The brief should be 2–4 sentences describing the object's form, materials, finish, colour, and key features — specific enough to guide AI image generation. Output only the updated brief, nothing else.",
            },
            {
              role: "user",
              content: `Current description: "${description}"\nEdit instruction: "${instruction}"\n\nNew description:`,
            },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const newPrompt = data.choices?.[0]?.message?.content?.trim();
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
