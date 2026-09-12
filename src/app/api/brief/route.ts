import { NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are a product design brief writer. Given an image and/or a text description of a 3D object, write a concise formal design brief (2–4 sentences) that describes:
- What the object is
- Its key form, shape, and proportions
- Materials, finish, and colour
- Any notable design features or style

The brief will be used as a living document that guides AI image and 3D mesh generation. Be specific and visual. Output only the brief text, nothing else.`;

/**
 * POST { image?: string (base64, no prefix), prompt?: string }
 * → { brief: string }
 *
 * Uses GPT-4o vision when an image is supplied, GPT-4o-mini for text only.
 * Falls back to the raw prompt when no OPENAI_API_KEY is set.
 */
export async function POST(request: Request) {
  try {
    const { image, prompt } = (await request.json()) as {
      image?: string;
      prompt?: string;
    };

    if (!image && !prompt) {
      return NextResponse.json({ error: "image or prompt required" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    // No key — return the raw prompt as-is (mock / no-key mode)
    if (!apiKey) {
      return NextResponse.json({ brief: prompt ?? "A 3D object." });
    }

    // Build user message content — use vision when image is provided
    type ContentPart =
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail: "high" } };

    const contentParts: ContentPart[] = [];

    if (image) {
      // Detect format from base64 header or default to jpeg
      const mimeType = image.startsWith("/9j/") ? "image/jpeg"
        : image.startsWith("iVBOR") ? "image/png"
        : image.startsWith("PHN2Z") ? "image/svg+xml"
        : "image/jpeg";

      contentParts.push({
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${image}`, detail: "high" },
      });
    }

    contentParts.push({
      type: "text",
      text: image && prompt
        ? `Write a design brief for the object shown in this image. The user also described it as: "${prompt}". Incorporate both.`
        : image
        ? "Write a design brief for the object shown in this image."
        : `Write a design brief for this object: "${prompt}"`,
    });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: image ? "gpt-4o" : "gpt-4o-mini",
        temperature: 0.5,
        max_tokens: 200,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: contentParts },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[brief] OpenAI error:", response.status, text);
      // Degrade gracefully
      return NextResponse.json({ brief: prompt ?? "A 3D object." });
    }

    const data = await response.json();
    const brief = data.choices?.[0]?.message?.content?.trim() ?? prompt ?? "A 3D object.";

    return NextResponse.json({ brief });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
