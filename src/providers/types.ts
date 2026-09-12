// ── Shared types ──

export type JobStatus = "pending" | "processing" | "complete" | "failed";

// ── Image generation: Text → Image (HuggingFace Stable Diffusion) ──

export interface ImageGenerationProvider {
  readonly name: string;
  generateImage(prompt: string): Promise<{ imageDataUrl: string }>;
}

// ── Mesh generation: Image → Mesh ──

export interface MeshGenerationResult {
  meshFileUrl: string;
  format: "obj" | "stl" | "glb" | "fbx";
  metadata?: {
    vertices?: number;
    faces?: number;
  };
}

export interface MeshGenerationProvider {
  readonly name: string;

  generateMesh(input: {
    image?: string;  // base64 encoded (image-to-3D)
    prompt?: string; // text description (text-to-3D)
    format?: "obj" | "stl" | "glb";
  }): Promise<{ jobId: string }>;

  checkStatus(jobId: string): Promise<{
    status: JobStatus;
    progress?: number;
    result?: MeshGenerationResult;
    error?: string;
  }>;
}

// ── Pipeline stage tracking ──

export type PipelineStage =
  | { stage: "upload"; status: "started" | "complete" }
  | { stage: "image_generation"; status: "started" | "processing" | "complete" | "failed" }
  | { stage: "mesh_generation"; status: "started" | "processing" | "complete" | "failed"; progress?: number }
  | { stage: "ready"; status: "complete" };
