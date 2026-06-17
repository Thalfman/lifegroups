-- Bulk people import becomes a Ministry-Admin capability, not Super-Admin-only.
--
-- The SAC.5 importer (20260531040000 + the 20260602000000 created_count fix) was
-- gated on auth_role() = 'super_admin', so a Ministry Admin had to ask the Super
-- Admin to load a roster from a spreadsheet. Adding people is ordinary ministry
-- admin work, so this exposes the same audited batch behind the admin gate.
--
-- This is a NEW function (admin_bulk_import_people) rather than a re-gate of the
-- super-admin one: the action layer pins the literal RPC name + args, and the
-- admin_* / super_admin_* families name their own authorization boundary. The
-- body is byte-for-byte the super-admin importer's current behaviour with two
-- changes: it gates on auth_is_admin() (which super_admin also satisfies, so the
-- new RPC serves both roles) and writes an 'admin.bulk_import_people' audit row.
-- The older super_admin_bulk_import_people stays defined but is no longer called.
--
-- Mirrors admin_add_person_to_group (20260706000000): SECURITY DEFINER with a
-- pinned search_path, an auth_is_admin() + non-null-actor gate, input validation,
-- one paired audit_events row in the same transaction, and EXECUTE locked down to
-- authenticated. No new tables, enums, or write RLS policies; no deletes. Member
-- de-duplication stays at the application layer (lib/admin/people-import.ts); the
-- members insert always writes one row by design (members has no unique
-- (email, phone) constraint — see the 20260602000000 header).

set check_function_bodies = off;

create or replace function public.admin_bulk_import_people(p_rows jsonb)
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
  v_inserted int;
  v_created int := 0;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'invalid_input';
  end if;

  -- Enforce the per-batch row cap at the security boundary too, not only in the
  -- TS parser (PEOPLE_IMPORT_MAX_ROWS = 500 in lib/admin/people-import.ts): this
  -- SECURITY DEFINER function is granted to authenticated admins, so a direct
  -- RPC call that bypasses the parser must not be able to insert an unbounded
  -- batch in one audited transaction.
  if jsonb_array_length(p_rows) > 500 then
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
      -- an email is malformed. on conflict do nothing makes a re-imported
      -- existing email a no-op (zero rows written) -- counted accordingly
      -- below so created_count never overstates real creations.
      if v_email is null then
        raise exception 'invalid_input';
      end if;
      -- Preserve the leader's phone like the one-at-a-time create paths
      -- (admin_create_leader_profile / admin_add_person_to_group) and like the
      -- member branch below; the CSV + template both carry a phone column.
      insert into public.profiles (id, full_name, email, phone, role, status)
      values (gen_random_uuid(), v_full_name, lower(v_email), v_phone, 'leader', 'active')
      on conflict do nothing;
    else
      -- members has no unique (email, phone) constraint by design: member dedup
      -- is handled in the application batch, not the DB. Always one row.
      insert into public.members (full_name, email, phone, status)
      values (
        v_full_name,
        case when v_email is null then null else lower(v_email) end,
        v_phone,
        'active'
      );
    end if;

    -- Count rows the statement above actually wrote (0 when an on-conflict
    -- leader insert no-ops), not merely rows seen, so the audit created_count
    -- is accurate.
    get diagnostics v_inserted = row_count;
    v_created := v_created + v_inserted;
  end loop;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.bulk_import_people',
    'profiles',
    null,
    jsonb_build_object('created_count', v_created)
  );

  return v_created::text;
end;
$$;

-- Grants: revoke broadly, then grant execute to authenticated only. The body
-- still enforces auth_is_admin(); the grant only makes the function callable.
revoke all     on function public.admin_bulk_import_people(jsonb) from public;
revoke all     on function public.admin_bulk_import_people(jsonb) from anon;
revoke all     on function public.admin_bulk_import_people(jsonb) from authenticated;
grant  execute on function public.admin_bulk_import_people(jsonb) to authenticated;

comment on function public.admin_bulk_import_people(jsonb) is
  'Admin bulk create of leader profiles + member records from a parsed jsonb row array (Settings > System importer). Admin-gated (auth_is_admin), one paired audit_events row; created_count reflects rows actually written (on-conflict leader no-ops are not counted). No deletes.';
