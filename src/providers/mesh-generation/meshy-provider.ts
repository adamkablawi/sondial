import type { MeshGenerationProvider, JobStatus, MeshGenerationResult } from "../types";

const MESHY_API_BASE = "https://api.meshy.ai";

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
      ai_model: "meshy-6",
      topology: "triangle",
      target_polycount: 30000,
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
        ai_model: "meshy-6",
        topology: "triangle",
        target_polycount: 30000,
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
      // Prefer OBJ (OpenSCAD-compatible), fall back to GLB, then FBX
      const meshFileUrl = data.model_urls.obj || data.model_urls.glb || data.model_urls.fbx || "";
      const format = data.model_urls.obj ? "obj" as const
        : data.model_urls.glb ? "glb" as const
        : "fbx" as const;

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
