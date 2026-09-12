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
  /**
   * Parametric source (KCL) for providers that produce it. Stored on the
   * version and handed back as `previousSource` on the next edit, which is what
   * makes a change precise instead of a fresh interpretation of the brief.
   */
  source?: string;
  sourcePath?: string;
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
    /**
     * The base version's parametric source, when it has one. Source-based
     * providers edit it directly; mesh providers ignore it and regenerate.
     */
    previousSource?: string;
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
