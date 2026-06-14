-- Account deletion requests (mobile store roadmap Phase 3, #563).
--
-- Both app stores require an in-app account-deletion path. Per the triage
-- decision on #563 the model is a self-service deletion REQUEST that an admin
-- reviews: a signed-in user initiates from their account area, their app access
-- is revoked immediately (their profile is soft-archived to `inactive`) and a
-- request row is recorded; the irreversible permanent purge (+ tombstone) stays
-- a Super-Admin danger-zone action via the existing super_admin_permanent_delete
-- mechanism. Care Notes / Prayer Requests the person authored are RETAINED as
-- ministry continuity — this targets the account + personal profile data, not
-- the group's care history.
--
-- Posture matches the rest of the writes: a new table with RLS, Super-Admin-only
-- SELECT (Ministry Admin excluded, like the audit trail / danger-zone tables),
-- and NO insert/update/delete policies. The one write goes through a SECURITY
-- DEFINER RPC that gates on the caller's OWN active profile, archives it,
-- records the request, and writes a paired audit_events row in the same
-- transaction. No service-role key in app runtime, no broadened RLS, no hard
-- delete.
--
-- profile_id / processed_by are ON DELETE SET NULL so the eventual Super-Admin
-- permanent purge of the profile is captured (recoverable) rather than blocked
-- by super_admin_collect_dependents (cascade/restrict would be a blocker).
--
-- Fixed error tokens (mapped to friendly copy in the action layer):
--   invalid_input, insufficient_privilege, forbidden_target,
--   deletion_already_requested.

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  reason text,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_deletion_requests_reason_length
    check (reason is null or char_length(reason) <= 1000),
  constraint account_deletion_requests_status_valid
    check (status in ('pending', 'completed', 'cancelled'))
);

-- At most one OPEN (pending) request per profile, so a double submit can't
-- stack rows. Processed (completed/cancelled) rows are exempt so history stays.
create unique index account_deletion_requests_one_pending_per_profile
  on public.account_deletion_requests (profile_id)
  where status = 'pending';

create index idx_account_deletion_requests_status
  on public.account_deletion_requests (status, requested_at);

comment on table public.account_deletion_requests is
  'Self-service account-deletion requests (#563). One pending row per profile; the profile is archived (inactive) on request. The permanent purge stays a Super-Admin danger-zone action. Super-Admin-only SELECT; writes only via request_own_account_deletion.';

-- ---------------------------------------------------------------------------
-- RLS: Super-Admin-only SELECT; no INSERT/UPDATE/DELETE policies (RPC-only).
-- ---------------------------------------------------------------------------
alter table public.account_deletion_requests enable row level security;

create policy account_deletion_requests_super_admin_read
  on public.account_deletion_requests
  for select to authenticated
  using (public.auth_role() = 'super_admin');

grant select on public.account_deletion_requests to authenticated;

-- ---------------------------------------------------------------------------
-- request_own_account_deletion(p_reason) — the one self-service write.
-- ---------------------------------------------------------------------------
-- An authenticated user requests deletion of their OWN account. Archives their
-- profile (soft, status=inactive) so app access is revoked immediately, records
-- a pending request the Super-Admin can act on, and writes a content-free paired
-- audit row — all in one transaction. The Super Admin is refused (the purge
-- stays a danger-zone action, and self-archiving the top operator could lock the
-- org out). No hard delete here.
create or replace function public.request_own_account_deletion(
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_id uuid;
  v_role public.user_role;
  v_status public.profile_status;
  v_reason text;
  v_has_reason boolean;
  v_request_id uuid;
  v_assignments_deactivated integer;
  v_coverage_deactivated integer;
begin
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is not null and char_length(v_reason) > 1000 then
    raise exception 'invalid_input';
  end if;
  -- Reduce the free-text reason to a presence flag up front: the audit row
  -- records only whether a reason was given, never the text itself.
  v_has_reason := v_reason is not null;

  -- Resolve the caller's own profile (any active app user). Lock it so a
  -- concurrent status change can't race the archive.
  select id, role, status
    into v_profile_id, v_role, v_status
    from public.profiles
   where auth_user_id = auth.uid()
   for update;

  if v_profile_id is null
     or v_status is distinct from 'active'::public.profile_status then
    raise exception 'insufficient_privilege';
  end if;

  -- The Super Admin manages account removal in the danger zone; refuse a
  -- self-request here so the top operator can't archive themselves out.
  if v_role = 'super_admin'::public.user_role then
    raise exception 'forbidden_target';
  end if;

  -- One open request per profile. A second submit is reported as a no-op the
  -- action maps to a friendly "already requested" confirmation.
  if exists (
    select 1
      from public.account_deletion_requests
     where profile_id = v_profile_id
       and status = 'pending'
  ) then
    raise exception 'deletion_already_requested';
  end if;

  -- Revoke app access immediately: soft-archive the profile to inactive. No
  -- hard delete — the permanent purge + tombstone stays Super-Admin-only.
  update public.profiles
     set status = 'inactive'::public.profile_status,
         updated_at = now()
   where id = v_profile_id;

  -- Mirror admin_deactivate_profile's cascades so a self-deleted Leader /
  -- Over-Shepherd doesn't linger as an active assignment in ministry surfaces
  -- and metrics. We inline the same two updates rather than calling that RPC,
  -- which is admin-gated and refuses a self-target.
  with cleaned as (
    update public.group_leaders
       set active = false
     where profile_id = v_profile_id
       and active = true
    returning 1
  )
  select count(*) into v_assignments_deactivated from cleaned;

  with cleaned_coverage as (
    update public.shepherd_coverage_assignments
       set active = false,
           ended_at = greatest(
             current_date,
             public.shepherd_coverage_assignments.assigned_at
           ),
           updated_at = now()
     where shepherd_profile_id = v_profile_id
       and active = true
    returning 1
  )
  select count(*) into v_coverage_deactivated from cleaned_coverage;

  insert into public.account_deletion_requests (profile_id, reason, status)
  values (v_profile_id, v_reason, 'pending')
  returning id into v_request_id;

  -- Paired audit row, same transaction. Content-free: the free-text reason is
  -- reduced to a presence flag, never stored in metadata.
  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_profile_id,
    'account.request_deletion',
    'account_deletion_requests',
    v_request_id,
    jsonb_build_object(
      'has_reason', v_has_reason,
      'before', jsonb_build_object('status', v_status),
      'after', jsonb_build_object('status', 'inactive'),
      'deactivated_group_leader_assignments_count',
        coalesce(v_assignments_deactivated, 0),
      'deactivated_coverage_assignments_count',
        coalesce(v_coverage_deactivated, 0)
    )
  );

  return v_request_id;
end;
$$;

revoke all on function public.request_own_account_deletion(text) from public;
revoke all on function public.request_own_account_deletion(text) from anon;
revoke all on function public.request_own_account_deletion(text) from authenticated;
grant execute on function public.request_own_account_deletion(text) to authenticated;

comment on function public.request_own_account_deletion(text) is
  'Self-service write (#563): an authenticated non-super-admin user requests deletion of their OWN account. Soft-archives the profile (status=inactive, revoking access), records a pending account_deletion_requests row, and writes a paired content-free account.request_deletion audit row in one transaction. Raises invalid_input, insufficient_privilege (no active own profile), forbidden_target (super_admin), deletion_already_requested.';
