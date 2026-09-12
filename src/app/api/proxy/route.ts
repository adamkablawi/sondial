import { NextRequest, NextResponse } from "next/server";

/**
 * Proxies external model file downloads to avoid CORS issues.
 * Usage: GET /api/proxy?url=<encoded-url>
 */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "url query parameter is required" }, { status: 400 });
  }

  try {
    const upstream = await fetch(url);

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream fetch failed: ${upstream.status}` },
        { status: upstream.status },
      );
    }

    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";

    // Stream the response body instead of buffering it — avoids Vercel's
    // 4.5 MB response body limit and reduces memory usage for large model files.
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Proxy fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
