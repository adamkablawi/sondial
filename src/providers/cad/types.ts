/**
 * One interface over two very different vendors.
 *
 * Meshy generates a mesh from a text prompt and carries nothing between
 * versions. Zoo generates parametric KCL source and can be handed the previous
 * version's code to edit precisely. Both are reduced to a single call that
 * returns when the work is done, so the worker doesn't branch on vendor.
 */

export interface CadGenerationInput {
  /** The participant's raw natural-language request. */
  instruction: string;
  /** Visual prompt compiled from the design state. Used when there is no prior source. */
  prompt: string;
  /**
   * Previous version's KCL. When present, a source-based provider edits it
   * rather than regenerating, which is what keeps geometry continuous.
   */
  previousSource?: string | null;
  /** Coarse progress for the room's job indicator. */
  onProgress?: (percent: number) => void | Promise<void>;
}

export interface CadPreview {
  data: Buffer;
  mimetype: string;
}

export interface CadGenerationResult {
  /** Mesh-based providers: a URL the viewer can load. */
  meshUrl?: string;
  meshFormat?: string;
  /** Source-based providers: the parametric source that defines this version. */
  source?: string;
  sourcePath?: string;
  /** Rendered still, when the vendor produces one. */
  preview?: CadPreview;
  /** Vendor-side id, retained for audit. */
  externalId?: string;
}

export interface CadProvider {
  readonly name: string;
  /**
   * "mesh": each generation is independent geometry.
   * "source": versions carry editable source, so edits are precise.
   */
  readonly kind: "mesh" | "source";
  generate(input: CadGenerationInput): Promise<CadGenerationResult>;
}
