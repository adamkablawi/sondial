import { NodeIO } from "@gltf-transform/core";

/**
 * Bakes a fixed glossy finish into a GLB.
 *
 * Why this has to happen to the file itself, not in the on-page viewer: AR
 * placement (Scene Viewer, Quick Look) hands the GLB/USDZ URL to a closed
 * native app that fetches and renders it independently — a Three.js material
 * override in the desktop viewer is invisible to them. Baking the finish into
 * the stored GLB is also what keeps the desktop viewer and AR showing the same
 * thing, since both then load the exact same file.
 *
 * Text-to-3D generation runs in Meshy's "preview" mode for speed. Verified
 * directly against a real generation's output (not assumed from docs): preview
 * mode emits no `materials` array at all, and mesh primitives carry no
 * material reference — there is nothing to edit, only something to create and
 * attach. An earlier version of this function only adjusted existing
 * materials, which made it a silent no-op on every current generation.
 */

// Low roughness reads as glossy; low metalness keeps it dielectric (glossy
// ceramic/plastic/lacquer) rather than chrome, which suits generated consumer
// objects (mugs, bottles, everyday products) better than a mirror-metal look.
const GLOSS_ROUGHNESS = 0.15;
const GLOSS_METALNESS = 0.05;
// glTF's own default base color when nothing else is specified — neutral and
// unlikely to clash with whatever lighting a viewer or AR session provides.
const DEFAULT_BASE_COLOR: [number, number, number, number] = [1, 1, 1, 1];

export async function applyGlossyFinish(glb: Buffer): Promise<Buffer> {
  const io = new NodeIO();
  const document = await io.readBinary(new Uint8Array(glb));
  const root = document.getRoot();

  // Materials that already exist (an image-to-3D result, or a future refine-
  // mode output) keep their base color / texture maps — only the finish changes.
  for (const material of root.listMaterials()) {
    material.setRoughnessFactor(GLOSS_ROUGHNESS);
    material.setMetallicFactor(GLOSS_METALNESS);
  }

  // Primitives with no material at all (the common case today) get one shared
  // glossy material created and attached, rather than being left to whatever
  // default a given renderer falls back to.
  let sharedMaterial: ReturnType<typeof document.createMaterial> | null = null;
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMaterial()) continue;
      if (!sharedMaterial) {
        sharedMaterial = document
          .createMaterial("glossy-finish")
          .setBaseColorFactor(DEFAULT_BASE_COLOR)
          .setRoughnessFactor(GLOSS_ROUGHNESS)
          .setMetallicFactor(GLOSS_METALNESS);
      }
      primitive.setMaterial(sharedMaterial);
    }
  }

  const bytes = await io.writeBinary(document);
  return Buffer.from(bytes);
}
