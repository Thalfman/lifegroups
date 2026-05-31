-- Phase SAC.5 (#165) Super Admin Console bulk people import.
--
-- super_admin_bulk_import_people(p_rows jsonb): takes a jsonb array of rows
-- {full_name, email, phone, role:'leader'|'member'} (already parsed + de-duped
-- in TypeScript by lib/admin/people-import.ts) and creates each one, mirroring
-- the existing admin_create_leader_profile / admin_create_member column shapes:
--   - role 'leader'  -> profiles (id, full_name, email, role 'leader', status
--     'active'); email is required (profiles.email is NOT NULL and is the dedup
--     key), lowercased.
--   - role 'member'  -> members (full_name, email, phone, status 'active');
--     email + phone are optional.
--
-- Malformed input (not an array, a row missing full_name, a leader row missing
-- a usable email, or a bad role) raises invalid_input and aborts the batch. One
-- paired audit_events row records the created count only (no PII). Returns the
-- created count as text so it threads through the shared write runner's string
-- return contract.
--
-- SECURITY DEFINER behind auth_role() = 'super_admin'; no service-role writes.

set check_function_bodies = off;

create or replace function public.super_admin_bulk_import_people(p_rows jsonb)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_row jsonb;
  v_full_name text;
  v_email text;
  v_phone text;
  v_role text;
  v_created int := 0;
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'invalid_input';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_row) <> 'object' then
      raise exception 'invalid_input';
    end if;

    v_full_name := nullif(btrim(coalesce(v_row ->> 'full_name', '')), '');
    v_email := nullif(btrim(coalesce(v_row ->> 'email', '')), '');
    v_phone := nullif(btrim(coalesce(v_row ->> 'phone', '')), '');
    v_role := coalesce(v_row ->> 'role', '');

    if v_full_name is null then
      raise exception 'invalid_input';
    end if;
    if v_role not in ('leader', 'member') then
      raise exception 'invalid_input';
    end if;

    if v_role = 'leader' then
      -- profiles.email is NOT NULL and is the dedup key; a leader row without
      -- an email is malformed.
      if v_email is null then
        raise exception 'invalid_input';
      end if;
      insert into public.profiles (id, full_name, email, role, status)
      values (gen_random_uuid(), v_full_name, lower(v_email), 'leader', 'active')
      on conflict do nothing;
    else
      insert into public.members (full_name, email, phone, status)
      values (
        v_full_name,
        case when v_email is null then null else lower(v_email) end,
        v_phone,
        'active'
      )
      on conflict do nothing;
    end if;

    v_created := v_created + 1;
  end loop;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'super_admin.bulk_import_people',
    'profiles',
    null,
    jsonb_build_object('created_count', v_created)
  );

  return v_created::text;
end;
$$;

revoke all     on function public.super_admin_bulk_import_people(jsonb) from public;
revoke all     on function public.super_admin_bulk_import_people(jsonb) from anon;
revoke all     on function public.super_admin_bulk_import_people(jsonb) from authenticated;
grant  execute on function public.super_admin_bulk_import_people(jsonb) to authenticated;

comment on function public.super_admin_bulk_import_people(jsonb) is
  'Phase SAC.5 (#165): super-admin bulk create of leader profiles + member records from a parsed jsonb row array. Paired audit_events row records the count only.';
