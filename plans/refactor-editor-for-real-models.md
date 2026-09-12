# Refactor Editor to Work with Real Meshy Models

## Context

The editor pipeline was built around contrived BRep data from the mock provider (fake "top_face", "bottom_face" parts, fake surface types). Now that we use real Meshy models, the editor needs to:

1. Give the LLM actual geometric context about the loaded model (not fake BRep parts)
2. Remove dependency on the BRep conversion step entirely (Meshy models are already viewable)
3. Use OpenSCAD as the working server-side edit provider for operations like fillet
4. Add a "scene inspection" tool call so the LLM can understand what it's editing

## Current Problems

- `extractPartsFromScene()` in `mesh-utils.ts` guesses surface types from bounding box ratios — meaningless for organic Meshy meshes
- The mock BRep provider returns hardcoded cube faces (6 fake faces) — this data never corresponds to the actual model
- `instruction-parser.ts` sends these fake parts to GPT-4o which makes decisions on wrong data
- The editor page splits commands into "client-side" and "CAD-only" but the CAD path uses Autodesk references; should use OpenSCAD
- The homepage pipeline runs a BRep conversion step that adds nothing with real models

## Plan

### 1. Prefer OBJ format from Meshy (OpenSCAD-compatible)
**File:** `src/providers/mesh-generation/meshy-provider.ts`

- In `checkStatus`, change format preference from GLB-first to OBJ-first: `data.model_urls.obj || data.model_urls.glb || data.model_urls.fbx`
- This way OpenSCAD can import the model directly without any GLB→STL conversion
- OBJ also loads fine in Three.js via OBJLoader (already supported in ModelLoader)
- No server-side format conversion needed

### 2. Replace `extractPartsFromScene` with real scene graph extraction
**File:** `src/lib/mesh-utils.ts`

Rewrite to extract actual useful data from the Three.js scene:
- Traverse scene graph including nested groups (GLB/OBJ files may have hierarchy)
- For each mesh: name, vertex count, face count, bounding box, material color, whether it has textures
- For groups: name, child count
- Remove the `guessSurfaceType` and `describePartHint` heuristics
- Produce a structured `ScenePart` type that honestly represents what we know:

```ts
export interface ScenePart {
  id: string;
  name: string;
  type: "mesh" | "group";
  vertexCount?: number;
  faceCount?: number;
  boundingBox: { min: [number, number, number]; max: [number, number, number] };
  size: [number, number, number];
  materialColor?: string;
  hasTexture: boolean;
  children?: ScenePart[];
}
```

### 3. Update types — replace BRepPart with ScenePart throughout the edit flow
**File:** `src/providers/types.ts`

- Add `ScenePart` to types (or export from mesh-utils)
- Keep `BRepEditCommand` — the commands themselves are fine (scale, translate, rotate, recolor, delete, fillet_edges work with OpenSCAD)
- Remove `modify_face` from command types (requires face addressing we can't do)
- Remove `BRepPart` usage from the edit pipeline (keep the type for backward compat with the BRep conversion provider if needed)

### 4. Rewrite the instruction parser system prompt for real scene data
**File:** `src/lib/instruction-parser.ts`

- Change the system prompt from "BRep CAD editing assistant" to a "3D model editing assistant"
- Remove references to face/edge operations, surface types, BRep terminology
- Feed the LLM the real `ScenePart[]` data: mesh names, vertex counts, sizes, colors, texture info
- The LLM should reason about what it can see in the screenshot + the scene structure
- Remove `modify_face` from available commands
- Keep fillet_edges (OpenSCAD can do this) but note it will re-export as STL
- Update `buildContextPrompt` to format `ScenePart[]` instead of `BRepPart[]`
- Update `fallbackParse` to work with `ScenePart[]`

### 5. Simplify the editor page — remove CAD-only split, use OpenSCAD directly
**File:** `src/app/project/editor/page.tsx`

- Remove the `CAD_ONLY_COMMANDS` / `isClientSideCommand` split
- Instead: try all commands client-side via `applyEditToScene()` first
- For `fillet_edges` (returns `false` from edit-engine): route to `/api/cad-edit` which uses OpenSCAD
  - OpenSCAD reads the OBJ file, applies minkowski fillet, returns STL
  - The result STL is served from `/api/cad-edit/{jobId}/result` (already works)
- Remove `describeCadCommand` and `pollCadJob` cleanup
- Update `handleSceneReady` to use new `ScenePart[]`
- Update `handleSendInstruction` to send `ScenePart[]` instead of `BRepPart[]`

### 6. Skip BRep conversion for Meshy models in the homepage pipeline
**File:** `src/app/page.tsx`

- After mesh generation completes, skip the BRep conversion step entirely
- Go directly from mesh result → cache model → set model URL → navigate to editor
- The mock BRep conversion only passed through the mesh URL and added fake parts anyway
- Parts will be extracted from the actual Three.js scene in the editor via `handleSceneReady`

### 7. Update the store and UI components for ScenePart
**Files:**
- `src/stores/project-store.ts` — change `parts: BRepPart[]` to `parts: ScenePart[]`
- `src/components/viewer/PartTree.tsx` — update to display `ScenePart` (show vertex count instead of surface type icon)
- `src/app/api/edit/route.ts` — accept `ScenePart[]` instead of `BRepPart[]`

### 8. Clean up edit-engine.ts
**File:** `src/lib/edit-engine.ts`

- `fillet_edges` continues to return `false` (caller routes to server-side OpenSCAD)
- Remove `modify_face` handling
- Everything else (scale, translate, rotate, recolor, replace_shape, delete) stays as-is

## Files to modify (in order)
1. `src/providers/mesh-generation/meshy-provider.ts` — prefer OBJ format
2. `src/lib/mesh-utils.ts` — new `ScenePart` type, rewrite extraction
3. `src/providers/types.ts` — add `ScenePart`, remove `modify_face`
4. `src/lib/instruction-parser.ts` — new system prompt, ScenePart context
5. `src/lib/edit-engine.ts` — remove modify_face
6. `src/stores/project-store.ts` — ScenePart in store
7. `src/app/api/edit/route.ts` — accept ScenePart
8. `src/components/viewer/PartTree.tsx` — display ScenePart
9. `src/app/project/editor/page.tsx` — simplify flow, remove BRep split
10. `src/app/page.tsx` — skip BRep conversion step

## Verification
1. `tsc --noEmit` — compiles clean
2. Generate a model from Meshy → editor loads, PartTree shows real mesh names
3. Chat "make it red" → recolor works client-side
4. Chat "make it bigger" → scale works client-side
5. Chat "fillet the edges" → routes to OpenSCAD (OBJ input), returns modified STL
6. Refresh page → model restores from IndexedDB cache
