import { meshProvider } from "../index";
import type { CadGenerationInput, CadGenerationResult, CadProvider } from "./types";

/**
 * Adapts the existing mesh providers (meshy / huggingface / mock) to the CAD
 * interface. They stay untouched behind this: submit a job, poll it, return the
 * finished mesh, so the worker sees the same shape as a source-based provider.
 *
 * Mesh generation cannot edit prior geometry, so `previousSource` is ignored —
 * continuity for these providers comes from the compiled design-state prompt.
 */

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

export class MeshAdapter implements CadProvider {
  readonly kind = "mesh" as const;

  get name(): string {
    return meshProvider.name;
  }

  async generate(input: CadGenerationInput): Promise<CadGenerationResult> {
    const { jobId } = await meshProvider.generateMesh({ prompt: input.prompt });

    const startedAt = Date.now();
    let lastProgress = -1;

    for (;;) {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        throw new Error(`Mesh generation timed out after ${POLL_TIMEOUT_MS / 1000}s`);
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const status = await meshProvider.checkStatus(jobId);

      if (status.status === "failed") {
        throw new Error(status.error ?? "Mesh generation failed");
      }
      if (
        typeof status.progress === "number" &&
        status.progress !== lastProgress &&
        input.onProgress
      ) {
        lastProgress = status.progress;
        await input.onProgress(status.progress);
      }
      if (status.status === "complete" && status.result) {
        return {
          meshUrl: status.result.meshFileUrl,
          meshFormat: status.result.format,
          externalId: jobId,
        };
      }
    }
  }
}
