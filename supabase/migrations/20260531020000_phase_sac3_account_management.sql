-- Phase SAC.3 (#163) Super Admin Console account management.
--
-- Two audited, super-admin-gated RPCs:
--   - super_admin_set_profile_status(p_profile_id, p_status): activate or
--     deactivate a profile. Cannot target the bootstrap super_admin
--     (forbidden_target), cannot target self (self_target_not_allowed).
--   - super_admin_log_password_reset(p_profile_id): writes an audit row for a
--     password-reset email the server action triggered via Supabase Auth (the
--     email send itself is not an RPC; this gives it an audit trail).
--
-- Both SECURITY DEFINER behind auth_role() = 'super_admin', with a paired
-- audit_events row in the same transaction. No service-role writes.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- super_admin_set_profile_status(p_profile_id uuid, p_status text)
-- ---------------------------------------------------------------------------

create or replace function public.super_admin_set_profile_status(
  p_profile_id uuid,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_target_role text;
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_profile_id is null then
    raise exception 'invalid_input';
  end if;

  if p_status is null or p_status not in ('active', 'inactive') then
    raise exception 'invalid_status';
  end if;

  -- A super admin can't deactivate / re-enable themselves through the console.
  if p_profile_id = v_actor then
    raise exception 'self_target_not_allowed';
  end if;

  select role::text into v_target_role
    from public.profiles
   where id = p_profile_id;

  if v_target_role is null then
    raise exception 'missing_profile';
  end if;

  -- Bootstrap super_admin is managed only via the documented bootstrap
  -- procedure; it can't be disabled through this console.
  if v_target_role = 'super_admin' then
    raise exception 'forbidden_target';
  end if;

  update public.profiles
     set status = p_status::public.profile_status,
         updated_at = now()
   where id = p_profile_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'super_admin.set_profile_status',
    'profiles',
    p_profile_id,
    jsonb_build_object('target', p_profile_id, 'status', p_status)
  );

  return p_profile_id;
end;
$$;

revoke all     on function public.super_admin_set_profile_status(uuid, text) from public;
revoke all     on function public.super_admin_set_profile_status(uuid, text) from anon;
revoke all     on function public.super_admin_set_profile_status(uuid, text) from authenticated;
grant  execute on function public.super_admin_set_profile_status(uuid, text) to authenticated;

comment on function public.super_admin_set_profile_status(uuid, text) is
  'Phase SAC.3 (#163): super-admin activate/deactivate a profile. Blocks self and the bootstrap super_admin; paired audit_events row.';

-- ---------------------------------------------------------------------------
-- super_admin_log_password_reset(p_profile_id uuid)
-- ---------------------------------------------------------------------------
-- The reset email is sent by the server action through Supabase Auth's
-- resetPasswordForEmail (a normal client call, no service role). This RPC only
-- writes the paired audit row so the action remains audited end-to-end.

create or replace function public.super_admin_log_password_reset(
  p_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_profile_id is null then
    raise exception 'invalid_input';
  end if;

  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'missing_profile';
  end if;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'super_admin.request_password_reset',
    'profiles',
    p_profile_id,
    jsonb_build_object('target', p_profile_id)
  );

  return p_profile_id;
end;
$$;

revoke all     on function public.super_admin_log_password_reset(uuid) from public;
revoke all     on function public.super_admin_log_password_reset(uuid) from anon;
revoke all     on function public.super_admin_log_password_reset(uuid) from authenticated;
grant  execute on function public.super_admin_log_password_reset(uuid) to authenticated;

comment on function public.super_admin_log_password_reset(uuid) is
  'Phase SAC.3 (#163): writes the paired audit_events row for a super-admin-triggered password reset email.';
