import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createInstructionJob } from "@/lib/generation";
import { checkInstructionClarity, type DesignState } from "@/lib/design-state";
import { publishRoomEvent, toMessageDTO } from "@/lib/serialize";

/**
 * POST { sessionId, body, kind } -> { ok }
 *
 * Persist first, then publish — the socket layer is pure fan-out, so a dropped
 * connection can never lose a message. An INSTRUCTION additionally enqueues a
 * generation job pinned to the head version it was authored against — unless
 * the agent's clarity check flags it as ambiguous, in which case a clarifying
 * question is posted instead and no job is created; see
 * `[slug]/messages/[messageId]/answer` for how picking an option resumes this.
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

    const participant = await db.participant.findUnique({
      where: { roomId_sessionId: { roomId: room.id, sessionId } },
    });
    if (!participant) {
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

    // Ground the clarity check in the actual current design, when there is
    // one. No head version (a brand-new/broken project) just falls through to
    // createInstructionJob below, which already 409s on that case.
    const headVersion = room.project.headVersionId
      ? await db.objectVersion.findUnique({
          where: { id: room.project.headVersionId },
          include: { description: true },
        })
      : null;

    if (headVersion?.description) {
      const current: DesignState = {
        summary: headVersion.description.summary,
        geometry: headVersion.description.geometry,
        materials: headVersion.description.materials,
        dimensions: headVersion.description.dimensions,
        constraints: headVersion.description.constraints,
        function: headVersion.description.function,
        rationale: headVersion.description.rationale,
      };

      const recent = await db.chatMessage.findMany({
        where: { roomId: room.id },
        orderBy: { createdAt: "desc" },
        take: 12,
        include: { participant: true },
      });
      const history = recent
        .reverse()
        .map((m) => ({ author: m.participant?.displayName ?? "system", body: m.body }));

      const clarity = await checkInstructionClarity({ current, instruction: text, history });

      if (!clarity.clear) {
        const question = await db.chatMessage.create({
          data: {
            roomId: room.id,
            kind: "AGENT",
            body: clarity.question,
            agentOptions: clarity.options,
          },
          include: { participant: true },
        });
        await publishRoomEvent(slug, { type: "message", message: toMessageDTO(question) });

        // No job — nothing is generated until someone picks an option.
        return NextResponse.json({ ok: true, clarifying: true });
      }

      if (clarity.confirmation) {
        const confirmation = await db.chatMessage.create({
          data: { roomId: room.id, kind: "AGENT", body: clarity.confirmation },
          include: { participant: true },
        });
        await publishRoomEvent(slug, {
          type: "message",
          message: toMessageDTO(confirmation),
        });
      }
    }

    try {
      const job = await createInstructionJob({
        roomId: room.id,
        roomSlug: slug,
        projectId: room.projectId,
        headVersionId: room.project.headVersionId,
        participantId: participant.id,
        messageId: message.id,
        instruction: text,
      });
      return NextResponse.json({ ok: true, jobId: job.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not start generation";
      return NextResponse.json({ error: msg }, { status: 409 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
