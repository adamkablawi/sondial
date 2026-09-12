"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase, ensureSignedIn } from "@/lib/supabase/client";
import { getDisplayName, hueFor } from "@/lib/identity";
import type { Room, Version } from "@/lib/types";

export interface Peer {
  userId: string;
  name: string;
  hue: number;
}

export interface RoomState {
  room: Room;
  versions: Version[];
  peers: Peer[];
  userId: string | null;
  /** The version the room is currently pointing at, if it has a model. */
  current: Version | null;
  /** The newest still-generating version, if any. */
  pending: Version | null;
  submit: (instruction: string, parentId: string | null) => Promise<void>;
  connected: boolean;
}

const byCreatedAt = (a: Version, b: Version) =>
  new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

/**
 * Subscribes a room to Realtime and keeps versions, the room pointer, and
 * presence in sync.
 *
 * Realtime is treated as an optimisation, never as the source of truth: on
 * every (re)subscribe we refetch from Postgres, so a dropped websocket on
 * conference wifi self-heals instead of silently showing stale state.
 */
export function useRoom(initialRoom: Room, initialVersions: Version[]): RoomState {
  const [room, setRoom] = useState(initialRoom);
  const [versions, setVersions] = useState<Version[]>(initialVersions);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const upsert = useCallback((row: Version) => {
    setVersions((prev) => {
      const next = prev.some((v) => v.id === row.id)
        ? prev.map((v) => (v.id === row.id ? row : v))
        : [...prev, row];
      return next.sort(byCreatedAt);
    });
  }, []);

  const refetch = useCallback(async () => {
    const supabase = getSupabase();
    const [{ data: r }, { data: vs }] = await Promise.all([
      supabase.from("rooms").select("*").eq("id", initialRoom.id).single(),
      supabase.from("versions").select("*").eq("room_id", initialRoom.id).order("created_at"),
    ]);
    if (r) setRoom(r as Room);
    if (vs) setVersions(vs as Version[]);
  }, [initialRoom.id]);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabase();
    const name = getDisplayName();

    (async () => {
      const uid = await ensureSignedIn();
      if (cancelled) return;
      setUserId(uid);

      const channel = supabase
        .channel(`room:${initialRoom.id}`, { config: { presence: { key: uid } } })
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "versions", filter: `room_id=eq.${initialRoom.id}` },
          (payload) => {
            if (payload.eventType === "DELETE") {
              setVersions((prev) => prev.filter((v) => v.id !== (payload.old as Version).id));
            } else {
              upsert(payload.new as Version);
            }
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${initialRoom.id}` },
          (payload) => setRoom(payload.new as Room),
        )
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState<{ name: string }>();
          setPeers(
            Object.entries(state).map(([key, entries]) => ({
              userId: key,
              name: entries[0]?.name ?? "anon",
              hue: hueFor(key),
            })),
          );
        });

      channel.subscribe(async (status) => {
        const live = status === "SUBSCRIBED";
        setConnected(live);
        if (live) {
          await channel.track({ name });
          // Catch anything missed while the socket was down.
          await refetch();
        }
      });

      channelRef.current = channel;
    })();

    return () => {
      cancelled = true;
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [initialRoom.id, upsert, refetch]);

  // A tab restored from background may have missed events; resync on focus.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refetch]);

  const submit = useCallback(
    async (instruction: string, parentId: string | null) => {
      const supabase = getSupabase();
      const uid = await ensureSignedIn();
      const { error } = await supabase.from("versions").insert({
        room_id: initialRoom.id,
        parent_id: parentId,
        author_id: uid,
        author_name: getDisplayName(),
        instruction: instruction.trim().slice(0, 500),
        status: "queued",
        progress: 0,
      });
      if (error) throw new Error(error.message);
      // No optimistic insert and no polling — Realtime delivers the row, and
      // it arrives identically for everyone else in the room.
    },
    [initialRoom.id],
  );

  const current =
    versions.find((v) => v.id === room.current_version_id && v.glb_url) ??
    [...versions].reverse().find((v) => v.status === "ready" && v.glb_url) ??
    null;

  const pending =
    [...versions].reverse().find((v) => v.status !== "ready" && v.status !== "failed") ?? null;

  return { room, versions, peers, userId, current, pending, submit, connected };
}
