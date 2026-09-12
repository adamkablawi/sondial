import "dotenv/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getMeshProvider } from "@/providers";
import { writeBrief, mergeBrief } from "@/lib/pipeline";
import type { Version, VersionStatus } from "@/lib/types";
import type { MeshStatus } from "@/providers/types";

// ── Configuration ──────────────────────────────────────────────────

const SUPABASE_URL = required("SUPABASE_URL");
const SERVICE_KEY = required("SUPABASE_SERVICE_ROLE_KEY");
const MAX_VERSIONS_PER_ROOM = Number(process.env.MAX_VERSIONS_PER_ROOM ?? 20);
const IDLE_POLL_MS = 2000;
const MESHY_POLL_MS = 3000;
const SWEEP_EVERY_MS = 60_000;
const STUCK_AFTER_MIN = 10;
/** Hard ceiling on one Meshy pass, so a hung task cannot block the queue forever. */
const PASS_TIMEOUT_MS = 10 * 60 * 1000;
/** Only write progress on a jump this large — every write fans out over Realtime. */
const PROGRESS_STEP = 5;

function required(key: string): string {
  const v = process.env[key];
  if (!v) {
    console.error(`\n  Missing required env var: ${key}\n  Copy .env.example to .env and fill it in.\n`);
    process.exit(1);
  }
  return v;
}

const db: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const mesh = getMeshProvider();

// ── Lifecycle ──────────────────────────────────────────────────────

let shuttingDown = false;
let inFlight: Promise<void> | null = null;

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── Row helpers ────────────────────────────────────────────────────

async function patch(id: string, fields: Partial<Version>): Promise<void> {
  const { error } = await db
    .from("versions")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) log("  ! failed to update version", id, error.message);
}

async function fail(id: string, message: string): Promise<void> {
  log("  ✗ failed:", message);
  await patch(id, { status: "failed", error: message.slice(0, 500), progress: 0 });
}

/**
 * Poll a Meshy (or mock) task to completion, mirroring progress into Postgres.
 * Writes are throttled: Meshy reports progress on every poll, and forwarding
 * all of it would spam Realtime and make every client's bar jitter.
 */
async function awaitPass(version: Version, jobId: string, stage: VersionStatus): Promise<MeshStatus> {
  const startedAt = Date.now();
  let lastWritten = -PROGRESS_STEP;

  for (;;) {
    if (Date.now() - startedAt > PASS_TIMEOUT_MS) {
      throw new Error(`${stage} timed out after ${PASS_TIMEOUT_MS / 60000} minutes`);
    }

    const status = await mesh.checkStatus(jobId);

    if (status.status === "failed") throw new Error(status.error ?? `${stage} failed`);
    if (status.status === "complete") return status;

    const progress = status.progress ?? 0;
    if (progress - lastWritten >= PROGRESS_STEP) {
      lastWritten = progress;
      await patch(version.id, { progress });
    }

    await sleep(MESHY_POLL_MS);
  }
}

/** Download an asset and re-host it in Supabase Storage. */
async function rehost(
  url: string,
  path: string,
  contentType: string,
): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download ${path}: ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());

  const { error } = await db.storage
    .from("models")
    .upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(`Could not upload ${path}: ${error.message}`);

  return db.storage.from("models").getPublicUrl(path).data.publicUrl;
}

// ── The job ────────────────────────────────────────────────────────

async function runJob(version: Version): Promise<void> {
  log(`▶ ${version.id.slice(0, 8)} "${version.instruction}" by ${version.author_name}`);

  // Credit guard. Meshy's free tier is finite and a runaway room can drain it.
  const { count, error: countError } = await db
    .from("versions")
    .select("id", { count: "exact", head: true })
    .eq("room_id", version.room_id)
    .neq("status", "failed");

  if (countError) throw new Error(`Could not count room versions: ${countError.message}`);
  if ((count ?? 0) > MAX_VERSIONS_PER_ROOM) {
    return fail(
      version.id,
      `This room has reached its limit of ${MAX_VERSIONS_PER_ROOM} versions. Start a new room to keep going.`,
    );
  }

  // 1 ─ Brief. Chain off the parent so edits refine rather than replace.
  let parentBrief: string | null = null;
  if (version.parent_id) {
    const { data } = await db
      .from("versions")
      .select("brief")
      .eq("id", version.parent_id)
      .single();
    parentBrief = data?.brief ?? null;
  }

  const brief = parentBrief
    ? await mergeBrief(parentBrief, version.instruction)
    : await writeBrief({ prompt: version.instruction });

  log("  brief:", brief.slice(0, 90) + (brief.length > 90 ? "…" : ""));
  await patch(version.id, { brief, status: "generating", progress: 0 });

  // 2 ─ Geometry.
  const { jobId: previewJob } = await mesh.generateMesh({ prompt: brief });
  await patch(version.id, { meshy_task_id: previewJob });
  let result = (await awaitPass(version, previewJob, "generating")).result!;

  // 3 ─ Textures. Text-to-3D returns untextured geometry from the preview
  //     pass; without this the room fills up with grey blobs.
  if (mesh.needsRefine(previewJob)) {
    await patch(version.id, { status: "texturing", progress: 0 });
    const { jobId: refineJob } = await mesh.refineMesh(previewJob);
    await patch(version.id, { meshy_task_id: refineJob });
    result = (await awaitPass(version, refineJob, "texturing")).result!;
  }

  // 4 ─ Re-host. Meshy's URLs are signed and expire; a shared room needs
  //     assets that outlive the job.
  await patch(version.id, { status: "uploading", progress: 0 });

  const base = `${version.room_id}/${version.id}`;
  const glbUrl = result.glbUrl.startsWith("/")
    ? result.glbUrl // mock provider serves a local static file
    : await rehost(result.glbUrl, `${base}.glb`, "model/gltf-binary");

  let usdzUrl: string | null = null;
  if (result.usdzUrl) {
    try {
      usdzUrl = await rehost(result.usdzUrl, `${base}.usdz`, "model/vnd.usdz+zip");
    } catch (err) {
      // iOS AR degrades to no-AR; not worth failing an otherwise good model.
      log("  ! USDZ re-host failed, continuing without iOS AR:", (err as Error).message);
    }
  }

  let thumbUrl: string | null = null;
  if (result.thumbnailUrl) {
    try {
      thumbUrl = await rehost(result.thumbnailUrl, `${base}.png`, "image/png");
    } catch (err) {
      log("  ! thumbnail re-host failed:", (err as Error).message);
    }
  }

  // 5 ─ Publish. The room pointer flip is what swaps every viewer's model.
  await patch(version.id, {
    status: "ready",
    progress: 100,
    glb_url: glbUrl,
    usdz_url: usdzUrl,
    thumb_url: thumbUrl,
    error: null,
  });

  const { error: roomError } = await db
    .from("rooms")
    .update({ current_version_id: version.id })
    .eq("id", version.room_id);
  if (roomError) log("  ! could not update room pointer:", roomError.message);

  log(`  ✓ ready ${glbUrl}${usdzUrl ? " (+usdz)" : ""}`);
}

// ── Queue ──────────────────────────────────────────────────────────

async function claim(): Promise<Version | null> {
  const { data, error } = await db.rpc("claim_next_version");
  if (error) {
    log("! claim failed:", error.message);
    return null;
  }
  // The RPC returns a bare row, or null when the queue is empty.
  return (Array.isArray(data) ? data[0] : data) ?? null;
}

async function sweep(): Promise<void> {
  const { data, error } = await db.rpc("requeue_stuck_versions", {
    max_age_minutes: STUCK_AFTER_MIN,
  });
  if (error) return log("! sweep failed:", error.message);
  const rows = (data ?? []) as Version[];
  if (rows.length) log(`↻ requeued ${rows.length} stuck job(s)`);
}

async function tick(): Promise<boolean> {
  const version = await claim();
  if (!version) return false;

  try {
    await runJob(version);
  } catch (err) {
    await fail(version.id, err instanceof Error ? err.message : "Unknown error");
  }
  return true;
}

async function main(): Promise<void> {
  log(`worker up — mesh=${mesh.name} llm=${process.env.LLM_PROVIDER ?? "mock"}`);

  await sweep();
  const sweeper = setInterval(() => void sweep(), SWEEP_EVERY_MS);

  // Realtime wakes us instantly; the idle poll below is the safety net.
  // Correctness never depends on this subscription — the claim RPC is the
  // source of truth — so a dropped websocket only costs latency.
  let nudge: (() => void) | null = null;
  db.channel("worker:queue")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "versions" }, () => nudge?.())
    .subscribe((status) => log("realtime:", status));

  while (!shuttingDown) {
    inFlight = tick().then((worked) => {
      if (worked) return;
      // Idle: wait for a nudge or the poll interval, whichever lands first.
      return new Promise<void>((resolve) => {
        const timer = setTimeout(done, IDLE_POLL_MS);
        nudge = done;
        function done() {
          clearTimeout(timer);
          nudge = null;
          resolve();
        }
      });
    });
    await inFlight;
    inFlight = null;
  }

  clearInterval(sweeper);
  log("worker stopped");
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (shuttingDown) process.exit(1); // second signal: give up immediately
    shuttingDown = true;
    log(`${signal} received — finishing in-flight job, press again to force quit`);
    void Promise.resolve(inFlight).then(() => process.exit(0));
  });
}

main().catch((err) => {
  console.error("worker crashed:", err);
  process.exit(1);
});
