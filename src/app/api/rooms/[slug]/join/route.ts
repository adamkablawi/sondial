import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { participantColor } from "@/lib/identity";
import { publishRoomEvent } from "@/lib/serialize";
import type { ParticipantDTO } from "@/lib/events";

/**
 * POST { displayName, sessionId? } -> { participant, sessionId }
 *
 * A returning sessionId keeps the participant's identity so attribution on past
 * messages and versions survives a reload.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const { displayName, sessionId } = (await request.json()) as {
      displayName?: string;
      sessionId?: string;
    };

    const trimmed = displayName?.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "'displayName' is required" }, { status: 400 });
    }

    const room = await db.room.findUnique({
      where: { slug },
      include: { _count: { select: { participants: true } } },
    });
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const existing = sessionId
      ? await db.participant.findUnique({ where: { sessionId } })
      : null;

    const participant =
      existing && existing.roomId === room.id
        ? await db.participant.update({
            where: { id: existing.id },
            data: { displayName: trimmed, connected: true, lastSeenAt: new Date() },
          })
        : await db.participant.create({
            data: {
              roomId: room.id,
              displayName: trimmed,
              sessionId: randomUUID(),
              color: participantColor(room._count.participants),
            },
          });

    const all = await db.participant.findMany({
      where: { roomId: room.id },
      orderBy: { joinedAt: "asc" },
    });

    const participants: ParticipantDTO[] = all.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      color: p.color,
      connected: p.connected,
    }));

    await publishRoomEvent(slug, { type: "presence", participants });

    return NextResponse.json({
      sessionId: participant.sessionId,
      participant: {
        id: participant.id,
        displayName: participant.displayName,
        color: participant.color,
        connected: participant.connected,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
