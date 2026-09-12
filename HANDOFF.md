# Handoff

Written for: a fresh Claude Code session (or human) picking this project up with
zero prior context. Read this first, then `CLAUDE.md` for the architectural
deep-dive — this file is the narrative and the current state; `CLAUDE.md` is the
concise operational reference and doesn't repeat what's here.

## What this is

**Sondial** — a collaborative CAD-review workspace. People join a shared room,
discuss a product in real-time chat, and request changes in natural language.
Each request becomes a new, immutable version of a generated 3D object. Built
for HackCMU's Multiplayer track; the pitch is "PM, engineers, and stakeholders
iterate on a product together with a shared source of truth," not a consumer
toy — see the design-state architecture below for why that framing fits what's
actually built.

It grew out of an earlier single-player image→3D generator (the
`package.json` name has since been renamed to match: `sondial`).

Two people have worked on this: the user (via this Claude session) built the
room/chat/versioning/realtime core and the Meshy pipeline; a collaborator
("Charlie") independently built an AR handoff path (QR code → phone → place the
object via ARKit/ARCore) and a Zoo.dev CAD provider. Both lines of work were
merged into one branch — see **Current branch state** below.

## Current branch state — read this before doing anything else

- **On `merge/zoo-and-ar`**, 19 commits ahead of `origin/main`, 0 behind.
  `main` has **not** been touched by any of this work.
- **No PR has been opened.** `gh` isn't installed in this environment. Either
  install it and open one, or push and open the PR manually on GitHub. Don't
  merge to `main` without the user's go-ahead — treat this the way any other
  unreviewed branch would be treated.
- The merge (commit `817955f`) combined two independently-built Zoo.dev CAD
  providers into one, kept the collaborator's AR work, and fixed two real bugs
  found in their Zoo client while testing it (auth sent as a post-connect
  message instead of on the handshake; `current_files` sent as strings instead
  of byte arrays). Zoo was then **removed entirely** four commits later
  (`fa78868`) once the user confirmed it wasn't in use — so those two fixes are
  now dead history, not active code. Don't go looking for a Zoo provider; it's
  gone, on purpose, at the user's explicit request.
- Everything after the merge (GLB preference, speed tuning, mobile layout, home
  page rewrite, the shape-prompt fix) happened on top of the merged tree and is
  original to this branch, not the collaborator's.

## How to run it

Infra (native Homebrew Postgres on 5432 + Homebrew Redis on 6379, already
running as background services on this machine):
```
npm run infra:brew:up      # if not already running — check first, don't just run this
```

Then:
```
npm run dev                 # all three processes via concurrently
```
This starts `next dev` (:3000), the Socket.IO realtime server (:3001), and the
BullMQ worker, using whatever `.env` / `.env.local` say. **Check nothing is
already listening on 3000/3001 first** (`lsof -nP -iTCP:3000 -sTCP:LISTEN`) —
this repo's history includes a real incident where two stacks ran at once and
silently fought over the same Redis queue, giving confusing mixed results.

For free, instant iteration without spending Meshy credits:
```
MESH_PROVIDER=mock npm run dev
```
The mock provider returns `public/samples/mock.glb`, so the whole pipeline
(chat → queue → design-state grounding → "generation" → new version → AR path)
is exercisable with zero API keys and zero cost. This is the right default for
anything except confirming what Meshy itself actually produces.

**A schema change needs a full restart, not hot reload** — Turbopack won't
pick up a regenerated Prisma client on its own; you'll get `Unknown argument`
errors from a stale in-memory client if you skip the restart.

## What's configured right now

`.env` (non-secret, shared defaults): `DATABASE_URL`, `REDIS_URL`,
`REALTIME_PORT`. `NEXT_PUBLIC_REALTIME_URL` is deliberately **unset** — the
client derives the socket host from the page's own URL (see "Fixed this
session" below), so it works for `localhost` and for LAN guests without
anyone maintaining an IP that goes stale.

`.env.local` (secrets, gitignored): `MESHY_API_KEY` (valid, real balance —
each generation costs ~20 credits and ~30-50s at the current lite-tier
settings), `GEMINI_API_KEY` (valid, drives the design-state LLM calls —
OpenAI was removed as an inference provider entirely, replaced with Gemini;
see `src/lib/llm.ts`), `HF_API_TOKEN` (HuggingFace, unused unless
`IMAGE_PROVIDER`/`MESH_PROVIDER` is set to it), `MESH_PROVIDER=meshy`,
`IMAGE_PROVIDER` set.

**No `ANTHROPIC_API_KEY` is present.** `LLM_PROVIDER` resolution in
`src/lib/llm.ts` falls back to whichever key exists, so design-state calls
currently run on Gemini (`gemini-3.8-flash`), not Anthropic, despite a
collaborator having added Anthropic support. Not a bug — just worth knowing
which model is actually writing the design-state prose if you're debugging
its behavior.

**No `ZOO_API_KEY` should be present** — it was deliberately removed along with
the provider. If you find one in `.env.local`, it's a leftover; the user was
told to rotate/revoke it at zoo.dev after it was accidentally shown in
plaintext during removal work (a mistake made this session — full API keys
should never be printed to a terminal that becomes part of a transcript;
`sed`/`cut`-extract length or a masked prefix instead, never the raw value).

## What's been fixed / built this session, roughly in order

Everything below is committed and pushed to `merge/zoo-and-ar`. Full detail
and reasoning is in each commit message — this is the "why does the app look
like this" summary, not a replacement for `git log -p`.

1. **Merged the collaborator's branch** (AR handoff, Zoo CAD provider) with
   this session's work (rooms, chat, realtime, Meshy pipeline, close-room,
   join-idempotency), resolving three real file conflicts and folding two
   independently-built Zoo providers into one.
2. **Removed Zoo entirely**, at the user's request, once it was confirmed
   unused — provider, websocket client, KCL source panel, the `cadSource`
   columns on `ObjectVersion`, env vars, all gone. Mesh generation is Meshy-only
   now (with `huggingface`/`mock` as the other registered options).
3. **Fixed a real join-race bug**: the room page used to silently auto-submit
   a *stored* display name from a background effect the instant it was
   available, which could complete while someone was still typing a different
   name — discarding it. Now the stored name only pre-fills the field; joining
   only ever happens from an explicit Enter/click.
4. **Fixed vertical model drift when switching between versions** — `useLoader`
   caches by URL, so revisiting a version returned the same Three.js object
   with the *previous* fit still applied, and re-measuring it compounded the
   error every time. Transform is now reset to identity before each fit.
5. **Realtime host is derived from the page URL**, not a hardcoded env var —
   the previous approach broke every time the host machine's LAN IP changed
   (which happened twice in one afternoon), leaving guests stuck on
   "Reconnecting" with both servers actually healthy.
6. **Meshy now returns GLB, not OBJ** — same model, 12MB vs 56MB, and GLB is
   what the AR path needs anyway. This also is what made the AR overlay
   actually start rendering (it returns `null` for non-GLB formats), which
   surfaced a real layout bug: the AR button/QR overlay could bleed past its
   container into the version timeline below it — fixed with `overflow-hidden`
   on the viewer container.
7. **Meshy generation is ~3-4x faster**: switched `ai_model` from `meshy-6` to
   the documented lightweight `meshy-6-lite` tier, dropped `target_polycount`
   30000→10000, and parallelized the two independent LLM calls (classify +
   evolve) the worker was running sequentially before generation even starts.
   Measured, not assumed: 33s vs 80-140s for the same prompt, directly against
   the Meshy API. Both new knobs are env-configurable
   (`MESHY_AI_MODEL`, `MESHY_TARGET_POLYCOUNT`) in case quality suffers.
8. **Design-state hallucination fixed**: seeding a room with a filler brief
   ("hi", "test") used to make the LLM invent a full concrete-but-unrelated
   object identity (a "highly functional hunting tool," once), which every
   later edit was then instructed to *preserve* — producing genuinely bizarre
   hybrids (a mug with a knife on it). Filler briefs now stay an explicit
   placeholder with no LLM call at all; the first real instruction defines the
   object fresh instead of merging onto a fiction.
9. **Mobile gets a different layout, not a squeezed desktop one.** Below the
   `md` breakpoint, the design-state sidebar and the embedded 3D viewer both
   disappear; chat fills the screen with an AR launch banner built in
   (`ARLauncher`'s new `variant="inline"` reuses the same detection/launch
   logic as the desktop overlay — no duplicated logic).
10. **Home page rewritten from scratch**, at the user's explicit request to
    remove "average AI design" signatures — gone: a rotating decorative
    product-orbit graphic, a three-step wizard with checkmark progress, glow/
    shimmer CSS animations (confirmed unused anywhere else before deletion).
    Replaced with one flat form (name/brief/constraints/create), monospace
    labels, sharp borders, no gradients. Functionality unchanged.
11. **Meshy prompt compiler pushes harder on atypical shapes.** Reported bug:
    "make the mug rectangular" updated the design-state text correctly (the
    compiled prompt genuinely said "features a rectangular body") but the
    generated mesh came back a plain cylinder. Verified this two ways — pulled
    the exact compiled prompt from the database (confirmed correct), then
    downloaded the actual returned GLB and geometrically measured its
    cross-section (confirmed round: radius within 9% of constant, zero corner
    peaks at both the base and rim). This is a genuine Meshy-model limitation
    — a "mug" has a very strong learned prior toward cylindrical, and one
    adjective doesn't reliably override it. The prompt compiler now front-loads
    shape departures with concrete, contrastive language ("flat vertical
    walls... not round, not cylindrical") instead of one adjective diluted
    among ordinary descriptors. Re-tested against a real generation: the base
    measurably became more rectangular (ratio 1.60, 4 corner peaks — close to
    a true square's ~1.41/4-peak signature) but the rest of the object stayed
    mostly round. **This is a partial improvement, not a fix** — treat
    structural/topological shape changes as fundamentally unreliable on this
    pipeline; that ceiling is architectural (generative diffusion model, not a
    parametric kernel), not something prompt engineering fully closes.

## Verification approach used throughout — worth continuing

This session consistently avoided asserting anything about the running app
without checking it directly:
- Real end-to-end tests were written as throwaway `.mjs` scripts (hitting the
  actual API routes, a real Socket.IO connection, sometimes real Meshy calls),
  run once to confirm behavior, then **deleted** — none were committed, since
  there's no test suite/CI in this repo yet (see `CLAUDE.md`).
- Claims about external vendor behavior (Meshy's model options, Zoo's actual
  API surface, Hyper3D/3D-AI-Studio capabilities) were checked against live
  docs/APIs rather than trusted from training-data memory, more than once
  finding the docs themselves were stale or the marketing copy overstated the
  real API.
- The mug-shape investigation above is the clearest example: rather than
  guessing whether the vendor "probably" ignored the shape instruction, the
  actual GLB was downloaded and its vertex geometry measured directly.

Keep doing this. Don't declare something fixed on the strength of a plausible
theory alone when it's cheap to check for real.

## Known gaps and things NOT to assume work

(`CLAUDE.md`'s "Known gaps" section covers the architectural ones — RETEXTURE
unwired, approvals schema-only, room-close is a hard delete by design, `/api/
export` is a stub, the orphaned `/project/editor` single-player flow. Not
repeated here. This list is what's specific to *this session's* unverified
surface area.)

- **The AR flow has never been tested in a real browser or on a real phone**,
  by anyone, in this session — no browser tooling was available. The QR
  handoff, the `activateAR()` call, the WebXR shadow attributes added this
  session (`shadow-intensity`/`shadow-softness`/`environment-image` — these
  only affect WebXR; Quick Look and Scene Viewer are closed native apps with
  no code-level control at all, confirmed from model-viewer's own docs) — all
  of it is reasoned from documentation and source, not observed rendering.
- **The mobile breakpoint (`md`, 768px) has never been checked on a real
  phone.** It might be the wrong cutoff for the phones actually being tested
  with; it's an easy one-line change if so.
- **All CSS/visual work this session was done blind** — no browser access at
  any point. Several rounds of the version-timeline alignment fix were
  corrected based on the user's visual feedback rather than being right the
  first time; expect the same iteration pattern for any new visual ask.
- **Prompt-emphasis fix for atypical shapes is confirmed partial, not
  complete** (see item 11 above) — don't tell the user structural shape
  requests now work; they measurably work *better*, not reliably.
- Two **pre-existing** lint errors remain in `ModelLoader.tsx`
  (setState-in-effect) — predate this session, documented in `CLAUDE.md`,
  deliberately not touched without a browser to verify the fix against.

## If you're picking this up cold, the fastest way to get oriented

1. Read `CLAUDE.md` for architecture (schema, event contract, the provider
   pattern, the worker's flow).
2. `git log --oneline -20` to see this branch's real history past what's
   summarized above.
3. `npm run typecheck` and `npm run lint` — both should be clean except the
   two known `ModelLoader.tsx` errors.
4. Start the stack with `MESH_PROVIDER=mock npm run dev`, create a room, send
   a chat message, send an instruction, watch a version appear — that
   confirms the whole pipeline end-to-end in under a minute with no API cost.
