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

## The constraint that shapes everything

**Meshy has no endpoint that edits an existing mesh.** Verified against their API
docs: text-to-3D, image-to-3D, retexture, remesh, rigging — but nothing that takes
"existing mesh + instruction → modified mesh". `refine` mode only textures a
completed `preview` task.

So geometric continuity between versions **cannot come from the vendor**. It is
carried semantically by the design state (`src/lib/design-state.ts`): every version
owns a full structured description, and each edit evolves the previous state rather
than starting from a bare chat message. The state is the record of truth; the Meshy
prompt is a lossy per-generation projection of it.

Corollary: **millimetre-precise requests ("move the holes 10 mm up") are not
reliably achievable.** Meshy is generative, not a parametric CAD kernel. That class
of edit needs OpenSCAD/CadQuery and is out of scope today. Don't promise it.

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
  Every function degrades to a deterministic non-LLM path with no `OPENAI_API_KEY`.
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
  is how the system is tested.
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
- **AR is not implemented.** The viewer is desktop R3F. `@react-three/xr` is not
  installed; the scene graph is isolated in `ModelLoader` so wrapping it in an XR
  session is contained, but treat AR as unstarted.
- **`/api/export`** still just echoes back the same URL — no format conversion.
- **The old single-player flow still exists** at `/project/editor` with
  `src/components/editor/EditChat.tsx` and `/api/{brief,edit,generate,image-generate,status}`.
  `/api/generate`, `/api/status`, and `/api/proxy` are still used (the worker and
  viewer depend on proxy); the editor page itself is now orphaned — a deletion
  candidate, left in place deliberately rather than removed without asking.
- `src/lib/model-cache.ts` and `src/lib/zip-utils.ts` remain unused/unimplemented.
- `plans/refactor-editor-for-real-models.md` is a **stale, unimplemented** design
  doc from the previous architecture. Ignore it.
