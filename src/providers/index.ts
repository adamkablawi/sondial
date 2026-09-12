import { MockMeshProvider } from "./mesh-generation/mock-provider";
import { HuggingFaceProvider } from "./mesh-generation/hf-provider";
import { MeshyProvider } from "./mesh-generation/meshy-provider";
import { MockImageProvider } from "./image-generation/mock-provider";
import { HuggingFaceImageProvider } from "./image-generation/hf-provider";

import type { MeshGenerationProvider, ImageGenerationProvider } from "./types";

const meshProviders: Record<string, new () => MeshGenerationProvider> = {
  mock: MockMeshProvider,
  huggingface: HuggingFaceProvider,
  meshy: MeshyProvider,
};

const imageProviders: Record<string, new () => ImageGenerationProvider> = {
  mock: MockImageProvider,
  huggingface: HuggingFaceImageProvider,
};

function createProvider<T>(map: Record<string, new () => T>, envKey: string, fallback: string): T {
  const key = process.env[envKey] ?? fallback;
  const Provider = map[key];
  if (!Provider) throw new Error(`Unknown provider "${key}" for ${envKey}`);
  return new Provider();
}

export const meshProvider = createProvider(meshProviders, "MESH_PROVIDER", "mock");
export const imageProvider = createProvider(imageProviders, "IMAGE_PROVIDER", "mock");
