-- PRD #745 / slice #746 — Capture a Prospect's desired Group type at intake.
--
-- The 2026-06 cell collapse (20260708000000) dropped the Prospect's "desired
-- cell" (audience × category) with no replacement, so the Interest Funnel lost
-- the ability to record what kind of group a person actually wants. This restores
-- it as an optional, free-text Desired group type mirroring groups.group_type
-- exactly: nullable, char_length <= 80, NOT FK-constrained to the catalog (a
-- Prospect's desired type may validly be a value not yet in the master list).
--
-- Scope is capture + display only (this slice handles existing types from the
-- admin-managed group_types list; inline "add new type" and edit-from-card are
-- separate later slices). Writes stay on the existing audited SECURITY DEFINER
-- path: admin_create_prospect is re-created to thread the new arg, with its
-- paired audit_events row. Admin-only RLS unchanged; no hard deletes.

-- ---------------------------------------------------------------------------
-- 1. Additive, nullable column + length constraint (mirrors groups_group_type_len).
-- ---------------------------------------------------------------------------

alter table public.prospects
  add column if not exists desired_group_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'prospects_desired_group_type_len'
  ) then
    alter table public.prospects
      add constraint prospects_desired_group_type_len
      check (desired_group_type is null or char_length(desired_group_type) <= 80);
  end if;
end$$;

comment on column public.prospects.desired_group_type is
  'PRD #745: the optional Group type this Prospect wants, free text mirroring groups.group_type (<= 80 chars, not FK-constrained to the group_types catalog). null = not set. Capture + display only; does not feed any counts or the multiplication readiness trigger.';

-- ---------------------------------------------------------------------------
-- 2. RPC: create a Prospect (re-created to accept + persist the desired type).
-- ---------------------------------------------------------------------------

create or replace function public.admin_create_prospect(
  p_full_name          text,
  p_email              text,
  p_phone              text,
  p_desired_group_type text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_name  text;
  v_email text;
  v_phone text;
  v_desired_type text;
  v_id    uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  v_name := nullif(btrim(coalesce(p_full_name, '')), '');
  if v_name is null then
    raise exception 'invalid_input';
  end if;
  if char_length(v_name) > 120 then
    raise exception 'invalid_input';
  end if;
  v_email := nullif(btrim(coalesce(p_email, '')), '');
  v_phone := nullif(btrim(coalesce(p_phone, '')), '');

  -- Optional desired Group type: trim, empty -> null, <= 80 chars (mirrors
  -- groups.group_type). Free text; not validated against the group_types list.
  v_desired_type := nullif(btrim(coalesce(p_desired_group_type, '')), '');
  if v_desired_type is not null and char_length(v_desired_type) > 80 then
    raise exception 'invalid_input';
  end if;

  insert into public.prospects (
    full_name, email, phone, desired_group_type, state, created_by, updated_by
  )
  values (
    v_name, v_email, v_phone, v_desired_type, 'interested', v_actor, v_actor
  )
  returning id into v_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.create_prospect',
    'prospects',
    v_id,
    jsonb_build_object(
      'has_email', v_email is not null,
      'has_phone', v_phone is not null,
      'state', 'interested',
      -- The Group type name is not PII (it is shared catalog vocabulary), so it
      -- is recorded directly alongside the existing presence flags.
      'desired_group_type', v_desired_type
    )
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Grants. Drop the prior 3-arg signature so callers must use the 4-arg shape;
--    re-grant execute to authenticated. (admin_update_prospect is untouched.)
-- ---------------------------------------------------------------------------

drop function if exists public.admin_create_prospect(text, text, text);

revoke all on function public.admin_create_prospect(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_create_prospect(text, text, text, text)
  to authenticated;

comment on function public.admin_create_prospect(text, text, text, text) is
  'Interest Funnel (#375, extended #746): creates a Prospect in the interested state with an optional free-text desired Group type. Writes a paired audit_events row.';
