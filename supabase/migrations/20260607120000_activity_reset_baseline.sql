-- activity-reset: a "fresh start" for the Home "Recent activity" band.
--
-- The five activity tiles (groups launched, guests welcomed, members joined,
-- follow-ups completed, care touchpoints) are pure counts of real domain rows
-- over a period. Deleting those rows to zero the band is never an option — they
-- are groups, guests, memberships, completed follow-ups, and care interactions
-- a church depends on. So, exactly like the duration-derived "Needs attention"
-- cards (20260605120000), the honest reset is an "as-of" baseline the counts
-- measure FROM: a single global date that floors every tile, so a reset drops
-- the band to zero WITHOUT deleting anything, and the tiles climb again
-- naturally as new activity lands.
--
-- One table (activity_reset_baselines, a single global row) and two SECURITY
-- DEFINER, super-admin-gated RPCs:
--   super_admin_reset_activity()        -- set/replace the baseline at today
--   super_admin_clear_activity_reset()  -- remove it (back to all-time counts)
-- Because the baseline is non-destructive, there is NO snapshot/revert store —
-- the clear RPC is the complete undo. Each RPC writes a paired audit_events row
-- and serializes on its own advisory key (distinct from the history / attention
-- reset families, which it shares nothing with).

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- activity_reset_baselines: the single global "as-of" reset date the Recent-
-- activity tiles honour. Admin-readable SELECT (the whole admin team's Home
-- agrees); no write policy (all writes flow through the RPCs below).
-- ---------------------------------------------------------------------------
create table if not exists public.activity_reset_baselines (
  id uuid primary key default gen_random_uuid(),
  -- Single global scope today; the column is kept for symmetry with the
  -- attention baselines and to leave room for a future per-metric override.
  scope text not null default 'global' check (scope in ('global')),
  -- The as-of date every activity tile measures from (church-local; derived in
  -- the RPC so it matches the dashboard/action clock).
  baseline_on date not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- At most one global baseline.
create unique index if not exists uq_activity_reset_baselines_global
  on public.activity_reset_baselines (scope)
  where scope = 'global';

alter table public.activity_reset_baselines enable row level security;

-- Admin-readable (auth_is_admin admits ministry_admin AND super_admin) so the
-- dashboard read honours the baseline for the whole admin team. No write policy:
-- the RPCs are SECURITY DEFINER and bypass RLS.
create policy activity_reset_baselines_admin_read
  on public.activity_reset_baselines
  for select to authenticated using (public.auth_is_admin());

revoke all    on public.activity_reset_baselines from public;
revoke all    on public.activity_reset_baselines from anon;
revoke all    on public.activity_reset_baselines from authenticated;
grant  select on public.activity_reset_baselines to authenticated;

-- ---------------------------------------------------------------------------
-- super_admin_reset_activity() -> the baseline date it set
-- ---------------------------------------------------------------------------
create or replace function public.super_admin_reset_activity()
returns date
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  -- Church-local date (CHURCH_TIMEZONE, lib/shared/church-time) so the reset's
  -- "today" matches the dashboard/action clock — current_date would be the
  -- session's (UTC) date and could land on the wrong day near midnight.
  v_today date := (now() at time zone 'America/Chicago')::date;
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  -- Distinct advisory key from the other reset families: this reset touches no
  -- history tables and no other snapshot store, so it need not serialize against
  -- a Clean Slate wipe or an attention reset. Held to transaction end.
  perform pg_advisory_xact_lock(hashtext('activity_reset'));

  -- One global baseline: replace any prior one at today's church-local date.
  delete from public.activity_reset_baselines where scope = 'global';
  insert into public.activity_reset_baselines (scope, baseline_on, created_by)
  values ('global', v_today, v_actor);

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values
    (v_actor, 'super_admin.reset_activity', 'activity_reset_baselines', null,
     jsonb_build_object('baseline_on', v_today));

  return v_today;
end;
$$;

revoke all     on function public.super_admin_reset_activity() from public;
revoke all     on function public.super_admin_reset_activity() from anon;
revoke all     on function public.super_admin_reset_activity() from authenticated;
grant  execute on function public.super_admin_reset_activity() to authenticated;

comment on function public.super_admin_reset_activity() is
  'activity-reset: super-admin "fresh start" for the Home Recent-activity band. Sets a single global as-of baseline at today (church-local) that floors every activity tile, WITHOUT deleting any domain rows. Writes a paired super_admin.reset_activity audit row. Returns the baseline date.';

-- ---------------------------------------------------------------------------
-- super_admin_clear_activity_reset() -> true when a baseline was removed
-- ---------------------------------------------------------------------------
create or replace function public.super_admin_clear_activity_reset()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_removed bigint;
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtext('activity_reset'));

  delete from public.activity_reset_baselines where scope = 'global';
  get diagnostics v_removed = row_count;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values
    (v_actor, 'super_admin.clear_activity_reset', 'activity_reset_baselines', null,
     jsonb_build_object('removed', v_removed));

  return v_removed > 0;
end;
$$;

revoke all     on function public.super_admin_clear_activity_reset() from public;
revoke all     on function public.super_admin_clear_activity_reset() from anon;
revoke all     on function public.super_admin_clear_activity_reset() from authenticated;
grant  execute on function public.super_admin_clear_activity_reset() to authenticated;

comment on function public.super_admin_clear_activity_reset() is
  'activity-reset: super-admin undo of the Recent-activity reset. Removes the global activity baseline so the tiles return to all-time counts. Writes a paired super_admin.clear_activity_reset audit row. Returns true when a baseline was removed.';
