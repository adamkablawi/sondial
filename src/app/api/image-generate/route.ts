import { NextResponse } from "next/server";
import { imageProvider } from "@/providers";

export const maxDuration = 60; // seconds (requires Vercel Pro for >10s)

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: "'prompt' is required" }, { status: 400 });
    }

    const { imageDataUrl } = await imageProvider.generateImage(prompt);

    return NextResponse.json({ imageDataUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
