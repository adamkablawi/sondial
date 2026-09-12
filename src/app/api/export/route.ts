import { NextResponse } from "next/server";

/**
 * Export endpoint — returns model download info.
 * In production, this would fetch the model from storage (S3/R2)
 * and return a signed download URL or stream the file directly.
 */
export async function POST(request: Request) {
  try {
    const { modelUrl, format } = await request.json();

    if (!modelUrl) {
      return NextResponse.json({ error: "modelUrl is required" }, { status: 400 });
    }

    // In mock mode, just return the same URL
    // In production, this would convert to the requested format and return a download URL
    return NextResponse.json({
      downloadUrl: modelUrl,
      format: format ?? "glb",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
