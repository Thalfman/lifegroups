-- Concept Reconciliation §B (#190): retire the deprecated `staff_viewer` role.
--
-- Decision (Julian/Tom, recorded on #190): REMOVE staff_viewer rather than
-- quarantine it. It was a remnant of the original multi-tier vision, retained
-- in the role enum for back-compat and treated as no-access (never assignable
-- from the UI). The TypeScript `UserRole` union, role labels, predicates, and
-- assignment guards are all dropped in the same change.
--
-- DB scope — why the enum value is neutralised, not physically dropped:
-- Dropping a value from a Postgres enum requires the rename/recreate/USING-cast
-- type-swap. That is safe only when nothing but table columns depends on the
-- type. Here `public.auth_role()` RETURNS `public.user_role`, and a long list
-- of RLS policies depend on `auth_role()` (and on `auth_is_admin_or_staff()`).
-- A type-swap would leave `auth_role()` bound to the renamed old type, and
-- repointing its return type would require DROP FUNCTION ... CASCADE — tearing
-- down and rebuilding the entire RLS policy graph. That is far more risk than
-- removing a dormant value warrants.
--
-- Instead we make staff_viewer fully inert, which satisfies the issue's intent
-- ("no code path treats staff_viewer as an assignable live tier", rows
-- migrated):
--   1. Reassign any existing staff_viewer rows to a no-access disabled state.
--   2. Neutralise the two predicates that still grant it anything, so no RLS
--      path can ever resolve true for the value again.
-- After this, the value exists in the enum but is unreachable by data, app
-- code (removed from the union + guards), and access predicates.
--
-- Precedent for in-place enum/function reshapes:
-- 20260529000000_phase_os1_over_shepherd_role.sql and
-- 20260530030000_julian_q2_shepherd_care_status_five.sql.

begin;

-- ---------------------------------------------------------------------------
-- 1. Reassign any existing staff_viewer profiles to a no-access disabled state.
--    No UI ever assigned the role, so this is typically a no-op; guard it
--    anyway and record each reassignment in the audit log before mutating, so
--    "who was migrated" stays answerable. leader/co_leader are themselves
--    no-access per ADR 0002, so 'leader' + inactive preserves the no-access
--    posture while vacating the value from live data.
-- ---------------------------------------------------------------------------
insert into public.audit_events (action, entity_type, entity_id, actor_profile_id, payload)
select
  'system.migration.remove_staff_viewer',
  'profiles',
  p.id,
  null,
  jsonb_build_object(
    'previous_role', 'staff_viewer',
    'new_role', 'leader',
    'previous_status', p.status::text,
    'new_status', 'inactive',
    'migration', '20260531140000_remove_staff_viewer_role'
  )
from public.profiles p
where p.role = 'staff_viewer';

update public.profiles
set role = 'leader', status = 'inactive', updated_at = now()
where role = 'staff_viewer';

-- ---------------------------------------------------------------------------
-- 2. Neutralise the predicates that still reference staff_viewer, so the value
--    can never again resolve to access. Signatures are unchanged, so
--    CREATE OR REPLACE keeps every existing grant and policy dependency intact.
-- ---------------------------------------------------------------------------

-- auth_is_staff_viewer(): the role is retired; nobody is a staff viewer.
create or replace function public.auth_is_staff_viewer()
  returns boolean
  language sql
  security definer
  set search_path = public
  stable
  as $$
    select false;
  $$;

-- auth_is_admin_or_staff(): drop staff_viewer from the read tier. The
-- "or staff" read tier is now just the admins; the name is kept so the many
-- SELECT policies that call it need no change.
create or replace function public.auth_is_admin_or_staff()
  returns boolean
  language sql
  security definer
  set search_path = public
  stable
  as $$
    select coalesce(public.auth_role() in ('super_admin','ministry_admin'), false);
  $$;

commit;
