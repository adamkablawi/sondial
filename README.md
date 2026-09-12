# Studio — make one object, together

A room where several people shape the same 3D object by describing it. Anyone
can ask for a change; an LLM folds the request into a running design brief,
Meshy generates a textured mesh, and the result appears live for everyone —
then goes into AR on any phone.

Built on top of [Itera](https://github.com/adamkablawi/Itera), which provided
the single-player generation pipeline.

---

## Run it locally, with no API keys

Both providers default to `mock`, so the whole product works keyless.

```bash
npm install
cp .env.example .env.local     # fill in the two NEXT_PUBLIC_ Supabase vars
npm run dev                    # terminal 1 — the app
npm run worker                 # terminal 2 — the job worker
```

Supabase is the one thing you cannot mock: create a free project, run
`supabase/schema.sql` in its SQL editor, and enable anonymous sign-ins under
Authentication → Providers.

Then open <http://localhost:3000>, start a room, and paste the URL into a
second browser to watch it sync.

## Going live with real generation

```env
MESH_PROVIDER=meshy
LLM_PROVIDER=grok
MESHY_API_KEY=...
XAI_API_KEY=...
```

Confirm the Grok model ids your key can reach before relying on them:

```bash
npm run verify:grok
```

It lists the models available to your key and probes both text and image input.
If vision is unavailable the app still runs — reference images are ignored
rather than breaking generation.

---

## How it fits together

```
 Browser (Vercel)                Supabase                  Worker (Vultr)
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│ /        lobby   │      │  Postgres        │      │  claim_next_     │
│ /r/[code] room   │─ ①──▶│   rooms          │◀─②───│    version()     │
│  model-viewer+AR │      │   versions       │      │                  │
│  filmstrip       │◀─⑤───│  Realtime ───────┼──④───│  Grok → Meshy    │
│  presence        │      │  Storage /models │◀─③───│                  │
└──────────────────┘      └──────────────────┘      └──────────────────┘
     anon key                                        service role key
```

1. Someone submits a prompt → a `versions` row is inserted with `status='queued'`.
2. The worker claims it atomically (`FOR UPDATE SKIP LOCKED`).
3. Grok writes or updates the brief; Meshy generates geometry then textures;
   the assets are re-hosted into Supabase Storage.
4. The row flips to `ready` and the room pointer moves.
5. Realtime pushes the change to everyone, and the viewer swaps model.

### Things worth knowing

- **The browser never polls.** Submitting is a single `insert`; everything else
  arrives over Realtime. One job serves every viewer in the room.
- **`versions` has no client update policy.** Only the service-role worker
  advances a job, so a client cannot forge a finished model or point `glb_url`
  anywhere of its choosing. Don't add one.
- **Text-to-3D takes two Meshy passes.** `mode:"preview"` returns untextured
  geometry; `mode:"refine"` applies the textures. Skipping the second pass is
  how you end up with a room full of grey blobs.
- **Meshy's URLs expire**, so the worker re-hosts every asset into Storage
  before marking a version ready.
- **Meshy returns USDZ natively**, which is what makes iOS Quick Look AR work
  without a conversion step.
- **Jobs are self-describing.** Both the Meshy and mock providers encode all
  job state in the job id, so a worker restart never loses track of in-flight
  work. The sweeper requeues anything orphaned for more than 10 minutes.

---

## Deploying

**Supabase** — run `supabase/schema.sql`; it creates the tables, the claim and
sweep functions, RLS policies, and the public `models` bucket.

**Vercel** — import the repo and set `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`.

**Vultr** — the worker makes only outbound connections, so it needs no inbound
ports beyond SSH.

```bash
git clone <repo> && cd <repo>
npm ci
cp .env.example .env            # fill in; service role key lives ONLY here
npx pm2 start "npm run worker" --name studio-worker
npx pm2 save && npx pm2 startup
```

## Layout

```
src/
  app/            lobby, room, server actions
  components/     stage, filmstrip, prompt bar, presence
  hooks/useRoom   realtime subscription + presence
  lib/            pipeline (brief writing), supabase clients, types
  providers/      meshy | mock, grok | mock — swapped by env var
worker/           the long-running job process
supabase/         schema.sql
scripts/          verify-grok
```
