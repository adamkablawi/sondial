# CLAUDE.md

Operational memory for working in this repo. Keep it concise; update it when
architecture or conventions actually change, not for one-off task notes.

## What this is

**Sondial** — a collaborative CAD-review workspace. Participants join a shared room,
discuss a product in real time, and request changes in natural language. Each
request becomes an immutable new version of the 3D object.

Grew out of a single-player image→3D generator (package name is still `itera`).
Not a monorepo: one `package.json`, one Next.js app, plus two standalone Node
processes under `server/`.

## Two pipelines, picked by CAD_PROVIDER

`src/providers/cad/` puts one interface over two vendors with very different
properties. `CAD_PROVIDER=zoo` or `mesh` (default `mesh`, so an install with no
Zoo key behaves exactly as before).

### zoo — parametric and precise (preferred)

Zoo returns **KCL source**, and each edit is applied to the previous version's
source. Verified end-to-end: "move the two holes 10mm further apart" changed
**one line out of 82** — `holeSpacing = 60mm` → `70mm`. That class of edit is not
achievable with mesh generation at all.

`ObjectVersion.cadSource` is the real artifact for these versions. Protocol facts
below were established by probing the live API — the OpenAPI spec misleads here:

- REST text-to-cad creation is **no longer public**: only `GET /user/text-to-cad`
  (list) plus an `OPTIONS` stub under `/hidden/`. Generation goes through the
  `wss://api.zoo.dev/ws/ml/copilot` websocket.
- The authoritative KCL arrives in **`tool_output.result.outputs`** (map of path →
  plain text), *not* in the `files` message.
- `files` is something else entirely: an array of **rendered preview JPEGs** as
  byte arrays. Stored on the version, served from `/api/versions/{id}/preview`.
- `current_files` must be sent as **byte arrays**, not strings.
- The vendor reports no percentage, so worker progress is inferred from message
  activity and capped below 100 until `end_of_stream`.

Not done: interactive 3D. Rendering KCL needs a second protocol
(`/ws/modeling/commands`); the viewer shows Zoo's rendered still instead.

### mesh — the original stack, kept as a fallback

`MESH_PROVIDER=meshy|huggingface|mock` behind `MeshAdapter`, which owns the
submit-and-poll loop. **Meshy has no endpoint that edits an existing mesh**, so
continuity cannot come from the vendor on this path — it is carried semantically
by the design state (`src/lib/design-state.ts`), and millimetre-precise requests
are not achievable. Don't promise them.

The design state runs for both providers: it drives the first generation and
gives the room a readable narrative. Under zoo it is commentary; the KCL is what
actually defines the object.

## Processes

`npm run dev` runs all three via `concurrently`:

| Process | Script | Port | Role |
|---|---|---|---|
| Next app | `dev:next` | 3000 | UI + API routes |
| Realtime | `dev:realtime` | 3001 | Socket.IO fan-out, presence |
| Worker | `dev:worker` | — | BullMQ consumer, generation |

Infra is **native Homebrew Postgres + Redis** (`infra:brew:up` / `infra:brew:down`).
`docker-compose.yml` is an equivalent alternative (`infra:docker:up`) but uses
shifted host ports 5433/6380 — `.env` must match whichever you run.

## Architecture

- **`prisma/schema.prisma`** — Project, Room, Participant, ChatMessage,
  ObjectVersion (self-referential `parentId` DAG), VersionDescription,
  GenerationJob. Core invariant: **versions are immutable**; an edit creates a
  child plus a new description. Descriptions are never overwritten.
- **`src/lib/events.ts`** — the realtime contract shared by every process. Change
  it and you change the worker, the socket server, and the client at once.
- **`src/lib/design-state.ts`** — seed / evolve / classify / project-to-prompt.
  Every function degrades to a deterministic non-LLM path when no LLM is
  configured. The HTTP call itself lives in **`src/lib/llm.ts`**, which
  dispatches on `LLM_PROVIDER` (`anthropic` | `openai` | `mock`, defaulting to
  whichever key is present) and **returns `null` rather than throwing** on any
  failure. That null is the contract the fallbacks rest on — preserve it.
- **`server/worker.ts`** — concurrency pinned to **1** so requests apply in a
  defined order and version numbering stays race-free. Don't raise it without
  solving version-number allocation.
- **`src/lib/serialize.ts`** — DTO mapping plus `publishRoomEvent`, the single
  fan-out path.

### Flow of one change request

```
chat INSTRUCTION -> POST /api/rooms/[slug]/messages
  -> persist ChatMessage + GenerationJob (pinned to current head)
  -> BullMQ enqueue -> Redis
  -> worker: rebase check -> evolve design state -> compile prompt
  -> Meshy generate + poll
  -> new ObjectVersion + VersionDescription, project head moves
  -> publish to Redis -> Socket.IO -> every participant
```

**Persist before broadcast, always.** The socket layer is pure fan-out; clients
never write through it. That is why a dropped connection can't lose a message —
`useRoomSocket` re-fetches the snapshot on reconnect.

### Concurrent edits

Two people editing the same base version is the *normal* case, so the worker
**auto-rebases**: if the head moved while a job was queued, the instruction is
re-applied onto the new head, `rebasedFromVersionId` is recorded, and a SYSTEM
message explains it in chat. Verified end-to-end — concurrent edits chain
(v1→v2→v3) rather than one clobbering the other.

## Conventions

- **API routes**: `export async function POST/GET`, whole body in try/catch,
  `NextResponse.json({ error }, { status })`, inputs narrowed with `as { … }`
  casts. No runtime schema library in use — don't add one casually.
- **Providers** (`src/providers/`): class implementing the interface in
  `types.ts`, registered in `index.ts`, selected by env var, `mock` as the
  universal no-key fallback. `meshy-provider.ts` is the reference implementation;
  the mesh `hf-provider.ts` is deliberately a stub.
- **Everything must run with zero API keys.** Mock providers plus non-LLM design
  state fallbacks make the whole pipeline exercisable offline — preserve this, it
  is how the system is tested. The mock mesh provider returns
  `public/samples/mock.glb` (GLB, like Meshy) rather than an OBJ, so the AR path
  is exercisable keylessly too.
- **Env precedence** for the standalone processes is handled by `server/env.ts`:
  shell > `.env.local` > `.env`, mirroring Next. Import it first in any new
  server entry point, or provider keys in `.env.local` will be silently missed.
- **globalThis singletons** (`db`, `publisher`, `generationQueue`) — survives Next
  hot-reload and keeps the worker from leaking pools. Follow this for new clients.
- Tailwind utilities inline; `"use client"` on every interactive component.

## Verify

- `npm run typecheck` — clean, and the real safety net here.
- `npm run lint` — **2 pre-existing errors remain** in
  `src/components/viewer/ModelLoader.tsx` (setState inside effect bodies, lines
  ~147 and ~194). Both predate this work and are load-bearing for scene
  reset/init. Fixing them means refactoring the R3F viewer — do it only with a
  browser to verify against, since nothing else covers that component.
- There is still **no test suite and no CI**.

## Known gaps — check before relying on these

- **`JobStrategy.RETEXTURE` is classified and recorded but not executed.** Both
  strategies currently run a full regeneration. Wiring retexture to Meshy's
  retexture endpoint is the highest-value next step: it is the *only* path that
  preserves geometry exactly.
- **Approvals are schema-only.** `VersionStatus` has APPROVED/REJECTED/SUPERSEDED
  and the timeline renders them, but no endpoint sets them, and there is no
  restore/branch/compare UI yet.
- **Closing a room is a permanent delete, by explicit choice** — not an archive.
  `DELETE /api/rooms/[slug]` drops the room, chat, jobs, versions and design-state
  history, and any participant may do it. Deletion order in that route is
  load-bearing: jobs before versions (`GenerationJob.baseVersion` is required, so
  Postgres would otherwise refuse), and `parentId` is nulled first because version
  lineage is self-referential. Don't "simplify" it to a bare `project.delete`.
- **AR reaches the platform viewers only, and GLB only.** `ARLauncher` renders a
  collapsed, inert `<model-viewer>` purely to call `activateAR()` — WebXR and
  Scene Viewer on Android. The on-screen viewer is still R3F; `@react-three/xr`
  is not installed, so there is no in-page XR session. On iOS, Quick Look will
  not open a GLB and `ObjectVersion` still has no USDZ column, so the GLB is
  converted in the browser with three's `USDZExporter` and Quick Look is handed
  a blob URL; a caller-supplied `usdzUrl` always wins, and if the conversion
  throws the QR handoff remains. Remaining gap: non-GLB versions get no AR
  button at all, by design. Scene Viewer fetches the mesh itself, so the URL
  must be reachable from the phone — `localhost` will not do over a LAN.
- **`/api/export`** still just echoes back the same URL — no format conversion.
- **The old single-player flow still exists** at `/project/editor` with
  `src/components/editor/EditChat.tsx` and `/api/{brief,edit,generate,image-generate,status}`.
  `/api/generate`, `/api/status`, and `/api/proxy` are still used (the worker and
  viewer depend on proxy); the editor page itself is now orphaned — a deletion
  candidate, left in place deliberately rather than removed without asking.
- `src/lib/model-cache.ts` and `src/lib/zip-utils.ts` remain unused/unimplemented.
- `plans/refactor-editor-for-real-models.md` is a **stale, unimplemented** design
  doc from the previous architecture. Ignore it.

## Zoo (zoo.dev) — CAD generation

`MESH_PROVIDER=zoo` generates **parametric CAD via KCL source**, not a mesh.
This changes the constraint at the top of this file: Meshy cannot edit an
existing mesh, but KCL is code, so with Zoo geometric continuity between
versions is achievable for real rather than carried semantically. The design
state remains useful as the record of intent; it is no longer the *only*
carrier of continuity. Treat that as an open design question, not a settled one.

Zoo retired the REST create endpoint (`POST /ai/text-to-cad/*` returns 404,
while protected routes return 401 — the routes are gone, not merely
unauthorized). Generation is `wss://api.zoo.dev/ws/ml/copilot`:

- Auth is a `{type:"headers", headers:{Authorization:"Bearer …"}}` message sent
  **after** connecting, not a handshake header. Verified against the live API.
- A `{type:"ping"}` heartbeat every ~5s is mandatory or the server drops you.
- Server messages are single-key objects (`{delta:…}`, `{files:…}`,
  `{error:{detail}}`), unlike the `type`-tagged client messages.
- The socket returns **KCL**. Geometry arrives separately: the run produces a
  Text-to-CAD record whose `outputs` hold base64 geometry, fetched over REST.
  `/api/zoo/mesh/[id]` is the only place the key is used browser-side, because
  Zoo's outputs are account-scoped and cannot be linked to directly.

**Unverified without a live key:** whether a copilot run always produces a
Text-to-CAD record carrying evaluated geometry, or only KCL. If it is KCL-only,
rendering needs `/ws/modeling/commands` (Zoo's engine socket) — note that
`/file/execute/{lang}` is go/python/node only and `/file/conversion` does not
accept KCL as an import format, so there is no REST shortcut.

## Local setup notes

Infra here is **Postgres.app on the default 5432** plus **Homebrew Redis on
6379**, not the shifted docker-compose ports — `.env.local` matches that.
`prisma.config.ts` loads `.env.local` over `.env`, the same precedence
`server/env.ts` uses; without that the Prisma CLI cannot see `DATABASE_URL`.

The `init` migration was renamed to `20260911215900_init` so it sorts ahead of
the participant-uniqueness migration that drops an index it creates. Keep any
new migration's timestamp after both.
