import type { MeshGenerationProvider, JobStatus, MeshGenerationResult } from "../types";

/**
 * HuggingFace model provider — placeholder for when the model is ready.
 *
 * Expected flow:
 *   1. POST base64 image to HF Inference endpoint
 *   2. Receive a job ID / task ID
 *   3. Poll until the model returns a zip containing mesh files
 *   4. Unzip and upload the mesh to storage, return the URL
 */
export class HuggingFaceProvider implements MeshGenerationProvider {
  readonly name = "huggingface";

  private endpoint: string;
  private token: string;

  constructor() {
    this.endpoint = process.env.HF_ENDPOINT ?? "";
    this.token = process.env.HF_API_TOKEN ?? "";

    if (!this.endpoint || !this.token) {
      console.warn("[HuggingFaceProvider] HF_ENDPOINT and HF_API_TOKEN not set — calls will fail.");
    }
  }

  async generateMesh(input: { image?: string; prompt?: string; format?: "obj" | "stl" | "glb" }): Promise<{ jobId: string }> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: input.image,
        parameters: { output_format: input.format ?? "glb" },
      }),
    });

    if (!response.ok) {
      throw new Error(`HF API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    return { jobId: data.task_id ?? data.id ?? `hf-${Date.now()}` };
  }

  async checkStatus(jobId: string): Promise<{
    status: JobStatus;
    progress?: number;
    result?: MeshGenerationResult;
    error?: string;
  }> {
    // TODO: implement polling against HF task status endpoint
    // The exact endpoint depends on how the model is deployed (Inference Endpoints, Spaces, etc.)
    void jobId;
    return { status: "pending", error: "HuggingFace provider not yet implemented" };
  }
}
