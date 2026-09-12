import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  toDesignStateDTO,
  toJobDTO,
  toMessageDTO,
  toVersionDTO,
} from "@/lib/serialize";

/** GET -> full room snapshot. Clients load this once, then track live events. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    const room = await db.room.findUnique({
      where: { slug },
      include: {
        project: true,
        participants: { orderBy: { joinedAt: "asc" } },
        messages: {
          orderBy: { createdAt: "asc" },
          take: 100,
          include: { participant: true },
        },
        jobs: {
          orderBy: { createdAt: "desc" },
          take: 30,
          include: { author: true },
        },
      },
    });

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const versions = await db.objectVersion.findMany({
      where: { projectId: room.projectId },
      orderBy: { versionNumber: "asc" },
      include: { createdBy: true },
    });

    const head = room.project.headVersionId
      ? await db.versionDescription.findUnique({
          where: { versionId: room.project.headVersionId },
        })
      : null;

    return NextResponse.json({
      room: { slug: room.slug, name: room.name },
      project: {
        id: room.project.id,
        name: room.project.name,
        constraints: room.project.constraints,
        headVersionId: room.project.headVersionId,
      },
      participants: room.participants.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        color: p.color,
        connected: p.connected,
      })),
      messages: room.messages.map(toMessageDTO),
      versions: versions.map(toVersionDTO),
      jobs: room.jobs.map(toJobDTO),
      designState: head ? toDesignStateDTO(head) : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
