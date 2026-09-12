# CLAUDE.md

Operational memory for working in this repo. Keep this file concise; update it when
architecture or conventions actually change, not for one-off task notes.

## What this is

Single Next.js 16 (App Router, Turbopack) app, package name `itera`, product name "Itera" —
upload a photo and/or describe an object, generate a 3D mesh, iterate on it via a chat panel.
**Not a monorepo** — one `package.json`, no `packages/`/`apps/` split, no separate backend
service (API routes under `src/app/api/*` are the entire backend).

**No git repository exists at the project root** (`git status` fails with "not a git
repository"). If asked to commit, confirm with the user before running `git init` — don't do
it silently.

No test framework (no jest/vitest/playwright, no `*.test.*` files) and no CI config
(no `.github/workflows` or similar) exist in the repo.

## Architecture map

- **Entry points:** `src/app/page.tsx` (home — upload/prompt/generate), `src/app/project/editor/page.tsx` (3D editor + chat)
- **API routes** (`src/app/api/*`, all thin stateless Route Handlers):
  - `brief/` — image+prompt → design brief text (OpenAI GPT-4o vision; degrades to raw prompt with no key)
  - `image-generate/` — text → image (via `imageProvider`)
  - `generate/` — image/prompt → mesh job, returns `jobId` (via `meshProvider`)
  - `status/[jobId]/` — poll a mesh job (`meshProvider.checkStatus`)
  - `edit/` — description + instruction → new prompt (OpenAI GPT-4o-mini; degrades to string concat)
  - `export/` — **stub**: just echoes the same `modelUrl` back, no real format conversion
  - `proxy/` — streams external model URLs through the backend (CORS + Vercel body-size limit workaround)
- **Providers** (`src/providers/`): swappable `mesh-generation/{mock,hf,meshy}` and
  `image-generation/{mock,hf}`, selected via `MESH_PROVIDER` / `IMAGE_PROVIDER` env vars in
  `src/providers/index.ts` (`createProvider`). Shared interfaces in `src/providers/types.ts`.
  Async mesh jobs use `src/providers/job-store.ts`, a `globalThis`-backed `Map` (survives
  Next dev hot-reload), polled by the client every 500ms.
- **State:** one Zustand store, `src/stores/project-store.ts`, persisted to localStorage
  (`persist` middleware, key `"itera-project"`) — pipeline stage, source image, description,
  model url/format, edit history, chat messages. All cross-page state lives here.
- **Viewer:** `src/components/viewer/{ModelViewer,ModelLoader}.tsx` — React Three Fiber
  Canvas; `ModelLoader` picks OBJ/STL/GLTF loader by file extension or an explicit
  `formatHint` (needed for blob/proxy URLs with no extension). Also publishes the loaded
  scene to a `globalThis` ref (`src/lib/scene-ref.ts`) to sidestep the R3F/DOM reconciler
  boundary — no other code currently reads that ref.
- `src/lib/model-cache.ts` — IndexedDB blob cache helpers (`cacheModelBlob` /
  `fetchAndCacheModel` / `restoreModelFromCache`). **Currently unused/dead code** — not
  imported anywhere else. Don't assume models survive a refresh; the store only persists a
  URL (blob: URLs die on refresh, external URLs go through `/api/proxy`).
- `src/lib/zip-utils.ts` — placeholder; `extractMeshFromZip` throws "not yet implemented".

## Critical flow: generate (`src/app/page.tsx` → `handleGenerate`)

Upload → `POST /api/brief` (description) → *(if no image)* `POST /api/image-generate` →
`POST /api/generate` (starts mesh job) → poll `GET /api/status/[jobId]` every 500ms →
rewrite external mesh URLs through `/api/proxy` → `setModel` in the store → navigate to
`/project/editor`.

## Critical flow: edit (`src/app/project/editor/page.tsx` → `handleSendInstruction`)

`POST /api/edit` (description + instruction → new prompt, GPT-4o-mini) → `POST
/api/image-generate` (new prompt → new image) → `POST /api/generate` (new image → new mesh
job) → poll status → `setModel` + `addEdit` + `addMessage`.

**Important:** every chat instruction regenerates the image and reruns the *entire* mesh
pipeline from scratch. There is no client-side geometry editing (scale/translate/recolor/etc.
applied directly to the loaded Three.js scene) currently implemented, despite what
`plans/refactor-editor-for-real-models.md` describes — see below.

## `plans/refactor-editor-for-real-models.md` is a stale, unimplemented design doc

It describes a materially different editor architecture: `BRepPart` → `ScenePart` types,
`extractPartsFromScene`, `src/lib/instruction-parser.ts`, `src/lib/edit-engine.ts`,
`src/components/viewer/PartTree.tsx`, and an OpenSCAD-backed `/api/cad-edit` route for
client-side ops like `fillet_edges`, with only `fillet_edges` falling back server-side.
**Verified: none of these files exist in `src/`.** Treat this file as a proposal/roadmap, not
current behavior — don't assume its types or files exist without checking.

Two small traces of this unfinished work remain and are otherwise dead code:
- `ModelLoader.tsx` has a `/api/cad-edit/.../result` URL pattern check for STL detection —
  unreachable since no route currently produces such URLs.
- `.claude/settings.json` pre-approves invoking a Windows-path OpenSCAD binary, suggesting
  this was explored (possibly on another machine) but never landed here.

## Conventions to follow (current, repeated patterns)

- **API routes:** `export async function POST/GET`, whole body wrapped in try/catch, `catch`
  returns `NextResponse.json({ error: message }, { status: 500 })`, inputs narrowed with `as {
  ... }` casts — no runtime schema validation library in use (no zod/yup).
- **Providers:** a class implementing `MeshGenerationProvider` or `ImageGenerationProvider`
  (`src/providers/types.ts`), registered in the map in `src/providers/index.ts`, selected by
  env var with `mock` as the universal no-key-required fallback. `meshy-provider.ts` is the
  fully-implemented reference; `hf-provider.ts` (mesh) is intentionally a partial stub —
  match whichever level of completeness the task calls for, don't silently "finish" a stub
  provider unless asked.
- **Async jobs:** use `jobStore` (`src/providers/job-store.ts`) + client polling against
  `/api/status/[jobId]` every 500ms. Prefer this over introducing webhooks/queues for new
  long-running provider work.
- **OpenAI calls:** always guarded by `if (apiKey)` with a graceful degrade path (return the
  raw prompt/instruction) when absent — every LLM-touching route must keep working with zero
  keys configured; this is a first-class requirement (README: "Everything defaults to mock
  providers").
- **Client state:** everything that must survive navigation to `/project/editor` goes in the
  single `project-store.ts` Zustand store, not component-local state.
- **Styling:** Tailwind v4 utility classes inline in JSX; no CSS modules / styled-components.
- Every interactive component/page file starts with `"use client"`.

## Build / verify

- `npm run lint` — ESLint flat config (`eslint.config.mjs`), extends
  `eslint-config-next` core-web-vitals + typescript.
- `npx tsc --noEmit` — `tsconfig.json` has `strict: true`; this is the closest thing to CI
  verification available locally (there is no test runner and no CI pipeline).
- Deploys to Vercel (`.vercel/project.json`, `.vercelignore` present); no other
  infra-as-code in the repo.

## Environment / secrets

`.env.local` (gitignored) holds: `MESH_PROVIDER`, `IMAGE_PROVIDER`, `MESHY_API_KEY`,
`HF_API_TOKEN`, `HF_IMAGE_MODEL`, `HF_ENDPOINT`, `OPENAI_API_KEY`. Confirmed in code (not
just the README) that every provider defaults to `mock` and every OpenAI call degrades
gracefully with zero keys set.

## Known gaps / dead or stubbed code — verify before depending on these

- `/api/export` always returns the same `modelUrl` unchanged — no real format conversion,
  despite the editor UI implying OBJ/GLB/STL/FBX export.
- `src/lib/model-cache.ts` and `src/lib/zip-utils.ts` are unused/unimplemented.
- `HuggingFaceProvider.checkStatus` (mesh-generation) always returns
  `{status: "pending", error: "HuggingFace provider not yet implemented"}`.
- `plans/refactor-editor-for-real-models.md` — see dedicated section above.
