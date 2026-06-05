-- Pivot slice 7: Prospect Next Step + Additional Note + armed follow-ups
-- (#379). Builds on the Interest Funnel Prospects (#375 /
-- 20260608020000_phase_pivot6_prospects.sql), which already reserved the
-- nullable next_step jsonb + additional_note text columns for this slice — so
-- there is NO table reshape here, only the write path + a supporting index.
--
-- Each Prospect carries ONE current Next Step — {type, due_date?, detail?} where
-- type is one of {connect_to_group_leader, follow_up} — plus a SEPARATE
-- Additional Note. A "follow_up" WITH a due_date is "armed": on/after that date
-- it surfaces as a due task (the surfacing math is pure TS in
-- lib/admin/prospect-next-step.ts; the partial index below keeps the read of
-- armed follow-ups cheap). "connect_to_group_leader" is back-office only — it
-- NEVER produces a due task and NEVER surfaces to a Leader (the Prospects table
-- is admin-only RLS, and nothing here writes to any leader-visible table).
--
-- NO email/SMS provider is wired. This RPC only records intent + audits it; the
-- no-service-role-in-runtime posture is preserved (no outbound, no service role,
-- writes only through this SECURITY DEFINER RPC behind the admin gate). The UI
-- shows a clear "to be configured" indicator that nothing is actually sent.
--
-- Architecture parity with the rest of the admin write path: auth_is_admin()
-- gate, auth_profile_id() actor, paired audit_events row, EXECUTE lockdown,
-- presence-flag-only audit metadata (never the detail / note bodies — mirrors
-- the has_notes convention in the shepherd-care + create_prospect RPCs).
--
-- Fixed error tokens (mapped to friendly messages by lib/admin/action-result.ts):
--   insufficient_privilege, invalid_input, missing_prospect.

-- ---------------------------------------------------------------------------
-- 1. Supporting index for armed/due follow-ups.
-- ---------------------------------------------------------------------------
-- The due-task surface reads active prospects whose next_step is an armed
-- follow_up (type 'follow_up' with a due_date). A partial expression index on
-- the due_date keeps that scan cheap as the prospect list grows, without
-- indexing the connect_to_group_leader or undated rows that can never be due.
create index if not exists prospects_armed_follow_up_idx
  on public.prospects (((next_step ->> 'due_date')))
  where archived = false
    and next_step ->> 'type' = 'follow_up'
    and next_step ->> 'due_date' is not null;

-- ---------------------------------------------------------------------------
-- 2. RPC: set a Prospect's current Next Step + Additional Note.
-- ---------------------------------------------------------------------------
-- Replaces both fields in one transaction (the Prospect carries one current
-- step + one note). Pass p_next_step = NULL to clear the step;
-- p_additional_note = NULL / '' to clear the note. The jsonb shape is validated
-- authoritatively here, mirroring normalizeNextStep in
-- lib/admin/prospect-next-step.ts: type in the two allowed values, due_date an
-- optional ISO date, detail an optional length-bounded text. The audit row
-- records PRESENCE FLAGS only (has_due_date / has_detail / has_note + the type)
-- — never the detail or note bodies.
create or replace function public.admin_set_prospect_next_step(
  p_prospect_id    uuid,
  p_next_step      jsonb,
  p_additional_note text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor     uuid;
  v_exists    boolean;
  v_type      text;
  v_due_date  text;
  v_detail    text;
  v_note      text;
  v_next_step jsonb;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_prospect_id is null then
    raise exception 'invalid_input';
  end if;

  -- Validate + normalize the Next Step jsonb (when present).
  if p_next_step is null or p_next_step = 'null'::jsonb then
    v_next_step := null;
  else
    if jsonb_typeof(p_next_step) <> 'object' then
      raise exception 'invalid_input';
    end if;

    v_type := p_next_step ->> 'type';
    if v_type is null
       or v_type not in ('connect_to_group_leader', 'follow_up') then
      raise exception 'invalid_input';
    end if;

    -- Optional due_date: must parse as a date when present.
    v_due_date := nullif(btrim(coalesce(p_next_step ->> 'due_date', '')), '');
    if v_due_date is not null then
      begin
        perform v_due_date::date;
      exception when others then
        raise exception 'invalid_input';
      end;
    end if;

    -- Optional detail: trimmed, length-bounded.
    v_detail := nullif(btrim(coalesce(p_next_step ->> 'detail', '')), '');
    if v_detail is not null and char_length(v_detail) > 2000 then
      raise exception 'invalid_input';
    end if;

    -- Rebuild a canonical jsonb so only the allowed keys are stored.
    v_next_step := jsonb_strip_nulls(
      jsonb_build_object(
        'type', v_type,
        'due_date', v_due_date,
        'detail', v_detail
      )
    );
  end if;

  -- Optional Additional Note: trimmed, length-bounded.
  v_note := nullif(btrim(coalesce(p_additional_note, '')), '');
  if v_note is not null and char_length(v_note) > 2000 then
    raise exception 'invalid_input';
  end if;

  select true into v_exists
    from public.prospects
   where id = p_prospect_id
   for update;
  if v_exists is null then
    raise exception 'missing_prospect';
  end if;

  update public.prospects
     set next_step       = v_next_step,
         additional_note = v_note,
         updated_by      = v_actor
   where id = p_prospect_id;

  -- Presence flags only — never the detail / note bodies (mirrors the
  -- has_notes convention in the shepherd-care + create_prospect RPCs).
  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.set_prospect_next_step',
    'prospects',
    p_prospect_id,
    jsonb_build_object(
      'has_next_step', v_next_step is not null,
      'next_step_type', v_type,
      'has_due_date', v_due_date is not null,
      'has_detail', v_detail is not null,
      'has_note', v_note is not null
    )
  );

  return p_prospect_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Grants. Deny by default, allow authenticated; the body's auth_is_admin()
-- gate is the real boundary.
-- ---------------------------------------------------------------------------

revoke all on function public.admin_set_prospect_next_step(uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_prospect_next_step(uuid, jsonb, text)
  to authenticated;

comment on function public.admin_set_prospect_next_step(uuid, jsonb, text) is
  'Pivot slice 7 (#379): sets a Prospect''s single current Next Step (type connect_to_group_leader | follow_up, optional due date + detail) and a separate Additional Note. A follow_up with a due_date is an armed follow-up surfaced as a due task on/after that date; connect_to_group_leader is back-office only (no due task, no leader surface). No provider is wired — nothing is sent. Writes a paired audit_events row with presence flags only (never the detail / note bodies).';
