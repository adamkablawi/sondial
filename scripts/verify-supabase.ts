import "../src/lib/load-env";
import { createClient } from "@supabase/supabase-js";

/**
 * Preflight for the Supabase side. Checks, in order, everything that must be
 * true before the app can work — and names the exact fix for each failure.
 *
 * Run: npm run verify:supabase
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

let failed = 0;
const pass = (m: string) => console.log(`  [ok] ${m}`);
const fail = (m: string, fix: string) => {
  failed++;
  console.log(`  [!!] ${m}\n       fix: ${fix}`);
};

async function main() {
  console.log(`url: ${URL || "(missing)"}\n`);
  if (!URL || !ANON || !SERVICE) {
    console.error(
      "Missing env. Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,\n" +
        "and SUPABASE_SERVICE_ROLE_KEY in .env.local — see .env.example.",
    );
    process.exit(1);
  }

  const anon = createClient(URL, ANON);
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

  console.log("schema");
  for (const table of ["rooms", "versions"]) {
    const { error } = await admin.from(table).select("id").limit(1);
    if (error) fail(`table "${table}" unreachable: ${error.message}`, "run supabase/schema.sql in the SQL editor");
    else pass(`table "${table}"`);
  }

  const { error: rpcErr } = await admin.rpc("claim_next_version");
  if (rpcErr) fail(`claim_next_version() missing: ${rpcErr.message}`, "run supabase/schema.sql in the SQL editor");
  else pass("claim_next_version() rpc");

  console.log("\nstorage");
  const { data: buckets, error: bErr } = await admin.storage.listBuckets();
  const models = buckets?.find((b) => b.id === "models");
  if (bErr) fail(`cannot list buckets: ${bErr.message}`, "check the service role key");
  else if (!models) fail('bucket "models" missing', "run supabase/schema.sql, or create a public bucket named models");
  else if (!models.public) fail('bucket "models" is private', "Storage > models > Settings > make public");
  else pass('bucket "models" (public)');

  console.log("\nanonymous auth");
  const { data: session, error: authErr } = await anon.auth.signInAnonymously();
  if (authErr) {
    fail(
      `anonymous sign-in rejected: ${authErr.message}`,
      "Authentication > Sign In / Providers > enable Anonymous sign-ins",
    );
  } else {
    pass(`anonymous sign-in (uid ${session.user?.id.slice(0, 8)}…)`);

    console.log("\nrow level security");
    // A signed-in client must not be able to forge a finished version.
    const { data: room } = await admin
      .from("rooms")
      .insert({ code: `VERIFY-${Date.now().toString(36).toUpperCase()}`, name: "verify" })
      .select()
      .single();

    if (room) {
      const { data: v } = await admin
        .from("versions")
        .insert({ room_id: room.id, instruction: "rls probe", author_name: "verify" })
        .select()
        .single();

      if (v) {
        const { data: hacked, error: upErr } = await anon
          .from("versions")
          .update({ status: "ready", glb_url: "https://evil.example/x.glb" })
          .eq("id", v.id)
          .select();
        if (upErr || !hacked?.length) pass("clients cannot update versions");
        else fail("a client CAN update versions", "re-run supabase/schema.sql; do not add an update policy");

        const { error: forgeErr } = await anon
          .from("versions")
          .insert({ room_id: room.id, instruction: "forged", status: "ready" });
        if (forgeErr) pass("clients cannot insert a pre-finished version");
        else fail("a client CAN insert status='ready'", "re-run the versions insert policy from supabase/schema.sql");
      }
      await admin.from("rooms").delete().eq("id", room.id);
    }
  }

  console.log(
    failed === 0
      ? "\nAll checks passed. Start the app: npm run dev  +  npm run worker"
      : `\n${failed} check(s) failed — fix the items above and re-run.`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`\nFAILED: ${e.message}`);
  process.exit(1);
});
