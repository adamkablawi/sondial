import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Serves the vendor-rendered still for a version.
 *
 * Versions are immutable, so the bytes at a given id never change and can be
 * cached indefinitely.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const version = await db.objectVersion.findUnique({
    where: { id },
    select: { previewImage: true, previewMimetype: true },
  });

  if (!version?.previewImage) {
    return NextResponse.json({ error: "No preview for this version" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(version.previewImage), {
    headers: {
      "Content-Type": version.previewMimetype ?? "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
