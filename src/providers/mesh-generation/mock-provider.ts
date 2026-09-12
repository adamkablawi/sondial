import type { MeshGenerationProvider, MeshStatus } from "../types";

/** How long each simulated pass takes, in ms. */
const PREVIEW_MS = 6000;
const REFINE_MS = 5000;

/**
 * Mock mesh provider — lets the entire app run and demo with no API keys.
 *
 * Like the Meshy provider, all job state lives in the id (stage + start time),
 * so there is no server-side map to lose across a restart.
 *
 *   mock-pre-<startedAt>   simulated text-to-3D preview
 *   mock-ref-<startedAt>   simulated refine
 *   mock-img-<startedAt>   simulated image-to-3D (single pass)
 */
export class MockMeshProvider implements MeshGenerationProvider {
  readonly name = "mock";

  async generateMesh(input: { image?: string; prompt?: string }): Promise<{ jobId: string }> {
    const stage = input.image ? "img" : "pre";
    return { jobId: `mock-${stage}-${Date.now()}` };
  }

  async refineMesh(previewJobId: string): Promise<{ jobId: string }> {
    if (!previewJobId.startsWith("mock-pre-")) {
      throw new Error(`refineMesh expects a preview job id, got "${previewJobId}"`);
    }
    return { jobId: `mock-ref-${Date.now()}` };
  }

  needsRefine(jobId: string): boolean {
    return jobId.startsWith("mock-pre-");
  }

  async checkStatus(jobId: string): Promise<MeshStatus> {
    const match = /^mock-(pre|ref|img)-(\d+)$/.exec(jobId);
    if (!match) return { status: "failed", error: `Unrecognised mock job id: ${jobId}` };

    const [, stage, startedAt] = match;
    const duration = stage === "ref" ? REFINE_MS : PREVIEW_MS;
    const elapsed = Date.now() - Number(startedAt);

    if (elapsed < duration) {
      return { status: "processing", progress: Math.min(95, Math.floor((elapsed / duration) * 100)) };
    }

    return {
      status: "complete",
      progress: 100,
      result: {
        glbUrl: "/samples/mock.glb",
        // No USDZ in mock mode — the AR button degrades to Android/WebXR only.
        thumbnailUrl: undefined,
        metadata: { vertices: 24, faces: 12 },
      },
    };
  }
}
