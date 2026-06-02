-- Fix: super_admin_bulk_import_people created_count overcount (#165 follow-up).
--
-- The SAC.5 importer incremented v_created once per INPUT row, but the leader
-- branch inserts into profiles with `on conflict do nothing` against the
-- UNIQUE(email) constraint -- so re-importing an already-present leader email
-- writes zero rows. The paired audit_events row's created_count therefore
-- overstated how many records were actually created whenever an import
-- re-touched an existing leader email.
--
-- Fix: after each insert, read how many rows the statement actually wrote via
-- GET DIAGNOSTICS ... ROW_COUNT and accumulate that, so created_count reflects
-- real creations (a no-op on-conflict insert contributes 0).
--
-- Member de-duplication stays deliberately at the APPLICATION layer
-- (lib/admin/people-import.ts de-dups each batch). members has no unique
-- (email, phone) constraint by design: a member's email/phone are optional and
-- legitimately shared (a couple's shared email, a household phone), so a hard
-- DB uniqueness rule enforced via ON CONFLICT DO NOTHING would silently drop
-- genuinely-distinct people. Cross-batch member dedup, if ever wanted, belongs
-- in a human-reviewed merge tool, not a silent constraint -- so the members
-- insert below always writes one row (the previous, ineffective
-- `on conflict do nothing` -- members has no constraint to conflict on -- is
-- dropped to match the real, documented behaviour).
--
-- CREATE OR REPLACE preserves the existing EXECUTE grants; the super_admin
-- gate, search_path pinning, and PII handling are unchanged.

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
  v_inserted int;
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
      -- an email is malformed. on conflict do nothing makes a re-imported
      -- existing email a no-op (zero rows written) -- counted accordingly
      -- below so created_count never overstates real creations.
      if v_email is null then
        raise exception 'invalid_input';
      end if;
      insert into public.profiles (id, full_name, email, role, status)
      values (gen_random_uuid(), v_full_name, lower(v_email), 'leader', 'active')
      on conflict do nothing;
    else
      -- members has no unique (email, phone) constraint by design (see header):
      -- member dedup is handled in the application batch, not the DB. This
      -- insert always writes exactly one row.
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
  'Phase SAC.5 (#165): super-admin bulk create of leader profiles + member records from a parsed jsonb row array. created_count in the paired audit_events row reflects rows actually written (on-conflict leader no-ops are not counted).';
