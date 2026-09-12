import { NextRequest, NextResponse } from "next/server";
import { pickOutput } from "@/providers/mesh-generation/zoo-provider";

/**
 * Serves the geometry from a Zoo Text-to-CAD record.
 *
 * Zoo returns outputs base64-encoded inside the record rather than as a public
 * URL, and the record is behind the account's API key — so the bytes cannot be
 * handed to the browser (or to Scene Viewer) as a Zoo link. This route is the
 * public face of them, and the only place the key is used.
 *
 * GET /api/zoo/mesh/<record id>
 */
export const maxDuration = 60;

const ZOO_API_BASE = process.env.ZOO_API_BASE ?? "https://api.zoo.dev";

const CONTENT_TYPES: Record<string, string> = {
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  obj: "text/plain",
  stl: "model/stl",
};

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const apiKey = process.env.ZOO_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ZOO_API_KEY is not configured" }, { status: 503 });
  }

  try {
    const res = await fetch(`${ZOO_API_BASE}/user/text-to-cad/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Zoo record fetch failed: ${res.status}` },
        { status: res.status },
      );
    }

    const record = (await res.json()) as { outputs?: Record<string, string> };
    const chosen = pickOutput(record.outputs);

    if (!chosen || !record.outputs) {
      return NextResponse.json({ error: "Record has no renderable output" }, { status: 404 });
    }

    const bytes = Buffer.from(record.outputs[chosen.name], "base64");
    const ext = chosen.name.split(".").pop()?.toLowerCase() ?? "glb";

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        // Records are immutable once complete, so this is safe to cache hard.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Zoo mesh fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
