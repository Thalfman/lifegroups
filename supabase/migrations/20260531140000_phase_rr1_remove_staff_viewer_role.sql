-- Phase RR.1 (#190): remove the retired `staff_viewer` value from the
-- `public.user_role` enum entirely.
--
-- staff_viewer was a legacy no-access role. It was never assignable through the
-- app and carried no product surface. This migration:
--   1. Vacates the value: any remaining profiles.role = 'staff_viewer' rows are
--      reassigned to an inactive `leader` (leader/co_leader are themselves gated
--      as no-access per docs/adr/0002-oversight-ladder-and-leader-gating.md, so
--      this preserves the no-access posture while freeing the enum value).
--   2. Drops the value from the Postgres enum. Postgres cannot DROP an enum
--      value in place, so this uses the standard rename / recreate / swap dance.
--      Every object that binds the type by name (the `profiles.role` column and
--      the `auth_role()` / `change_user_role()` / `set_profile_role()` functions)
--      is handled so the old type can be dropped, then the functions are
--      recreated against the new type — with the staff_viewer branches removed.
--
-- The single column using `user_role` is `public.profiles.role`
-- (NOT NULL DEFAULT 'leader'); see 20260517040000_phase2_schema.sql.

begin;

-- ---------------------------------------------------------------------------
-- 1. Vacate the value. Guarded UPDATE: only touches staff_viewer rows.
-- ---------------------------------------------------------------------------
update public.profiles
   set role = 'leader',
       status = 'inactive',
       updated_at = now()
 where role = 'staff_viewer';

-- ---------------------------------------------------------------------------
-- 2. Decouple auth_is_* helpers from auth_role() so auth_role() can be dropped.
--    These are SQL function bodies that currently call auth_role(); inlining
--    the profiles lookup removes that dependency. The bodies are restored to
--    call auth_role() again at the end of the migration, so the final state is
--    behaviourally identical (minus the staff_viewer reference).
--    auth_is_admin_or_staff also drops the now-dead 'staff_viewer' arm.
-- ---------------------------------------------------------------------------
create or replace function public.auth_is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid())
      in ('super_admin','ministry_admin'),
    false
  );
$$;

create or replace function public.auth_is_super_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()) = 'super_admin',
    false
  );
$$;

create or replace function public.auth_is_admin_or_staff() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid())
      in ('super_admin','ministry_admin'),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Drop the objects that bind the user_role type (or the removed value) so
--    the old enum type has no remaining dependencies.
--    auth_is_staff_viewer() is unused (defined + granted, referenced by no
--    policy) and is removed for good.
-- ---------------------------------------------------------------------------
drop function if exists public.auth_is_staff_viewer();
drop function if exists public.change_user_role(uuid, uuid, public.user_role, text);
drop function if exists public.set_profile_role(uuid, uuid, public.user_role, text);
drop function if exists public.auth_role();

-- ---------------------------------------------------------------------------
-- 4. Swap the enum type, dropping the staff_viewer value.
-- ---------------------------------------------------------------------------
alter type public.user_role rename to user_role_old;

create type public.user_role as enum (
  'super_admin','ministry_admin','over_shepherd','leader','co_leader'
);

alter table public.profiles
  alter column role drop default;

alter table public.profiles
  alter column role type public.user_role
  using role::text::public.user_role;

alter table public.profiles
  alter column role set default 'leader';

drop type public.user_role_old;

-- ---------------------------------------------------------------------------
-- 5. Recreate auth_role() against the new type, and restore the auth_is_*
--    helpers to call it (their original shape).
-- ---------------------------------------------------------------------------
create or replace function public.auth_role() returns public.user_role
  language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.auth_is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() in ('super_admin','ministry_admin'), false);
$$;

create or replace function public.auth_is_super_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() = 'super_admin', false);
$$;

create or replace function public.auth_is_admin_or_staff() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() in ('super_admin','ministry_admin'), false);
$$;

-- ---------------------------------------------------------------------------
-- 6. Recreate the role-write RPCs against the new type, with the staff_viewer
--    guard branches removed (the value no longer exists). set_profile_role
--    keeps its super_admin guard.
-- ---------------------------------------------------------------------------
create or replace function public.change_user_role(
  p_actor uuid,
  p_target uuid,
  p_new_role public.user_role,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_actor = p_target then
    raise exception 'cannot_change_own_role' using errcode = '42501';
  end if;

  update public.profiles
     set role = p_new_role,
         updated_at = now()
   where id = p_target;

  insert into public.audit_events (actor_id, action, target_id, metadata)
  values (
    p_actor,
    'change_user_role',
    p_target,
    jsonb_build_object('new_role', p_new_role, 'reason', p_reason)
  );
end;
$$;

create or replace function public.set_profile_role(
  p_actor uuid,
  p_target uuid,
  p_new_role public.user_role,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_actor = p_target then
    raise exception 'cannot_change_own_role' using errcode = '42501';
  end if;

  if p_new_role = 'super_admin'::public.user_role then
    raise exception 'invalid_role: super_admin is not assignable'
      using errcode = '22023';
  end if;

  update public.profiles
     set role = p_new_role,
         updated_at = now()
   where id = p_target;

  insert into public.audit_events (actor_id, action, target_id, metadata)
  values (
    p_actor,
    'change_user_role',
    p_target,
    jsonb_build_object('new_role', p_new_role, 'reason', p_reason)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Restore execute grants for the dropped-and-recreated functions. The new
--    enum type means new function signatures, so the prior grants no longer
--    apply. auth_role() is internal (revoked from public, granted to
--    authenticated) per phase4/phase5a2 hardening.
-- ---------------------------------------------------------------------------
revoke all on function public.auth_role() from public;
grant execute on function public.auth_role() to authenticated;

revoke all on function
  public.change_user_role(uuid, uuid, public.user_role, text) from public;
revoke all on function
  public.set_profile_role(uuid, uuid, public.user_role, text) from public;
grant execute on function
  public.change_user_role(uuid, uuid, public.user_role, text) to authenticated;
grant execute on function
  public.set_profile_role(uuid, uuid, public.user_role, text) to authenticated;

commit;
