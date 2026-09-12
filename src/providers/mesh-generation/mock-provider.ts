import type { MeshGenerationProvider, JobStatus, MeshGenerationResult } from "../types";
import { jobStore } from "../job-store";

export class MockMeshProvider implements MeshGenerationProvider {
  readonly name = "mock";

  async generateMesh(input: { image?: string; prompt?: string; format?: "obj" | "stl" | "glb" }): Promise<{ jobId: string }> {
    const jobId = `mock-mesh-${Date.now()}`;
    jobStore.set(jobId, {
      status: "processing",
      progress: 0,
      createdAt: Date.now(),
      data: { image: input.image },
    });
    return { jobId };
  }

  async checkStatus(jobId: string): Promise<{
    status: JobStatus;
    progress?: number;
    result?: MeshGenerationResult;
    error?: string;
  }> {
    const job = jobStore.get(jobId);
    if (!job) return { status: "failed", error: "Job not found" };

    const elapsed = Date.now() - job.createdAt;
    const simulatedDuration = 2000;

    if (elapsed >= simulatedDuration) {
      job.status = "complete";
      job.progress = 100;
      return {
        status: "complete",
        progress: 100,
        result: {
          meshFileUrl: "/samples/cube.obj",
          format: "obj",
        },
      };
    }

    job.progress = Math.min(95, Math.floor((elapsed / simulatedDuration) * 100));
    return { status: "processing", progress: job.progress };
  }
}
