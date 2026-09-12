import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generationQueue } from "@/lib/queue";
import { publishRoomEvent, toJobDTO, toMessageDTO } from "@/lib/serialize";

/**
 * POST { sessionId, body, kind } -> { ok }
 *
 * Persist first, then publish — the socket layer is pure fan-out, so a dropped
 * connection can never lose a message. An INSTRUCTION additionally enqueues a
 * generation job pinned to the head version it was authored against.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const { sessionId, body, kind } = (await request.json()) as {
      sessionId?: string;
      body?: string;
      kind?: "CHAT" | "INSTRUCTION";
    };

    const text = body?.trim();
    if (!sessionId || !text) {
      return NextResponse.json(
        { error: "'sessionId' and 'body' are required" },
        { status: 400 },
      );
    }

    const messageKind = kind === "INSTRUCTION" ? "INSTRUCTION" : "CHAT";

    const room = await db.room.findUnique({
      where: { slug },
      include: { project: true },
    });
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const participant = await db.participant.findUnique({ where: { sessionId } });
    if (!participant || participant.roomId !== room.id) {
      return NextResponse.json({ error: "Not a participant of this room" }, { status: 403 });
    }

    const message = await db.chatMessage.create({
      data: {
        roomId: room.id,
        participantId: participant.id,
        kind: messageKind,
        body: text,
      },
      include: { participant: true },
    });

    await publishRoomEvent(slug, { type: "message", message: toMessageDTO(message) });

    if (messageKind !== "INSTRUCTION") {
      return NextResponse.json({ ok: true });
    }

    const baseVersionId = room.project.headVersionId;
    if (!baseVersionId) {
      return NextResponse.json(
        { error: "Project has no base version to iterate from" },
        { status: 409 },
      );
    }

    const job = await db.generationJob.create({
      data: {
        roomId: room.id,
        projectId: room.projectId,
        baseVersionId,
        messageId: message.id,
        authorId: participant.id,
        instruction: text,
      },
      include: { author: true },
    });

    await generationQueue.add("generate", { jobId: job.id, roomSlug: slug });
    await publishRoomEvent(slug, { type: "job", job: toJobDTO(job) });

    return NextResponse.json({ ok: true, jobId: job.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
