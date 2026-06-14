-- First-run orientation "seen" state (mobile store roadmap Phase 2, #560).
--
-- A one-time, dismissible welcome card is shown to Leaders and Over-Shepherds
-- the first time they land on their own surface. The "seen" flag is persisted
-- server-side (per the triage decision on #560) so it never reappears on any
-- device — not localStorage.
--
-- Storage is a tiny per-user table whose row PRESENCE means "seen". It is
-- RPC-only: RLS is enabled with NO SELECT policy (like invite_redeem_throttle),
-- and both the write (mark) and the read are SECURITY DEFINER RPCs scoped to the
-- caller's own profile. This keeps the per-user flag off the broadly-read
-- profiles row and out of the session allowlist. profile_id is ON DELETE SET
-- NULL so a later Super-Admin permanent purge of the profile is captured
-- (recoverable), not blocked, by super_admin_collect_dependents.
--
-- Fixed error tokens: insufficient_privilege.

create table public.first_run_orientations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.first_run_orientations is
  'First-run orientation dismissals (#560): row presence = the user has dismissed the welcome card. RPC-only (RLS on, no SELECT policy); written via mark_first_run_orientation_seen, read via first_run_orientation_seen.';

-- RLS on, NO SELECT/INSERT/UPDATE/DELETE policies — reads and writes go only
-- through the SECURITY DEFINER RPCs below.
alter table public.first_run_orientations enable row level security;

-- ---------------------------------------------------------------------------
-- mark_first_run_orientation_seen() — dismiss the welcome card for the caller.
-- ---------------------------------------------------------------------------
-- Records that the calling user has seen their first-run orientation, and
-- writes a paired content-free audit row in the same transaction. Idempotent: a
-- second dismissal is a no-op (and writes no extra audit row).
create or replace function public.mark_first_run_orientation_seen()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid;
  v_orientation_id uuid;
begin
  select id
    into v_profile_id
    from public.profiles
   where auth_user_id = auth.uid()
     and status = 'active'::public.profile_status
   limit 1;

  if v_profile_id is null then
    raise exception 'insufficient_privilege';
  end if;

  insert into public.first_run_orientations (profile_id)
  values (v_profile_id)
  on conflict (profile_id) do nothing
  returning id into v_orientation_id;

  -- Only audit a real first dismissal (FOUND is false when the conflict
  -- skipped the insert), so a re-submit doesn't stack audit rows. The audited
  -- entity_id is the inserted first_run_orientations row id (captured above),
  -- not the profile id, so the audit trail resolves to a real row in that table.
  if found then
    insert into public.audit_events
      (actor_profile_id, action, entity_type, entity_id, metadata)
    values (
      v_profile_id,
      'account.mark_orientation_seen',
      'first_run_orientations',
      v_orientation_id,
      '{}'::jsonb
    );
  end if;

  return v_profile_id;
end;
$$;

revoke all on function public.mark_first_run_orientation_seen() from public;
revoke all on function public.mark_first_run_orientation_seen() from anon;
revoke all on function public.mark_first_run_orientation_seen() from authenticated;
grant execute on function public.mark_first_run_orientation_seen() to authenticated;

comment on function public.mark_first_run_orientation_seen() is
  'Self-service write (#560): records that the calling user dismissed their first-run orientation card (row presence), with a paired content-free audit row. Idempotent. Raises insufficient_privilege when no active own profile.';

-- ---------------------------------------------------------------------------
-- first_run_orientation_seen() — has the caller dismissed the card?
-- ---------------------------------------------------------------------------
-- Read-only boolean for the caller's own state. The table has no SELECT policy,
-- so the surface reads this state through this SECURITY DEFINER helper.
create or replace function public.first_run_orientation_seen()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.first_run_orientations f
     where f.profile_id = (
       select p.id
         from public.profiles p
        where p.auth_user_id = auth.uid()
          and p.status = 'active'::public.profile_status
        limit 1
     )
  );
$$;

revoke all on function public.first_run_orientation_seen() from public;
revoke all on function public.first_run_orientation_seen() from anon;
revoke all on function public.first_run_orientation_seen() from authenticated;
grant execute on function public.first_run_orientation_seen() to authenticated;

comment on function public.first_run_orientation_seen() is
  'Self-service read (#560): true when the calling user has dismissed their first-run orientation card. Read-only; the first_run_orientations table is otherwise RPC-only (no SELECT policy).';
