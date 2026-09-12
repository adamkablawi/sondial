import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MeshGenerationProvider, JobStatus, MeshGenerationResult } from "../types";
import { applyGlossyFinish } from "./apply-glossy-finish";

const MESHY_API_BASE = "https://api.meshy.ai";
const GENERATED_DIR = path.join(process.cwd(), "public", "generated");

/**
 * "meshy-6-lite" is Meshy's own lightweight tier (same cost as the
 * deprecated meshy-5) — the fastest documented option short of accepting
 * lower quality outright. "meshy-6" (mid-tier) and "meshy-7" (latest,
 * slower — its ultra_mode explicitly trades time for fidelity) are the
 * other standard-generation choices; override via MESHY_AI_MODEL to compare.
 */
const AI_MODEL = process.env.MESHY_AI_MODEL ?? "meshy-6-lite";

/**
 * Meshy's docs don't state how target_polycount affects generation time —
 * this is an inference (less mesh detail to compute), not a documented fact.
 * 10,000 is a real cut from the previous 30,000 default while staying well
 * above the point where shapes start looking faceted. Override via
 * MESHY_TARGET_POLYCOUNT to tune, or push back to 30000 if quality suffers.
 */
const TARGET_POLYCOUNT = Number(process.env.MESHY_TARGET_POLYCOUNT ?? 10_000);

/**
 * Meshy AI provider — supports both image-to-3D and text-to-3D generation.
 *
 * Image-to-3D: POST /openapi/v1/image-to-3d
 * Text-to-3D:  POST /openapi/v2/text-to-3d (preview mode)
 *
 * Requires MESHY_API_KEY environment variable.
 */
export class MeshyProvider implements MeshGenerationProvider {
  readonly name = "meshy";

  private apiKey: string;

  constructor() {
    this.apiKey = process.env.MESHY_API_KEY ?? "";
    if (!this.apiKey) {
      console.warn("[MeshyProvider] MESHY_API_KEY not set — calls will fail.");
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Downloads the finished GLB, bakes in a fixed glossy finish, and saves it
   * locally so the desktop viewer and AR load the exact same file. Never
   * throws: any failure here falls back to Meshy's own URL unmodified — a
   * cosmetic finish is not worth failing a generation over.
   */
  private async withGlossyFinish(taskId: string, meshyGlbUrl: string): Promise<string> {
    try {
      const response = await fetch(meshyGlbUrl);
      if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
      const original = Buffer.from(await response.arrayBuffer());

      const glossy = await applyGlossyFinish(original);

      await mkdir(GENERATED_DIR, { recursive: true });
      const filename = `${taskId}.glb`;
      await writeFile(path.join(GENERATED_DIR, filename), glossy);

      return `/generated/${filename}`;
    } catch (err) {
      console.error("[MeshyProvider] glossy finish failed, using Meshy's URL as-is:", err);
      return meshyGlbUrl;
    }
  }

  async generateMesh(input: {
    image?: string;      // base64 encoded image (for image-to-3D)
    prompt?: string;     // text description (for text-to-3D)
    format?: "obj" | "stl" | "glb";
  }): Promise<{ jobId: string }> {
    if (input.image) {
      // Image provided — use image-to-3D, with optional text as texture guidance
      return this.imageToMesh(input.image, input.prompt);
    }
    if (input.prompt) {
      return this.textToMesh(input.prompt);
    }
    throw new Error("Either 'image' or 'prompt' is required for Meshy generation.");
  }

  private async imageToMesh(imageBase64: string, texturePrompt?: string): Promise<{ jobId: string }> {
    // Meshy expects a data URI or a URL
    const imageUrl = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:image/png;base64,${imageBase64}`;

    const body: Record<string, unknown> = {
      image_url: imageUrl,
      ai_model: AI_MODEL,
      topology: "triangle",
      target_polycount: TARGET_POLYCOUNT,
    };

    // When text is provided alongside the image, pass it as texture guidance
    if (texturePrompt) {
      body.texture_prompt = texturePrompt;
    }

    const response = await fetch(`${MESHY_API_BASE}/openapi/v1/image-to-3d`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Meshy image-to-3D API error: ${response.status} ${text}`);
    }

    const data = await response.json();
    const taskId = data.result;
    return { jobId: `meshy-img-${taskId}` };
  }

  private async textToMesh(prompt: string): Promise<{ jobId: string }> {
    const response = await fetch(`${MESHY_API_BASE}/openapi/v2/text-to-3d`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        mode: "preview",
        prompt,
        ai_model: AI_MODEL,
        topology: "triangle",
        target_polycount: TARGET_POLYCOUNT,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Meshy text-to-3D API error: ${response.status} ${text}`);
    }

    const data = await response.json();
    const taskId = data.result;
    return { jobId: `meshy-txt-${taskId}` };
  }

  async checkStatus(jobId: string): Promise<{
    status: JobStatus;
    progress?: number;
    result?: MeshGenerationResult;
    error?: string;
  }> {
    // Extract the actual Meshy task ID and determine endpoint
    let taskId: string;
    let endpoint: string;

    if (jobId.startsWith("meshy-img-")) {
      taskId = jobId.slice("meshy-img-".length);
      endpoint = `${MESHY_API_BASE}/openapi/v1/image-to-3d/${taskId}`;
    } else if (jobId.startsWith("meshy-txt-")) {
      taskId = jobId.slice("meshy-txt-".length);
      endpoint = `${MESHY_API_BASE}/openapi/v2/text-to-3d/${taskId}`;
    } else {
      return { status: "failed", error: `Unknown Meshy job ID format: ${jobId}` };
    }

    const response = await fetch(endpoint, {
      method: "GET",
      headers: this.headers(),
    });

    if (!response.ok) {
      const text = await response.text();
      return { status: "failed", error: `Meshy status check failed: ${response.status} ${text}` };
    }

    const data = await response.json();
    const meshyStatus: string = data.status; // PENDING, IN_PROGRESS, SUCCEEDED, FAILED, CANCELED
    const progress: number = data.progress ?? 0;

    const statusMap: Record<string, JobStatus> = {
      PENDING: "pending",
      IN_PROGRESS: "processing",
      SUCCEEDED: "complete",
      FAILED: "failed",
      CANCELED: "failed",
    };

    const status = statusMap[meshyStatus] ?? "pending";

    if (status === "complete" && data.model_urls) {
      // Prefer GLB. For the same model Meshy returns ~12 MB as GLB against
      // ~56 MB as OBJ, and the AR viewer wants GLB anyway; OBJ was only ever
      // preferred here for an OpenSCAD path that no longer exists.
      const format = data.model_urls.glb ? "glb" as const
        : data.model_urls.obj ? "obj" as const
        : "fbx" as const;

      // Only GLB carries PBR material factors the same way our patch expects;
      // OBJ/FBX are passed through untouched (rare in practice — GLB is
      // preferred above whenever Meshy offers it).
      const meshFileUrl =
        format === "glb" && data.model_urls.glb
          ? await this.withGlossyFinish(taskId, data.model_urls.glb)
          : data.model_urls.obj || data.model_urls.fbx || "";

      return {
        status: "complete",
        progress: 100,
        result: {
          meshFileUrl,
          format,
          metadata: {
            vertices: data.vertex_count,
            faces: data.face_count,
          },
        },
      };
    }

    if (status === "failed") {
      return { status: "failed", error: data.task_error?.message ?? "Meshy task failed" };
    }

    return { status, progress };
  }
}
