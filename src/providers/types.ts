// ── Shared provider types ──

export type JobStatus = "pending" | "processing" | "complete" | "failed";

// ── LLM: brief writing and edit merging ──

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmProvider {
  readonly name: string;

  /** Plain text completion. */
  complete(messages: LlmMessage[], opts?: { maxTokens?: number; temperature?: number }): Promise<string>;

  /**
   * Vision completion: describe an image, optionally guided by text.
   * Implementations that lack vision should fall back to text-only rather
   * than throwing, so an uploaded photo degrades instead of hard-failing.
   */
  describeImage(
    imageBase64: string,
    instruction: string,
    opts?: { maxTokens?: number; temperature?: number },
  ): Promise<string>;
}

// ── Mesh generation ──

export interface MeshGenerationResult {
  /** Primary asset. GLB carries PBR materials inline — this is what the viewer loads. */
  glbUrl: string;
  /** iOS Quick Look asset. Meshy returns this natively when requested. */
  usdzUrl?: string;
  thumbnailUrl?: string;
  metadata?: {
    vertices?: number;
    faces?: number;
  };
}

export interface MeshStatus {
  status: JobStatus;
  progress?: number;
  result?: MeshGenerationResult;
  error?: string;
}

export interface MeshGenerationProvider {
  readonly name: string;

  /**
   * Start generation. For text input this starts the *preview* (geometry) pass;
   * call refineMesh() afterwards to apply textures.
   */
  generateMesh(input: { image?: string; prompt?: string }): Promise<{ jobId: string }>;

  /**
   * Start the texture pass for a completed text-to-3D preview.
   * Returns a new jobId to poll. Not needed for image-to-3D, which textures
   * in a single call.
   */
  refineMesh(previewJobId: string): Promise<{ jobId: string }>;

  checkStatus(jobId: string): Promise<MeshStatus>;

  /** True when this jobId came from text-to-3D and still needs a refine pass. */
  needsRefine(jobId: string): boolean;
}
