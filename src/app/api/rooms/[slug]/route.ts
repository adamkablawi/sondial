import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  publishRoomEvent,
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

/**
 * DELETE { sessionId? } -> { ok }
 *
 * Permanently removes the room and everything attached to it: chat, jobs,
 * versions, and design-state history. There is no undo.
 *
 * Order matters. GenerationJob.baseVersion is a required relation, so jobs must
 * go before versions or Postgres refuses the delete; and ObjectVersion.parentId
 * is self-referential, so lineage links are broken first rather than relying on
 * cascade ordering within one statement.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;

    const body = (await request.json().catch(() => ({}))) as { sessionId?: string };

    const room = await db.room.findUnique({ where: { slug } });
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    // Resolve who is closing it before the row disappears.
    const closer = body.sessionId
      ? await db.participant.findUnique({
          where: { roomId_sessionId: { roomId: room.id, sessionId: body.sessionId } },
        })
      : null;

    await db.$transaction(async (tx) => {
      await tx.generationJob.deleteMany({ where: { projectId: room.projectId } });
      await tx.project.update({
        where: { id: room.projectId },
        data: { headVersionId: null },
      });
      await tx.objectVersion.updateMany({
        where: { projectId: room.projectId },
        data: { parentId: null },
      });
      await tx.objectVersion.deleteMany({ where: { projectId: room.projectId } });
      // Cascades to the room, its participants and its messages.
      await tx.project.delete({ where: { id: room.projectId } });
    });

    await publishRoomEvent(slug, {
      type: "closed",
      by: closer?.displayName ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
