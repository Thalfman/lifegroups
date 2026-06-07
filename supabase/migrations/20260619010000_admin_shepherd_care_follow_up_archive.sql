-- Admin UX: soft-archive for care follow-ups.
--
-- Phase SC.1B (20260529007000) shipped care follow-ups with status moves only
-- (open / in_progress / done) and the explicit posture "No hard deletes.
-- Corrections happen via the update RPCs." That left accidental/test follow-ups
-- with no way to leave the queue. This slice adds a reversible soft archive — an
-- archived_at timestamp plus an admin RPC — so a follow-up can be removed from
-- every queue while staying in the table for the audit trail.
--
-- Same posture as the rest of the care follow-up writes: SECURITY DEFINER,
-- auth_is_admin() gate, paired audit_events row, no hard delete, the same
-- active-leader/co_leader re-gate so a stale/direct call can't mutate a task for
-- a target the UI already 404s.
--
-- Fixed error tokens: insufficient_privilege, invalid_input,
-- missing_follow_up, missing_profile.

-- ---------------------------------------------------------------------------
-- Column + index
-- ---------------------------------------------------------------------------
-- Nullable timestamp; null = active. The outstanding/per-profile reads filter
-- archived_at is null, so the existing outstanding partial index still covers
-- the common scan; this partial index keeps the active per-profile list cheap.

alter table public.shepherd_care_follow_ups
  add column if not exists archived_at timestamptz;

comment on column public.shepherd_care_follow_ups.archived_at is
  'Soft-archive timestamp. Set by admin_archive_shepherd_care_follow_up so accidental/test rows leave every queue; null = active. No hard delete.';

create index if not exists idx_shepherd_care_follow_ups_active_profile
  on public.shepherd_care_follow_ups (care_profile_id, status, due_date)
  where archived_at is null;

-- ---------------------------------------------------------------------------
-- admin_archive_shepherd_care_follow_up
-- ---------------------------------------------------------------------------
-- Stamps archived_at = now() (idempotent: re-archiving keeps the first stamp),
-- without touching status/completed_at. Status history is preserved.
create or replace function public.admin_archive_shepherd_care_follow_up(
  p_follow_up_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_existing record;
  v_shepherd_role public.user_role;
  v_shepherd_status public.profile_status;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_follow_up_id is null then
    raise exception 'invalid_input';
  end if;

  select id, care_profile_id, status, archived_at
    into v_existing
    from public.shepherd_care_follow_ups
   where id = p_follow_up_id
   for update;
  if v_existing.id is null then
    raise exception 'missing_follow_up';
  end if;

  -- Same active leader/co_leader re-gate as the create/status/update RPCs.
  select p.role, p.status
    into v_shepherd_role, v_shepherd_status
    from public.shepherd_care_profiles scp
    join public.profiles p on p.id = scp.shepherd_profile_id
   where scp.id = v_existing.care_profile_id;
  if v_shepherd_role not in ('leader'::public.user_role, 'co_leader'::public.user_role) then
    raise exception 'missing_profile';
  end if;
  if v_shepherd_status <> 'active'::public.profile_status then
    raise exception 'missing_profile';
  end if;

  -- Idempotent: keep the original archive timestamp if already archived.
  update public.shepherd_care_follow_ups
     set archived_at = coalesce(v_existing.archived_at, now()),
         updated_at = now()
   where id = p_follow_up_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.archive_shepherd_care_follow_up',
    'shepherd_care_follow_ups',
    p_follow_up_id,
    jsonb_build_object(
      'before', jsonb_build_object(
        'status', v_existing.status,
        'was_archived', v_existing.archived_at is not null
      ),
      'after', jsonb_build_object('archived', true),
      'care_profile_id', v_existing.care_profile_id
    )
  );

  return p_follow_up_id;
end;
$$;

revoke all on function public.admin_archive_shepherd_care_follow_up(uuid) from public;
revoke all on function public.admin_archive_shepherd_care_follow_up(uuid) from anon;
revoke all on function public.admin_archive_shepherd_care_follow_up(uuid) from authenticated;
grant execute on function public.admin_archive_shepherd_care_follow_up(uuid) to authenticated;

comment on function public.admin_archive_shepherd_care_follow_up(uuid) is
  'Admin write: soft-archives a care follow-up (sets archived_at) so it leaves every queue, without changing status/completed_at, plus a paired audit_events row. No hard delete.';
