import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createInstructionJob } from "@/lib/generation";
import { publishRoomEvent, toMessageDTO } from "@/lib/serialize";

/**
 * POST { sessionId, optionIndex } -> { ok, jobId }
 *
 * Answers an AGENT clarifying question: the chosen option becomes a fresh
 * INSTRUCTION message, which is what actually creates and enqueues the job —
 * a clarifying question alone never does.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string; messageId: string }> },
) {
  try {
    const { slug, messageId } = await params;
    const { sessionId, optionIndex } = (await request.json()) as {
      sessionId?: string;
      optionIndex?: number;
    };

    if (!sessionId || typeof optionIndex !== "number") {
      return NextResponse.json(
        { error: "'sessionId' and 'optionIndex' are required" },
        { status: 400 },
      );
    }

    const room = await db.room.findUnique({ where: { slug }, include: { project: true } });
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const participant = await db.participant.findUnique({
      where: { roomId_sessionId: { roomId: room.id, sessionId } },
    });
    if (!participant) {
      return NextResponse.json({ error: "Not a participant of this room" }, { status: 403 });
    }

    const question = await db.chatMessage.findUnique({ where: { id: messageId } });
    if (!question || question.roomId !== room.id || question.kind !== "AGENT") {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }
    const chosen = question.agentOptions[optionIndex];
    if (!chosen) {
      return NextResponse.json({ error: "Invalid option" }, { status: 400 });
    }

    // Conditional update: only succeeds if still unanswered, so two people
    // picking different options on the same question at once can't both win.
    const claim = await db.chatMessage.updateMany({
      where: { id: messageId, answeredOptionIndex: null },
      data: { answeredOptionIndex: optionIndex, answeredByName: participant.displayName },
    });
    if (claim.count === 0) {
      return NextResponse.json({ error: "This question was already answered" }, { status: 409 });
    }

    const updated = await db.chatMessage.findUniqueOrThrow({
      where: { id: messageId },
      include: { participant: true },
    });
    await publishRoomEvent(slug, { type: "message", message: toMessageDTO(updated) });

    const instructionMessage = await db.chatMessage.create({
      data: {
        roomId: room.id,
        participantId: participant.id,
        kind: "INSTRUCTION",
        body: chosen,
      },
      include: { participant: true },
    });
    await publishRoomEvent(slug, {
      type: "message",
      message: toMessageDTO(instructionMessage),
    });

    const job = await createInstructionJob({
      roomId: room.id,
      roomSlug: slug,
      projectId: room.projectId,
      headVersionId: room.project.headVersionId,
      participantId: participant.id,
      messageId: instructionMessage.id,
      instruction: chosen,
    });

    return NextResponse.json({ ok: true, jobId: job.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
