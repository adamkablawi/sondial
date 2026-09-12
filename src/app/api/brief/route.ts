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
 * Uses Gemini — natively multimodal, so the same model handles both the
 * image and text-only cases, unlike the GPT-4o/GPT-4o-mini split this route
 * used previously. Falls back to the raw prompt when no GEMINI_API_KEY is set.
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

    const apiKey = process.env.GEMINI_API_KEY;

    // No key — return the raw prompt as-is (mock / no-key mode)
    if (!apiKey) {
      return NextResponse.json({ brief: prompt ?? "A 3D object." });
    }

    // Build the content parts — an inline image part when one is supplied,
    // always followed by a text part.
    type ContentPart =
      | { text: string }
      | { inline_data: { mime_type: string; data: string } };

    const contentParts: ContentPart[] = [];

    if (image) {
      // Detect format from base64 header or default to jpeg
      const mimeType = image.startsWith("/9j/") ? "image/jpeg"
        : image.startsWith("iVBOR") ? "image/png"
        : image.startsWith("PHN2Z") ? "image/svg+xml"
        : "image/jpeg";

      contentParts.push({ inline_data: { mime_type: mimeType, data: image } });
    }

    contentParts.push({
      text: image && prompt
        ? `Write a design brief for the object shown in this image. The user also described it as: "${prompt}". Incorporate both.`
        : image
        ? "Write a design brief for the object shown in this image."
        : `Write a design brief for this object: "${prompt}"`,
    });

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
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ parts: contentParts }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 200 },
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("[brief] Gemini error:", response.status, text);
      // Degrade gracefully
      return NextResponse.json({ brief: prompt ?? "A 3D object." });
    }

    const data = await response.json();
    const brief =
      (data.candidates?.[0]?.content?.parts ?? [])
        .map((p: { text?: string }) => p.text ?? "")
        .join("")
        .trim() || prompt || "A 3D object.";

    return NextResponse.json({ brief });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
