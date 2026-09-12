import "../src/lib/load-env";
import { createClient } from "@supabase/supabase-js";

// Drives one full round trip as a real anonymous client would.
async function main() {
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: auth, error: aErr } = await anon.auth.signInAnonymously();
  if (aErr) throw aErr;
  const uid = auth.user!.id;

  const code = `smoke-${Date.now().toString(36).slice(-4)}`;
  const { data: room, error: rErr } = await anon
    .from("rooms").insert({ code, name: "Smoke test" }).select().single();
  if (rErr) throw new Error(`room insert: ${rErr.message}`);
  console.log(`room ${code} -> http://localhost:3000/r/${code}`);

  const { data: v, error: vErr } = await anon.from("versions").insert({
    room_id: room.id, author_id: uid, author_name: "smoke",
    instruction: "a brass desk lamp with a marble base",
  }).select().single();
  if (vErr) throw new Error(`version insert: ${vErr.message}`);
  console.log(`queued ${v.id.slice(0, 8)}\n`);

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const { data: cur } = await anon.from("versions")
      .select("status,progress,glb_url,error").eq("id", v.id).single();
    console.log(`  ${cur!.status.padEnd(10)} ${String(cur!.progress).padStart(3)}%`);
    if (cur!.status === "ready") {
      console.log(`\nREADY  glb=${cur!.glb_url}`);
      const { data: r2 } = await anon.from("rooms")
        .select("current_version_id").eq("id", room.id).single();
      console.log(`room.current_version_id set: ${r2!.current_version_id === v.id}`);
      return;
    }
    if (cur!.status === "failed") { console.log(`\nFAILED: ${cur!.error}`); process.exit(1); }
  }
  console.log("\nTimed out — is the worker running?");
  process.exit(1);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
