"use server";

import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { generateRoomCode, normalizeRoomCode } from "@/lib/room-code";

/** Create a room and go to it. Retries on the rare code collision. */
export async function createRoom() {
  const supabase = await getServerSupabase();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    const { error } = await supabase.from("rooms").insert({ code, name: "Untitled" });

    if (!error) redirect(`/r/${code}`);
    // 23505 = unique violation on `code`; anything else is a real failure.
    if (error.code !== "23505") throw new Error(error.message);
  }

  throw new Error("Could not find a free room code. Try again.");
}

/** Join by code. Returns an error string rather than throwing, so the form can show it. */
export async function joinRoom(_prev: unknown, formData: FormData): Promise<{ error: string }> {
  const code = normalizeRoomCode(String(formData.get("code") ?? ""));
  if (!code) return { error: "Enter a room code." };

  const supabase = await getServerSupabase();
  const { data } = await supabase.from("rooms").select("code").eq("code", code).maybeSingle();

  if (!data) return { error: `No room called ${code}. Check the code, or start a new room.` };
  redirect(`/r/${data.code}`);
}
