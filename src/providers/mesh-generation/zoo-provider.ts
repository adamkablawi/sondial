import type { MeshGenerationProvider, JobStatus, MeshGenerationResult } from "../types";
import { jobStore } from "../job-store";
import { runZooCopilot, ZooError } from "./zoo-client";

const ZOO_API_BASE = process.env.ZOO_API_BASE ?? "https://api.zoo.dev";

/**
 * Zoo (zoo.dev) provider — real parametric CAD rather than a generated mesh.
 *
 * Two stages, because Zoo splits them:
 *   1. The copilot websocket runs an agent that writes **KCL source**.
 *   2. That generation is recorded as a Text-to-CAD record, which carries the
 *      evaluated geometry in `outputs` (base64, keyed by filename).
 *
 * Stage 2 is why this provider polls REST after the socket closes: the socket
 * hands back code, and `GET /user/text-to-cad` is where geometry shows up.
 *
 * Bytes are not copied into the job store. The worker and the Next server are
 * separate processes, so an in-memory buffer in one is invisible to the other;
 * the mesh URL instead points at `/api/zoo/mesh/[id]`, which re-fetches from
 * Zoo with the server-side key.
 */
export class ZooProvider implements MeshGenerationProvider {
  readonly name = "zoo";

  private apiKey: string;

  constructor() {
    this.apiKey = process.env.ZOO_API_KEY ?? "";
    if (!this.apiKey) {
      console.warn("[ZooProvider] ZOO_API_KEY not set — calls will fail.");
    }
  }

  async generateMesh(input: {
    image?: string;
    prompt?: string;
    format?: "obj" | "stl" | "glb";
    previousSource?: string;
  }): Promise<{ jobId: string }> {
    if (!input.prompt) {
      // Zoo's copilot is text-driven. Image-to-CAD is not part of this path.
      throw new Error("Zoo generation requires a 'prompt'.");
    }

    const jobId = `zoo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    jobStore.set(jobId, { status: "processing", progress: 0, createdAt: Date.now(), data: {} });

    // Fire and forget: the interface is poll-based, so the socket runs in the
    // background and checkStatus reads whatever it has recorded.
    void this.run(jobId, input.prompt, input.previousSource);

    return { jobId };
  }

  private async run(jobId: string, prompt: string, previousSource?: string): Promise<void> {
    const update = (patch: Partial<NonNullable<ReturnType<typeof jobStore.get>>>) => {
      const job = jobStore.get(jobId);
      if (job) jobStore.set(jobId, { ...job, ...patch });
    };

    try {
      const result = await runZooCopilot({
        prompt,
        // With the base version's KCL in hand the agent edits that source
        // instead of modelling afresh, which is what keeps an edit surgical
        // rather than a new interpretation of the same brief.
        ...(previousSource ? { currentFiles: { "main.kcl": previousSource } } : {}),
        projectName: `sondial-${jobId}`,
        onProgress: () => {
          const job = jobStore.get(jobId);
          // No real percentage from the agent; creep toward 90 so the UI moves.
          if (job) update({ progress: Math.min(90, job.progress + 5) });
        },
      });

      update({ progress: 92, data: { kcl: result.files, conversationId: result.conversationId } });

      const record = await this.findRecord(result.conversationId);
      if (!record) {
        throw new ZooError("Zoo produced no Text-to-CAD record for this conversation", "no_record");
      }

      const output = pickOutput(record.outputs);
      if (!output) {
        // KCL came back but no evaluated geometry — surface it rather than
        // silently completing with nothing to render.
        throw new ZooError(
          `Zoo record ${record.id} carried no renderable output (status ${record.status})`,
          "no_output",
        );
      }

      update({
        status: "complete",
        progress: 100,
        data: {
          kcl: result.files,
          conversationId: result.conversationId,
          recordId: record.id,
          format: output.format,
        },
      });
    } catch (err) {
      update({
        status: "failed",
        data: { error: err instanceof Error ? err.message : "Zoo generation failed" },
      });
    }
  }

  /** Find the Text-to-CAD record the copilot run produced, waiting for it to finish. */
  private async findRecord(conversationId: string | null): Promise<ZooRecord | null> {
    const deadline = Date.now() + 120_000;

    while (Date.now() < deadline) {
      const qs = conversationId ? `?conversation_id=${encodeURIComponent(conversationId)}` : "?limit=1";
      const res = await fetch(`${ZOO_API_BASE}/user/text-to-cad${qs}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (res.ok) {
        const page = (await res.json()) as { items?: ZooRecord[] };
        const record = page.items?.[0];
        if (record && record.status !== "queued" && record.status !== "in_progress") {
          return record;
        }
      }

      await new Promise((r) => setTimeout(r, 3000));
    }

    return null;
  }

  async checkStatus(jobId: string): Promise<{
    status: JobStatus;
    progress?: number;
    result?: MeshGenerationResult;
    error?: string;
  }> {
    const job = jobStore.get(jobId);
    if (!job) return { status: "failed", error: `Unknown Zoo job ${jobId}` };

    if (job.status === "failed") {
      return { status: "failed", error: String(job.data?.error ?? "Zoo generation failed") };
    }

    if (job.status === "complete") {
      const recordId = String(job.data?.recordId ?? "");
      const format = (job.data?.format as MeshGenerationResult["format"]) ?? "glb";

      // Hand the KCL back so the version can store it and the next edit can be
      // applied to this exact source.
      const files = (job.data?.kcl ?? {}) as Record<string, string>;
      const sourcePath =
        Object.keys(files).find((f) => f.endsWith(".kcl")) ?? Object.keys(files)[0];

      return {
        status: "complete",
        progress: 100,
        result: {
          meshFileUrl: `/api/zoo/mesh/${recordId}`,
          format,
          ...(sourcePath ? { source: files[sourcePath], sourcePath } : {}),
        },
      };
    }

    return { status: "processing", progress: job.progress };
  }
}

interface ZooRecord {
  id: string;
  status: string;
  code?: string;
  output_format?: string;
  outputs?: Record<string, string>;
}

/** Pick the most viewer-friendly geometry Zoo returned. */
export function pickOutput(
  outputs: Record<string, string> | undefined,
): { name: string; format: MeshGenerationResult["format"] } | null {
  if (!outputs) return null;
  const names = Object.keys(outputs);
  // Ordered by what the R3F viewer and the AR launcher handle best.
  for (const [ext, format] of [
    [".glb", "glb"],
    [".gltf", "glb"],
    [".obj", "obj"],
    [".stl", "stl"],
  ] as const) {
    const hit = names.find((n) => n.toLowerCase().endsWith(ext));
    if (hit) return { name: hit, format };
  }
  return null;
}
