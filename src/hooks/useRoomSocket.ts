"use client";

import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { SOCKET_EVENTS, type RoomEvent } from "@/lib/events";
import { useRoomStore } from "@/stores/room-store";

/**
 * Subscribes to the room's live event stream.
 *
 * Read-only by design: the client POSTs to persist, and only ever receives here.
 * On reconnect it re-fetches the snapshot, so anything missed while offline is
 * recovered from Postgres rather than assumed lost.
 */
export function useRoomSocket(slug: string | null, sessionId: string | null) {
  const applyEvent = useRoomStore((s) => s.applyEvent);
  const hydrate = useRoomStore((s) => s.hydrate);
  const setConnected = useRoomStore((s) => s.setConnected);

  useEffect(() => {
    if (!slug || !sessionId) return;

    const url = process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:3001";
    const socket: Socket = io(url, { transports: ["websocket", "polling"] });

    const join = () => socket.emit(SOCKET_EVENTS.join, { roomSlug: slug, sessionId });

    const resync = async () => {
      try {
        const res = await fetch(`/api/rooms/${slug}`);
        if (res.ok) hydrate(await res.json());
      } catch {
        // A failed resync leaves the last known state on screen; the next
        // reconnect will try again.
      }
    };

    socket.on("connect", () => {
      setConnected(true);
      join();
      void resync();
    });

    socket.on("disconnect", () => setConnected(false));

    socket.on(SOCKET_EVENTS.event, (event: RoomEvent) => applyEvent(event));

    return () => {
      socket.disconnect();
      setConnected(false);
    };
  }, [slug, sessionId, applyEvent, hydrate, setConnected]);
}
