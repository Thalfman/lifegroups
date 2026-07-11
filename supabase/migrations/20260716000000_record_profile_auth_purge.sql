-- Issue #881: record the service-role Auth deletion that follows the existing
-- transactional profile purge. Supabase Auth and Postgres cannot share one
-- transaction, so the Edge Function resumes from the profile tombstone after a
-- partial failure and calls this idempotent audit envelope only after Auth is in
-- the requested deleted state. IDs and outcome only; no email or request reason.

create or replace function public.service_record_profile_auth_purge(
  p_actor_profile_id uuid,
  p_profile_id uuid,
  p_auth_user_id uuid,
  p_tombstone_id uuid,
  p_outcome text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_audit_id uuid;
  v_snapshot_auth_user_id uuid;
begin
  if p_actor_profile_id is null
     or p_profile_id is null
     or p_tombstone_id is null then
    raise exception 'invalid_input';
  end if;

  if p_outcome not in ('deleted', 'already_missing', 'not_linked') then
    raise exception 'invalid_input';
  end if;

  if not exists (
    select 1
      from public.profiles
     where id = p_actor_profile_id
       and role = 'super_admin'
       and status = 'active'
  ) then
    raise exception 'invalid_actor';
  end if;

  select nullif(t.row_snapshot->>'auth_user_id', '')::uuid
    into v_snapshot_auth_user_id
    from public.tombstones t
   where t.id = p_tombstone_id
     and t.entity_type = 'profile'
     and t.entity_id = p_profile_id;

  if not found or v_snapshot_auth_user_id is distinct from p_auth_user_id then
    raise exception 'invalid_target';
  end if;

  -- Serialize concurrent retries for one tombstone so the read-then-insert
  -- idempotency check cannot create duplicate auth-side audit rows.
  perform pg_advisory_xact_lock(
    hashtextextended(p_tombstone_id::text, 0)
  );

  select ae.id
    into v_audit_id
    from public.audit_events ae
   where ae.action = 'super_admin.auth_user_delete'
     and ae.entity_id = coalesce(p_auth_user_id, p_profile_id)
     and ae.metadata->>'tombstone_id' = p_tombstone_id::text
   limit 1;

  if v_audit_id is not null then
    return v_audit_id;
  end if;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    p_actor_profile_id,
    'super_admin.auth_user_delete',
    'auth_user',
    coalesce(p_auth_user_id, p_profile_id),
    jsonb_build_object(
      'profile_id', p_profile_id,
      'tombstone_id', p_tombstone_id,
      'outcome', p_outcome
    )
  )
  returning id into v_audit_id;

  return v_audit_id;
end;
$$;

revoke all on function public.service_record_profile_auth_purge(
  uuid, uuid, uuid, uuid, text
) from public;
revoke all on function public.service_record_profile_auth_purge(
  uuid, uuid, uuid, uuid, text
) from anon;
revoke all on function public.service_record_profile_auth_purge(
  uuid, uuid, uuid, uuid, text
) from authenticated;
grant execute on function public.service_record_profile_auth_purge(
  uuid, uuid, uuid, uuid, text
) to service_role;

comment on function public.service_record_profile_auth_purge(
  uuid, uuid, uuid, uuid, text
) is
  'Issue #881: service-role-only, idempotent audit envelope for the Auth identity removal that follows an audited profile tombstone purge. Validates the active Super-Admin actor and tombstone/auth-user association; stores IDs and outcome only.';
