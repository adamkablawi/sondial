/**
 * Utilities for handling zip files from the HuggingFace model output.
 * The HF model outputs a zip file that, when unzipped, contains an OBJ file
 * (and optionally an MTL file and textures).
 *
 * In production, this runs server-side:
 *   1. Download zip from HF
 *   2. Extract OBJ (and MTL if present)
 *   3. Upload extracted files to storage (S3/R2)
 *   4. Return URLs to the OBJ and optional MTL
 */

export interface ExtractedMeshFiles {
  objUrl: string;
  mtlUrl?: string;
  textureUrls?: string[];
}

/**
 * Extract mesh files from a zip buffer.
 * Uses JSZip or native decompression depending on environment.
 *
 * Placeholder — implementation depends on chosen zip library and storage backend.
 */
export async function extractMeshFromZip(_zipBuffer: ArrayBuffer): Promise<ExtractedMeshFiles> {
  // TODO: Implement when HF model integration is ready
  // 1. Decompress zip
  // 2. Find .obj file (and optional .mtl, texture files)
  // 3. Upload to object storage
  // 4. Return signed URLs
  throw new Error("Zip extraction not yet implemented — waiting for HF model integration");
}

/**
 * Detect which mesh files are present in a zip.
 */
export function detectMeshFiles(fileNames: string[]): {
  objFile?: string;
  mtlFile?: string;
  textureFiles: string[];
} {
  const objFile = fileNames.find((f) => f.toLowerCase().endsWith(".obj"));
  const mtlFile = fileNames.find((f) => f.toLowerCase().endsWith(".mtl"));
  const textureFiles = fileNames.filter((f) =>
    /\.(png|jpg|jpeg|bmp|tga)$/i.test(f),
  );

  return { objFile, mtlFile, textureFiles };
}
