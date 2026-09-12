import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { participantColor } from "@/lib/identity";
import { publishRoomEvent } from "@/lib/serialize";
import type { ParticipantDTO } from "@/lib/events";

/**
 * POST { displayName, sessionId? } -> { participant, sessionId }
 *
 * Idempotent: the same session joining the same room twice updates one row
 * rather than creating a second participant. The client keeps one session token
 * for life, so attribution on past messages and versions survives a reload and
 * carries across rooms.
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

    const token = sessionId?.trim() || randomUUID();
    const key = { roomId_sessionId: { roomId: room.id, sessionId: token } };

    let participant;
    try {
      participant = await db.participant.upsert({
        where: key,
        update: { displayName: trimmed, connected: true, lastSeenAt: new Date() },
        create: {
          roomId: room.id,
          sessionId: token,
          displayName: trimmed,
          color: participantColor(room._count.participants),
        },
      });
    } catch (err) {
      // Two simultaneous joins can both miss the row and race to insert it.
      // The loser reads back the winner's row instead of failing the join.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        participant = await db.participant.findUniqueOrThrow({ where: key });
      } else {
        throw err;
      }
    }

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
