import { NextResponse } from "next/server";
import { meshProvider } from "@/providers";

export async function POST(request: Request) {
  try {
    const { image, prompt, format } = await request.json();

    if (!image && !prompt) {
      return NextResponse.json(
        { error: "Either 'image' (base64) or 'prompt' (text) is required" },
        { status: 400 },
      );
    }

    const { jobId } = await meshProvider.generateMesh({ image, prompt, format });

    return NextResponse.json({ jobId, provider: meshProvider.name });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
