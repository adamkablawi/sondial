-- ═══════════════════════════════════════════════════════════════════
--  Prompt-to-AR Studio — schema
--  Run this once in the Supabase SQL editor.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Tables ─────────────────────────────────────────────────────────

create table if not exists rooms (
  id                 uuid primary key default gen_random_uuid(),
  code               text unique not null,
  name               text not null default 'Untitled',
  current_version_id uuid,
  created_at         timestamptz not null default now()
);

create table if not exists versions (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references rooms(id) on delete cascade,
  parent_id     uuid references versions(id) on delete set null,
  author_id     uuid,
  author_name   text not null default 'anon',
  instruction   text not null,
  brief         text,
  status        text not null default 'queued',
  progress      int  not null default 0,
  meshy_task_id text,
  glb_url       text,
  usdz_url      text,
  thumb_url     text,
  error         text,
  claimed_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint versions_status_check check (status in
    ('queued','briefing','generating','texturing','uploading','ready','failed'))
);

do $$ begin
  alter table rooms add constraint rooms_current_version_fk
    foreign key (current_version_id) references versions(id) on delete set null;
exception when duplicate_object then null; end $$;

-- The worker's hot path. Partial index stays tiny regardless of history size.
create index if not exists versions_queue_idx on versions (created_at) where status = 'queued';
create index if not exists versions_room_idx  on versions (room_id, created_at desc);

-- ── Realtime ───────────────────────────────────────────────────────

do $$ begin
  alter publication supabase_realtime add table versions;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table rooms;
exception when duplicate_object then null; end $$;

-- Realtime payloads only carry changed columns unless the row is REPLICA
-- IDENTITY FULL. Clients need the whole row to render a card, so opt in.
alter table versions replica identity full;
alter table rooms    replica identity full;

-- ── Atomic job claim ───────────────────────────────────────────────
-- A plain SELECT-then-UPDATE races: two workers (or one restarting mid-job)
-- would both pick up the same row and burn Meshy credits twice.
-- SKIP LOCKED makes the claim exclusive.

-- Returns SETOF, not a bare composite, so that an empty queue is zero rows.
-- A function returning a plain composite renders a NULL result over PostgREST
-- as an object of all-null fields, which a caller cannot distinguish from a
-- real claim. Zero rows is unambiguous.
drop function if exists claim_next_version();

create function claim_next_version()
returns setof versions
language plpgsql
security definer
set search_path = public
as $$
declare v versions;
begin
  select * into v from versions
   where status = 'queued'
   order by created_at
   for update skip locked
   limit 1;

  if not found then return; end if;

  return query
  update versions
     set status = 'briefing', claimed_at = now(), updated_at = now()
   where id = v.id
   returning *;
end $$;

revoke execute on function claim_next_version() from anon, authenticated;

-- ── Stuck-job recovery ─────────────────────────────────────────────
-- If a worker dies mid-generation the row would sit in-flight forever.
-- The worker calls this on boot and on a timer.

create or replace function requeue_stuck_versions(max_age_minutes int default 10)
returns setof versions
language sql
security definer
set search_path = public
as $$
  update versions
     set status = 'queued', claimed_at = null, updated_at = now()
   where status not in ('queued','ready','failed')
     and claimed_at < now() - make_interval(mins => max_age_minutes)
  returning *;
$$;

revoke execute on function requeue_stuck_versions(int) from anon, authenticated;

-- ── Row level security ─────────────────────────────────────────────

alter table rooms    enable row level security;
alter table versions enable row level security;

drop policy if exists "rooms readable"  on rooms;
drop policy if exists "rooms creatable" on rooms;
create policy "rooms readable"  on rooms for select using (true);
create policy "rooms creatable" on rooms for insert with check (true);

drop policy if exists "versions readable"   on versions;
drop policy if exists "versions insertable" on versions;
create policy "versions readable" on versions for select using (true);

-- You may only queue work as yourself, and only in the 'queued' state.
create policy "versions insertable" on versions for insert
  with check (
    auth.uid() is not null
    and auth.uid() = author_id
    and status = 'queued'
    and progress = 0
    and glb_url is null
    and usdz_url is null
  );

-- NOTE: there is deliberately NO update or delete policy on `versions`.
-- Only the service-role worker advances a job. This makes it structurally
-- impossible for a client to forge a 'ready' status or point glb_url at a
-- URL of its choosing. Do not add one.

-- ── Storage ────────────────────────────────────────────────────────
-- Public because Android Scene Viewer and iOS Quick Look fetch these URLs
-- from outside the page context, where we cannot refresh a signed URL.

insert into storage.buckets (id, name, public)
values ('models', 'models', true)
on conflict (id) do update set public = true;

drop policy if exists "models publicly readable" on storage.objects;
create policy "models publicly readable" on storage.objects
  for select using (bucket_id = 'models');
-- Writes to the bucket are service-role only (bypasses RLS); no client policy.
