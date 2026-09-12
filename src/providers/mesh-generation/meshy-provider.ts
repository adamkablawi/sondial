import type {
  MeshGenerationProvider,
  MeshStatus,
  JobStatus,
} from "../types";

const MESHY_API_BASE = "https://api.meshy.ai";

/** Formats we ask Meshy to produce. GLB drives the viewer, USDZ drives iOS AR. */
const TARGET_FORMATS = ["glb", "usdz"];

/**
 * Meshy AI provider.
 *
 * Two shapes of job, distinguished by the jobId prefix so that job state lives
 * entirely in the id — no server-side map required, which means a worker
 * restart never loses track of in-flight work:
 *
 *   meshy-img-<task>   image-to-3D   — textured in a single call
 *   meshy-pre-<task>   text-to-3D    — preview, geometry only, needs refine
 *   meshy-ref-<task>   text-to-3D    — refine, textures applied
 */
export class MeshyProvider implements MeshGenerationProvider {
  readonly name = "meshy";

  private apiKey: string;

  constructor() {
    this.apiKey = process.env.MESHY_API_KEY ?? "";
    if (!this.apiKey) {
      console.warn("[meshy] MESHY_API_KEY not set — calls will fail.");
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  private async post(path: string, body: unknown): Promise<string> {
    const response = await fetch(`${MESHY_API_BASE}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Meshy ${path} failed: ${response.status} ${text}`);
    }

    const data = await response.json();
    if (!data.result) {
      throw new Error(`Meshy ${path} returned no task id: ${JSON.stringify(data)}`);
    }
    return data.result as string;
  }

  async generateMesh(input: { image?: string; prompt?: string }): Promise<{ jobId: string }> {
    if (input.image) {
      // Image-to-3D textures in one pass (should_texture defaults true).
      const imageUrl = input.image.startsWith("data:")
        ? input.image
        : `data:image/png;base64,${input.image}`;

      const task = await this.post("/openapi/v1/image-to-3d", {
        image_url: imageUrl,
        ai_model: "meshy-6",
        topology: "triangle",
        target_polycount: 30000,
        should_texture: true,
        enable_pbr: true,
        target_formats: TARGET_FORMATS,
        ...(input.prompt ? { texture_prompt: input.prompt } : {}),
      });
      return { jobId: `meshy-img-${task}` };
    }

    if (input.prompt) {
      // Text-to-3D preview: geometry only. Textures come from refineMesh().
      const task = await this.post("/openapi/v2/text-to-3d", {
        mode: "preview",
        prompt: input.prompt.slice(0, 800), // Meshy caps the prompt at 800 chars
        ai_model: "meshy-6",
        topology: "triangle",
        target_polycount: 30000,
        should_remesh: true,
        target_formats: TARGET_FORMATS,
      });
      return { jobId: `meshy-pre-${task}` };
    }

    throw new Error("Meshy generation needs either 'image' or 'prompt'.");
  }

  async refineMesh(previewJobId: string): Promise<{ jobId: string }> {
    if (!previewJobId.startsWith("meshy-pre-")) {
      throw new Error(`refineMesh expects a preview job id, got "${previewJobId}"`);
    }
    const previewTaskId = previewJobId.slice("meshy-pre-".length);

    const task = await this.post("/openapi/v2/text-to-3d", {
      mode: "refine",
      preview_task_id: previewTaskId,
      enable_pbr: true,
      target_formats: TARGET_FORMATS,
    });
    return { jobId: `meshy-ref-${task}` };
  }

  needsRefine(jobId: string): boolean {
    return jobId.startsWith("meshy-pre-");
  }

  private endpointFor(jobId: string): string {
    if (jobId.startsWith("meshy-img-")) {
      return `${MESHY_API_BASE}/openapi/v1/image-to-3d/${jobId.slice("meshy-img-".length)}`;
    }
    if (jobId.startsWith("meshy-pre-")) {
      return `${MESHY_API_BASE}/openapi/v2/text-to-3d/${jobId.slice("meshy-pre-".length)}`;
    }
    if (jobId.startsWith("meshy-ref-")) {
      return `${MESHY_API_BASE}/openapi/v2/text-to-3d/${jobId.slice("meshy-ref-".length)}`;
    }
    throw new Error(`Unrecognised Meshy job id: ${jobId}`);
  }

  async checkStatus(jobId: string): Promise<MeshStatus> {
    let endpoint: string;
    try {
      endpoint = this.endpointFor(jobId);
    } catch (err) {
      return { status: "failed", error: (err as Error).message };
    }

    const response = await fetch(endpoint, { method: "GET", headers: this.headers() });

    if (!response.ok) {
      const text = await response.text();
      return { status: "failed", error: `Meshy status check failed: ${response.status} ${text}` };
    }

    const data = await response.json();

    const statusMap: Record<string, JobStatus> = {
      PENDING: "pending",
      IN_PROGRESS: "processing",
      SUCCEEDED: "complete",
      FAILED: "failed",
      CANCELED: "failed",
    };
    const status = statusMap[data.status as string] ?? "pending";

    if (status === "failed") {
      return { status: "failed", error: data.task_error?.message ?? "Meshy task failed" };
    }

    if (status === "complete") {
      const urls = data.model_urls ?? {};
      if (!urls.glb) {
        return {
          status: "failed",
          error: "Meshy finished but returned no GLB. Check target_formats.",
        };
      }
      return {
        status: "complete",
        progress: 100,
        result: {
          glbUrl: urls.glb,
          usdzUrl: urls.usdz,
          thumbnailUrl: data.thumbnail_url,
          metadata: { vertices: data.vertex_count, faces: data.face_count },
        },
      };
    }

    return { status, progress: data.progress ?? 0 };
  }
}
