import { notFound } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import type { Room, Version } from "@/lib/types";
import { normalizeRoomCode } from "@/lib/room-code";
import { RoomShell } from "./RoomShell";

export const dynamic = "force-dynamic";

/**
 * Server-rendered so the room and its history paint immediately; the client
 * shell then takes over and keeps everything live over Realtime.
 */
export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await getServerSupabase();

  const { data: room, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("code", normalizeRoomCode(code))
    .maybeSingle();

  // A failed lookup and a missing room are different things. Showing "that
  // room isn't here" when the database is unreachable sends people hunting for
  // a typo that does not exist.
  if (error) throw new Error(`Could not reach the database: ${error.message}`);
  if (!room) notFound();

  const { data: versions } = await supabase
    .from("versions")
    .select("*")
    .eq("room_id", room.id)
    .order("created_at");

  return <RoomShell room={room as Room} initialVersions={(versions ?? []) as Version[]} />;
}
