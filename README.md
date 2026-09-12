# Sondial

A collaborative, real-time CAD-review workspace. People join a shared room,
discuss a physical product, and request changes in plain language — each
request becomes a new, immutable version of a generated 3D model that
everyone in the room sees update live, and can drop into AR at real scale.

---

## User guide

### 1. Run it

```bash
npm install
npm run infra:brew:up   # native Postgres + Redis — see "Local infrastructure" below
npm run db:migrate
npm run dev
```

This starts three processes together: the Next.js app (`:3000`), the
Socket.IO realtime server (`:3001`), and the BullMQ worker that actually runs
generation. Open [http://localhost:3000](http://localhost:3000).

With no API keys configured at all, everything still runs — mesh generation,
image generation, and the LLM design-state reasoning all fall back to `mock`
providers, so the whole pipeline (including AR) is exercisable offline. See
[Environment variables](#environment-variables) to wire up real providers.

### 2. Start a room

On the home page, give the object a **name** and a **brief** (what it is,
roughly), optionally some manufacturing **constraints**, and hit **Create
room**. You're dropped straight into it. Anyone else can join the same room
either from the room list on the home page or by typing its room code into
**Join by code**.

### 3. Talk to it

The chat composer has two modes, toggled above the input:

- **Discuss** — plain conversation. Nothing is generated; use it to align on
  intent before spending a generation.
- **Request change** — an instruction that actually produces a new version,
  e.g. *"make the handle 15% thicker"* or *"switch to a matte ceramic
  finish."* The first request in an empty room generates the initial model
  from your brief; every one after that evolves the current version rather
  than starting over.

Everyone in the room sees the same chat, the same generation progress, and
the same resulting model, live — there's no separate "your version" per
person. If two people request changes against the same base at once, the
second is automatically rebased onto the first (chat explains this when it
happens) rather than one silently overwriting the other.

### 4. Review the model

The centre pane is the live 3D viewer. The **Design state** panel (left)
shows the structured, durable description of the object — summary, geometry,
materials & finish, dimensions, manufacturing constraints, function, and
rationale — which is what every edit is actually grounded in, not just the
raw chat history. The **version timeline** (bottom) shows every generation as
a numbered card; click an older one to review it (a banner marks you as
viewing history), and **Follow latest** snaps back to the current head.

### 5. View it in AR

**Place it in the room** (desktop, once a model exists) or the inline AR
banner (mobile) hands off to your platform's real AR viewer — WebXR or Scene
Viewer on Android, Quick Look on iOS — so it's rendered at true scale in your
actual space, not just spun around on a webpage. On desktop, use **View in AR
on your phone** to get a QR code that opens this exact room on your phone.

### 6. Get the geometry out

**Export OBJ**, in the version timeline's header, downloads whichever version
you're currently looking at as a real `.obj` file — converted client-side in
your browser, no server round-trip.

### 7. Share it with someone off your network

```bash
npm run dev:tunnel
```

Puts the whole stack behind one public ngrok URL (printed in the terminal)
instead of just `localhost` — useful for handing the room to someone on a
different network, or for the AR QR handoff to work off your LAN. Open the
link yourself in a browser once before sharing it, since ngrok's free tier
shows first-time visitors an interstitial warning page that AR's direct asset
fetch can't click through. Ctrl+C tears it down and restores your local env.

### 8. Close a room

**Close room** in the room header (or **close** on the home page's room
list) permanently deletes it — chat, versions, and design-state history
included. There's no archive or undo.

---

## How it works

```
chat "Request change" instruction
  -> POST /api/rooms/[slug]/messages
  -> persisted, queued (BullMQ / Redis), pinned to the current head version
  -> worker: rebase check -> evolve the design state -> compile a generation prompt
  -> Meshy generates the mesh
  -> new immutable ObjectVersion + description written to Postgres
  -> broadcast over Socket.IO -> everyone in the room updates live
```

The generative mesh vendor (Meshy) has no endpoint that edits an existing
mesh — there's no way to ask it for "the same object, but with a thicker
handle." So continuity between versions is carried at the application layer
instead: an LLM (Gemini or Anthropic, configurable) maintains a structured
design state across the whole session and evolves it with each instruction:
that evolved state, not the bare chat message, is what gets projected into
the next generation prompt. Without an LLM key configured, this degrades to a
deterministic non-LLM fallback rather than failing.

## Setup

### Local infrastructure

Two supported setups — pick one and match your `.env.local` to it:

| | Command | Postgres | Redis |
|---|---|---|---|
| Native (Homebrew / Postgres.app) | `npm run infra:brew:up` | `5432` | `6379` |
| Docker Compose | `npm run infra:docker:up` | `5433` | `6380` |

```bash
npm run db:migrate   # first run: create the schema
npm run db:studio    # optional: browse the database
```

### Environment variables

Copy `.env.example` to `.env.local` and fill in what you need — everything
defaults to `mock`, so the app runs with zero keys.

```env
DATABASE_URL=postgresql://<you>@localhost:5432/sondial
REDIS_URL=redis://localhost:6379

MESH_PROVIDER=mock    # mock | meshy | huggingface
IMAGE_PROVIDER=mock   # mock | huggingface
MESHY_API_KEY=

LLM_PROVIDER=         # anthropic | gemini | mock — defaults to whichever key is present
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
```

See `.env.example` for the complete, commented list (model overrides,
HuggingFace image generation, polycount tuning, realtime port wiring).

### Providers

| `MESH_PROVIDER` | Description |
|---|---|
| `meshy` | [Meshy AI](https://meshy.ai) — image-to-3D and text-to-3D |
| `huggingface` | HuggingFace Inference Endpoint (stub) |
| `mock` | Placeholder GLB, no API key needed (default) |

| `IMAGE_PROVIDER` | Description |
|---|---|
| `huggingface` | HuggingFace Serverless Inference (Stable Diffusion) |
| `mock` | Placeholder, no API key needed (default) |

## Project structure

```
src/
├── app/
│   ├── page.tsx                 # Home — create or join a room
│   ├── room/[slug]/             # The collaborative review room
│   ├── pitch/                   # Pitch deck outline + PowerPoint export
│   ├── project/editor/          # Orphaned single-player editor (pre-dates rooms)
│   └── api/
│       ├── rooms/               # Create/join/close a room, post chat messages
│       ├── generate, status/    # Mesh generation job lifecycle
│       ├── brief, edit          # Single-player editor's endpoints
│       ├── export/              # Model URL passthrough (no format conversion)
│       ├── lan-address/         # Resolves this machine's LAN IP for the AR QR handoff
│       └── proxy/               # CORS proxy for external model URLs
├── components/
│   ├── room/                    # ChatPanel, DesignStatePanel, VersionTimeline, PresenceBar
│   ├── viewer/                  # 3D viewer (React Three Fiber) + ARLauncher
│   ├── editor/, upload/, pipeline/  # Single-player editor's components
├── providers/                    # Mesh + image generation, one class per vendor
├── stores/                       # Zustand state (room-store, project-store)
└── lib/                          # design-state, events (realtime contract), llm, serialize

server/
├── realtime.ts                   # Socket.IO fan-out + presence
├── worker.ts                     # BullMQ consumer — runs generation, concurrency 1
└── tunnel-proxy.ts               # Collapses app + realtime behind one port for dev:tunnel
```

## Tech stack

- **Next.js 16** (Turbopack, App Router)
- **Socket.IO** — realtime chat, presence, and version broadcast
- **BullMQ + Redis** — the generation job queue
- **Prisma + Postgres** — rooms, chat, versions (a self-referential DAG), design-state history
- **React Three Fiber + Drei**, **`<model-viewer>`** — in-page 3D viewing and platform AR handoff
- **Meshy** — image/text-to-3D mesh generation
- **Gemini / Anthropic** — design-state evolution and instruction classification
- **Zustand** — client state
- **Tailwind CSS v4**
- **TypeScript**

## Known limitations

- **Millimetre-precise requests aren't achievable.** Meshy is generative, not
  a parametric CAD kernel — it can't reliably act on "move the holes exactly
  10mm apart."
- **`/api/export` doesn't convert formats** — it echoes back the same model
  URL. Real format conversion (OBJ export) happens client-side instead, from
  the version timeline's **Export OBJ** button.
- **AR reaches platform viewers only, GLB only.** Non-GLB versions get no AR
  button. Scene Viewer fetches the mesh itself, so the page must be reachable
  from the phone — `localhost` won't do over a LAN (`npm run dev:tunnel`
  solves this).
- **Retexturing regenerates the whole mesh.** It's classified separately from
  a full edit but not yet wired to Meshy's dedicated retexture endpoint, which
  is the only path that would preserve geometry exactly.
- **Approvals are schema-only** — versions can be marked approved/rejected in
  the data model, but no UI sets that yet.
- **No test suite and no CI.**
