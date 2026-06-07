-- Admin UX: edit + soft-archive for Prospects.
--
-- The Interest Funnel (20260608020000) shipped create + transition only, so an
-- accidental/test prospect's details can't be corrected and the record can't
-- leave the board (the only cleanup-like move was a state change to
-- not_at_this_time). This adds:
--   * admin_update_prospect  — correct identity fields (name / email / phone),
--   * admin_archive_prospect — soft-archive (archived = true) so the row leaves
--     the active board (the board read drops archived non-joined rows).
--
-- Same posture as admin_create_prospect / admin_transition_prospect:
-- SECURITY DEFINER, auth_is_admin() gate, paired audit_events row. Email/phone
-- bodies are not stored in audit metadata (presence flags only). No hard delete.
--
-- Fixed error tokens: insufficient_privilege, invalid_input, missing_prospect.

-- ---------------------------------------------------------------------------
-- 1. admin_update_prospect — edit identity fields, no state change.
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_prospect(
  p_prospect_id uuid,
  p_full_name   text,
  p_email       text,
  p_phone       text
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
  v_exists uuid;
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

  select id into v_exists from public.prospects where id = p_prospect_id for update;
  if v_exists is null then
    raise exception 'missing_prospect';
  end if;

  update public.prospects
     set full_name  = v_name,
         email      = v_email,
         phone      = v_phone,
         updated_by = v_actor
   where id = p_prospect_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.update_prospect',
    'prospects',
    p_prospect_id,
    jsonb_build_object(
      'has_email', v_email is not null,
      'has_phone', v_phone is not null
    )
  );

  return p_prospect_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. admin_archive_prospect — soft-archive (cleanup).
-- ---------------------------------------------------------------------------
-- Sets archived = true on any state. The prospects_joined_is_archived CHECK is
-- one-directional (joined => archived), so archiving a non-joined prospect is
-- allowed. The board read drops archived non-joined rows entirely (they are NOT
-- joined, so they don't surface in the Joined roll-up either).
create or replace function public.admin_archive_prospect(
  p_prospect_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_existing record;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  select id, state, archived into v_existing
    from public.prospects where id = p_prospect_id for update;
  if v_existing.id is null then
    raise exception 'missing_prospect';
  end if;

  update public.prospects
     set archived = true,
         updated_by = v_actor
   where id = p_prospect_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.archive_prospect',
    'prospects',
    p_prospect_id,
    jsonb_build_object(
      'before', jsonb_build_object('state', v_existing.state, 'archived', v_existing.archived),
      'after',  jsonb_build_object('archived', true)
    )
  );

  return p_prospect_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Grants.
-- ---------------------------------------------------------------------------
revoke all on function public.admin_update_prospect(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_update_prospect(uuid, text, text, text)
  to authenticated;

revoke all on function public.admin_archive_prospect(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_archive_prospect(uuid)
  to authenticated;

comment on function public.admin_update_prospect(uuid, text, text, text) is
  'Interest Funnel admin write: corrects a Prospect''s identity fields (name/email/phone) without a state change, plus a paired audit_events row.';
comment on function public.admin_archive_prospect(uuid) is
  'Interest Funnel admin write: soft-archives a Prospect (archived = true) so it leaves the active board; writes a paired audit_events row. No hard delete.';
