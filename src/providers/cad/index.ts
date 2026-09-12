import { MeshAdapter } from "./meshy-adapter";
import { ZooProvider } from "./zoo-provider";
import type { CadProvider } from "./types";

/**
 * CAD_PROVIDER picks the pipeline:
 *   zoo  — parametric KCL, edits the previous version's source precisely
 *   mesh — the existing mesh stack, steered by MESH_PROVIDER (meshy|huggingface|mock)
 *
 * Defaults to `mesh` so an install with no Zoo key keeps working exactly as before.
 */

const providers: Record<string, () => CadProvider> = {
  zoo: () => new ZooProvider(),
  mesh: () => new MeshAdapter(),
  // Convenience aliases so CAD_PROVIDER can name the mesh vendor directly.
  meshy: () => new MeshAdapter(),
  mock: () => new MeshAdapter(),
};

function create(): CadProvider {
  const key = process.env.CAD_PROVIDER ?? "mesh";
  const factory = providers[key];
  if (!factory) {
    throw new Error(
      `Unknown CAD_PROVIDER "${key}". Expected one of: ${Object.keys(providers).join(", ")}`,
    );
  }
  return factory();
}

export const cadProvider: CadProvider = create();
export type { CadProvider, CadGenerationInput, CadGenerationResult } from "./types";
