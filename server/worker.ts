import "./env";
import { UnrecoverableError, Worker } from "bullmq";
import { db } from "../src/lib/db";
import { createQueueConnection } from "../src/lib/redis";
import { GENERATION_QUEUE, type GenerationJobPayload } from "../src/lib/queue";
import { meshProvider } from "../src/providers";
import {
  classifyInstruction,
  compileMeshyPrompt,
  evolveDesignState,
  renderDesignState,
  type DesignState,
} from "../src/lib/design-state";
import {
  publishRoomEvent,
  toDesignStateDTO,
  toJobDTO,
  toMessageDTO,
  toVersionDTO,
} from "../src/lib/serialize";

/**
 * Generation worker.
 *
 * Concurrency is pinned to 1 so requests apply in a defined order and version
 * numbering stays race-free — the ordering guarantee the queue exists to provide.
 */

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

// ── Broadcast helpers ──

async function emitJob(jobId: string, roomSlug: string): Promise<void> {
  const job = await db.generationJob.findUnique({
    where: { id: jobId },
    include: { author: true },
  });
  if (job) await publishRoomEvent(roomSlug, { type: "job", job: toJobDTO(job) });
}

async function emitVersion(versionId: string, roomSlug: string): Promise<void> {
  const version = await db.objectVersion.findUnique({
    where: { id: versionId },
    include: { createdBy: true, description: true, project: true },
  });
  if (!version) return;

  await publishRoomEvent(roomSlug, {
    type: "version",
    version: toVersionDTO(version),
    designState: version.description ? toDesignStateDTO(version.description) : null,
    headVersionId: version.project.headVersionId,
  });
}

async function systemMessage(
  roomId: string,
  roomSlug: string,
  body: string,
): Promise<void> {
  const message = await db.chatMessage.create({
    data: { roomId, kind: "SYSTEM", body },
    include: { participant: true },
  });
  await publishRoomEvent(roomSlug, { type: "message", message: toMessageDTO(message) });
}

function toDesignState(d: {
  summary: string;
  geometry: string;
  materials: string;
  dimensions: string;
  constraints: string;
  function: string;
  rationale: string;
}): DesignState {
  return {
    summary: d.summary,
    geometry: d.geometry,
    materials: d.materials,
    dimensions: d.dimensions,
    constraints: d.constraints,
    function: d.function,
    rationale: d.rationale,
  };
}

/** External vendor URLs go through the existing proxy route to dodge CORS. */
function proxied(url: string): string {
  return url.startsWith("http") ? `/api/proxy?url=${encodeURIComponent(url)}` : url;
}

/** Errors that a retry cannot fix: credentials, permissions, malformed requests. */
function isPermanentFailure(message: string): boolean {
  return (
    /\b(400|401|402|403|404)\b/.test(message) ||
    /invalid api key|unauthorized|forbidden|payment required/i.test(message)
  );
}

/** Turns a vendor error into something a room participant can act on. */
function explainFailure(raw: string): string {
  if (/\b401\b|invalid api key|unauthorized/i.test(raw)) {
    return `Generation failed: the ${meshProvider.name} API key was rejected. Set a valid key in .env.local and restart, or run with MESH_PROVIDER=mock to keep iterating without one.`;
  }
  if (/\b402\b|payment required|quota|credit/i.test(raw)) {
    return `Generation failed: the ${meshProvider.name} account is out of credit or quota.`;
  }
  return `Generation failed: ${raw}`;
}

// ── Core ──

async function processJob(payload: GenerationJobPayload): Promise<void> {
  const { jobId, roomSlug } = payload;

  const record = await db.generationJob.findUnique({
    where: { id: jobId },
    include: {
      project: true,
      room: true,
      author: true,
      baseVersion: { include: { description: true } },
    },
  });

  if (!record) {
    console.warn("[worker] job vanished:", jobId);
    return;
  }

  await db.generationJob.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date(), progress: 0 },
  });
  await emitJob(jobId, roomSlug);

  try {
    // ── Staleness: re-apply onto the current head rather than a version the
    // author never saw. Concurrent edits against one base are the normal case
    // in a shared room, so this rebases instead of blocking on review.
    let baseVersion = record.baseVersion;
    const head = record.project.headVersionId;

    if (head && head !== record.baseVersionId) {
      const headVersion = await db.objectVersion.findUnique({
        where: { id: head },
        include: { description: true },
      });

      if (headVersion?.description) {
        await db.generationJob.update({
          where: { id: jobId },
          data: { rebasedFromVersionId: record.baseVersionId, baseVersionId: headVersion.id },
        });
        baseVersion = headVersion;
        await systemMessage(
          record.roomId,
          roomSlug,
          `Rebased "${record.instruction}" onto v${headVersion.versionNumber} — the design moved while it was queued.`,
        );
      }
    }

    const currentState = baseVersion.description
      ? toDesignState(baseVersion.description)
      : null;

    if (!currentState) {
      throw new Error("Base version has no design state; cannot ground this edit.");
    }

    // ── Grounding: the instruction is applied to the full design state, never
    // to the chat message alone.
    const recent = await db.chatMessage.findMany({
      where: { roomId: record.roomId },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { participant: true },
    });

    const history = recent
      .reverse()
      .map((m) => ({ author: m.participant?.displayName ?? "system", body: m.body }));

    const strategy = await classifyInstruction(record.instruction);

    const nextState = await evolveDesignState({
      current: currentState,
      instruction: record.instruction,
      history,
      constraints: record.project.constraints,
    });

    const prompt = await compileMeshyPrompt(nextState);

    await db.generationJob.update({
      where: { id: jobId },
      data: { strategy, compiledPrompt: prompt },
    });
    await emitJob(jobId, roomSlug);

    // ── Generation.
    // Nothing touches the version DAG until the vendor actually returns
    // something. A version represents a real object state, so a failed attempt
    // must not leave one behind — the attempt is recorded on GenerationJob, and
    // the timeline shows in-flight work from the job instead.
    //
    // `previousSource` lets a source-based provider (Zoo) edit the base
    // version's KCL directly, which is what makes an edit surgical. Mesh
    // providers ignore it and regenerate from the prompt.
    const { jobId: meshJobId } = await meshProvider.generateMesh({
      prompt,
      previousSource: baseVersion.cadSource ?? undefined,
    });

    const startedAt = Date.now();
    let lastProgress = -1;
    let result: Awaited<ReturnType<typeof meshProvider.checkStatus>>["result"] | null = null;

    while (!result) {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        throw new Error(`Generation timed out after ${POLL_TIMEOUT_MS / 1000}s`);
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const status = await meshProvider.checkStatus(meshJobId);

      if (status.status === "failed") {
        throw new Error(status.error ?? "Generation failed");
      }
      if (typeof status.progress === "number" && status.progress !== lastProgress) {
        lastProgress = status.progress;
        await db.generationJob.update({
          where: { id: jobId },
          data: { progress: status.progress },
        });
        await emitJob(jobId, roomSlug);
      }
      if (status.status === "complete" && status.result) {
        result = status.result;
      }
    }

    // ── Commit: the version, its design state, the new head, and the job
    // outcome all land together or not at all.
    const version = await db.$transaction(async (tx) => {
      const max = await tx.objectVersion.aggregate({
        where: { projectId: record.projectId },
        _max: { versionNumber: true },
      });

      const created = await tx.objectVersion.create({
        data: {
          projectId: record.projectId,
          parentId: baseVersion.id,
          versionNumber: (max._max.versionNumber ?? 0) + 1,
          status: "COMPLETE",
          label: record.instruction.slice(0, 80),
          createdById: record.authorId,
          meshUrl: proxied(result.meshFileUrl),
          meshFormat: result.format,
          meshyTaskId: meshJobId,
          cadSource: result.source ?? null,
          cadSourcePath: result.sourcePath ?? null,
          description: {
            create: { ...nextState, raw: renderDesignState(nextState) },
          },
        },
      });

      await tx.project.update({
        where: { id: record.projectId },
        data: { headVersionId: created.id },
      });

      await tx.generationJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETE",
          progress: 100,
          finishedAt: new Date(),
          resultVersionId: created.id,
        },
      });

      return created;
    });

    await emitVersion(version.id, roomSlug);
    await emitJob(jobId, roomSlug);
    await publishRoomEvent(roomSlug, { type: "head", headVersionId: version.id });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Generation failed";
    const message = explainFailure(raw);
    console.error("[worker] job failed:", jobId, raw);

    await db.generationJob.update({
      where: { id: jobId },
      data: { status: "FAILED", error: message, finishedAt: new Date() },
    });

    await emitJob(jobId, roomSlug);
    await systemMessage(record.roomId, roomSlug, message);

    // Bad credentials and malformed requests fail identically on every attempt,
    // so retrying only posts the same failure to the room twice.
    if (isPermanentFailure(raw)) throw new UnrecoverableError(message);
    throw err;
  }
}

const worker = new Worker<GenerationJobPayload>(
  GENERATION_QUEUE,
  (job) => processJob(job.data),
  { connection: createQueueConnection(), concurrency: 1 },
);

worker.on("ready", () => console.log("[worker] listening on queue:", GENERATION_QUEUE));
worker.on("failed", (job, err) => console.error("[worker] failed:", job?.id, err.message));

async function shutdown() {
  await worker.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
