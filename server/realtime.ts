import "./env";
import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { db } from "../src/lib/db";
import { createSubscriber, publisher } from "../src/lib/redis";
import { ROOM_CHANNEL_PREFIX, SOCKET_EVENTS, roomChannel } from "../src/lib/events";
import type { JoinPayload, ParticipantDTO, RoomEvent } from "../src/lib/events";

/**
 * Socket.IO fan-out server.
 *
 * Runs as its own process rather than a custom Next server, so `next dev` keeps
 * its Turbopack path untouched. It is a pure subscriber: every event reaches it
 * through Redis, whether published by an API route, the worker, or this server's
 * own presence tracking. Clients never write state through the socket.
 */

const PORT = Number(process.env.REALTIME_PORT ?? 3001);

const http = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "sondial-realtime" }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(http, {
  cors: { origin: true, credentials: true },
});

async function publishPresence(roomSlug: string): Promise<void> {
  const room = await db.room.findUnique({
    where: { slug: roomSlug },
    include: { participants: { orderBy: { joinedAt: "asc" } } },
  });
  if (!room) return;

  const participants: ParticipantDTO[] = room.participants.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    color: p.color,
    connected: p.connected,
  }));

  const event: RoomEvent = { type: "presence", participants };
  await publisher.publish(roomChannel(roomSlug), JSON.stringify(event));
}

io.on("connection", (socket: Socket) => {
  // Tracked so disconnect can flip the right participant offline.
  let joined: { roomSlug: string; participantId: string } | null = null;

  socket.on(SOCKET_EVENTS.join, async (payload: JoinPayload) => {
    if (!payload?.roomSlug || !payload?.sessionId) return;

    const room = await db.room.findUnique({ where: { slug: payload.roomSlug } });
    if (!room) return;

    const participant = await db.participant.findUnique({
      where: {
        roomId_sessionId: { roomId: room.id, sessionId: payload.sessionId },
      },
    });
    if (!participant) return;

    joined = { roomSlug: payload.roomSlug, participantId: participant.id };
    socket.join(payload.roomSlug);

    await db.participant.update({
      where: { id: participant.id },
      data: { connected: true, lastSeenAt: new Date() },
    });
    await publishPresence(payload.roomSlug);
  });

  socket.on("disconnect", async () => {
    if (!joined) return;
    await db.participant.update({
      where: { id: joined.participantId },
      data: { connected: false, lastSeenAt: new Date() },
    });
    await publishPresence(joined.roomSlug);
  });
});

async function main() {
  const subscriber = createSubscriber();
  await subscriber.psubscribe(`${ROOM_CHANNEL_PREFIX}*`);

  subscriber.on("pmessage", (_pattern: string, channel: string, message: string) => {
    const roomSlug = channel.slice(ROOM_CHANNEL_PREFIX.length);
    try {
      io.to(roomSlug).emit(SOCKET_EVENTS.event, JSON.parse(message) as RoomEvent);
    } catch (err) {
      console.error("[realtime] bad event payload on", channel, err);
    }
  });

  http.listen(PORT, () => {
    console.log(`[realtime] listening on :${PORT}`);
  });
}

main().catch((err) => {
  console.error("[realtime] fatal:", err);
  process.exit(1);
});
