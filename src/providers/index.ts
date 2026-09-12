import { MockMeshProvider } from "./mesh-generation/mock-provider";
import { MeshyProvider } from "./mesh-generation/meshy-provider";
import { MockLlmProvider } from "./llm/mock-provider";
import { GrokProvider } from "./llm/grok-provider";
import { AnthropicProvider } from "./llm/anthropic-provider";

import type { MeshGenerationProvider, LlmProvider } from "./types";

const meshProviders: Record<string, new () => MeshGenerationProvider> = {
  mock: MockMeshProvider,
  meshy: MeshyProvider,
};

const llmProviders: Record<string, new () => LlmProvider> = {
  mock: MockLlmProvider,
  grok: GrokProvider,
  anthropic: AnthropicProvider,
};

function createProvider<T>(map: Record<string, new () => T>, envKey: string, fallback: string): T {
  const key = process.env[envKey] ?? fallback;
  const Provider = map[key];
  if (!Provider) {
    throw new Error(
      `Unknown provider "${key}" for ${envKey}. Options: ${Object.keys(map).join(", ")}`,
    );
  }
  return new Provider();
}

/**
 * Lazily constructed so that importing this module never throws at load time —
 * the worker reads .env before touching a provider, and Next.js route modules
 * are evaluated at build time when no secrets exist.
 */
let _mesh: MeshGenerationProvider | undefined;
let _llm: LlmProvider | undefined;

export function getMeshProvider(): MeshGenerationProvider {
  _mesh ??= createProvider(meshProviders, "MESH_PROVIDER", "mock");
  return _mesh;
}

export function getLlmProvider(): LlmProvider {
  _llm ??= createProvider(llmProviders, "LLM_PROVIDER", "mock");
  return _llm;
}
