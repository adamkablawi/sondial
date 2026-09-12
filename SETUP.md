# Setup

Two tracks. **Track A gets you a working, visible product in ~15 minutes.**
Track B moves the worker onto Vultr afterwards. Don't do B first — the worker
runs identically on your laptop, and nothing about the demo depends on where
it lives.

---

## Track A — working end to end

### 1. Supabase (5 min)

Project: `ontycqfsutxpyhozsoxt`

1. **SQL Editor** → New query → paste all of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   It is idempotent; re-running is safe. This creates both tables, the claim
   function, RLS, and the public `models` bucket.
2. **Authentication → Sign In / Providers → Anonymous sign-ins → enable.**
   Without this nobody can join a room; it is the single easiest step to miss.
3. **Settings → API Keys** → copy both keys. Supabase's current key format:
   - `sb_publishable_...` → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (safe in the browser)
   - `sb_secret_...` → `SUPABASE_SERVICE_ROLE_KEY` (worker only, bypasses RLS)

   The env var names still say anon/service_role because that's what the
   Supabase client libraries expect; the new keys slot into the same places.

### 2. Local env (1 min)

`.env.local` already has your project URL and publishable key. Paste the
secret key into the one remaining blank:

```
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
```

Then prove the whole Supabase side is correct before writing any more config:

```bash
npm run verify:supabase
```

It checks the tables, the claim RPC, the bucket's existence *and* its public
flag, anonymous sign-in, and that RLS actually refuses a forged `ready` row.
Every failure prints the exact fix. Don't move on until it's all `[ok]`.

### 3. Run it (2 min)

Two terminals:

```bash
npm run dev       # http://localhost:3000
npm run worker
```

Both providers are on `mock`, so **this works with zero API keys and zero
spend.** Create a room, open the URL in a second browser, type a prompt in one
— a card appears in the other within a second and both watch the same progress
bar. That is the multiplayer loop, fully proven, before a cent is spent.

### 4. Real generation (5 min)

In `.env.local`:

```
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
MESH_PROVIDER=meshy
MESHY_API_KEY=msy_...
```

```bash
npm run verify:llm   # confirms text + vision on your key
```

Restart the worker. Submit "a brass desk lamp with a marble base".

**Check the result is textured.** A flat grey mesh means the Meshy refine pass
was skipped — that is the one failure mode worth watching for, since preview
geometry arrives untextured by design.

### 5. Vercel (3 min)

Import the repo. Set **only**:

```
NEXT_PUBLIC_SUPABASE_URL=https://ontycqfsutxpyhozsoxt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Nothing else. Vercel runs no worker and must never hold the service role key or
a provider key. Deploy, then open the deployed URL on your phone and tap **AR**.
Your laptop worker serves the deployed site fine — it reaches Supabase
outbound, so there is no "local vs prod" split to reconcile.

### Swapping to Grok later

One line, no code change:

```
LLM_PROVIDER=grok
XAI_API_KEY=...
```

Then `npm run verify:grok` to see which model ids your key reaches and whether
vision works. If vision is unavailable the provider degrades to text-only
rather than failing, so reference images stop working but prompts don't.

---

## Track B — worker on Vultr

Only needed so generation continues when your laptop closes.

```bash
ssh root@<ip>
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs git
git clone <your repo> /opt/studio && cd /opt/studio && npm ci
# create /opt/studio/.env with the worker vars (chmod 600)
npm i -g pm2 && pm2 start "npm run worker" --name studio && pm2 save && pm2 startup
```

The box needs **no inbound ports** except SSH — the worker only makes outbound
calls. Firewall the rest.

Run the worker in exactly one place at a time, or don't worry if you overlap:
job claiming uses `FOR UPDATE SKIP LOCKED`, verified against real Postgres with
8 concurrent workers and 40 jobs — 40 claims, zero duplicates. Two workers cost
you nothing but redundancy.

---

## Which key goes where

| | Vercel | Worker (laptop or Vultr) |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | — |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | — |
| `SUPABASE_URL` | — | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | **never** | yes |
| `ANTHROPIC_API_KEY` / `XAI_API_KEY` | **never** | yes |
| `MESHY_API_KEY` | **never** | yes |

The service role key bypasses RLS entirely. It belongs only where a human
can't reach it. `rg -n "SERVICE_ROLE" src/` should return nothing.
