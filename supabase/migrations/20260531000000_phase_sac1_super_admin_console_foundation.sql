-- Phase SAC.1 (#159): Super Admin Console foundation — config store + audited
-- write path. This is the tracer-bullet foundation the later console slices
-- (feature flags, editable copy, user management) build on.
--
-- This migration introduces:
--   * One new table: platform_config (keyed-row jsonb store, mirroring the
--     app_settings shape but scoped to the Super Admin alone). Holds platform
--     config — feature flags + editable copy — distinct from the ministry-wide
--     metric_defaults that live in app_settings and are admin-readable.
--   * One seeded platform_config row keyed 'platform_config' holding the
--     default typed config. The seed uses a repair-merge upsert so re-running
--     never clobbers values an operator has already set.
--   * One SECURITY DEFINER RPC: super_admin_set_platform_config(p_config jsonb).
--
-- Architecture parity with Phase 5A.x:
--   * The function is the security boundary. It enforces auth_role() =
--     'super_admin' (NOT auth_is_admin() — the ministry admin must never reach
--     platform config) and auth_profile_id() is not null.
--   * The data change AND the matching audit_events row write in one
--     transaction; if the audit insert fails, the data change rolls back.
--   * No INSERT/UPDATE/DELETE policies — the SECURITY DEFINER surface is the
--     only write path, and there are no service-role writes in the Next runtime.
--   * Fixed error tokens (insufficient_privilege, invalid_input,
--     missing_settings) map to friendly UI strings in lib/admin/action-result.ts.
--
-- Unlike app_settings (which any authenticated user can read), platform_config
-- is gated by a Super-Admin-only SELECT policy, so the Ministry Admin cannot
-- see it and the console it backs.

-- ===========================================================================
-- 1. platform_config table — Super-Admin-only keyed-row store
-- ===========================================================================

create table if not exists public.platform_config (
  id            uuid primary key default gen_random_uuid(),
  setting_key   text not null unique,
  setting_value jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists platform_config_set_updated_at on public.platform_config;
create trigger platform_config_set_updated_at
  before update on public.platform_config
  for each row execute function public.set_updated_at();

-- RLS: Super-Admin-only SELECT. Postgres evaluates table-level grants BEFORE
-- policies, so the explicit `grant select ... to authenticated` below is
-- required for the super admin to read the table at all; the policy then
-- narrows that grant to super_admin sessions only.
alter table public.platform_config enable row level security;

drop policy if exists platform_config_super_admin_read on public.platform_config;
create policy platform_config_super_admin_read on public.platform_config
  for select to authenticated using (public.auth_role() = 'super_admin');

-- No INSERT/UPDATE/DELETE policies. All writes flow through the SECURITY
-- DEFINER RPC below.

revoke all    on public.platform_config from public;
revoke all    on public.platform_config from anon;
revoke all    on public.platform_config from authenticated;
grant  select on public.platform_config to authenticated;

comment on table public.platform_config is
  'Phase SAC.1 (#159): Super Admin Console platform config (feature flags + editable copy). Keyed-row jsonb store; Super-Admin-only RLS; writes only via super_admin_set_platform_config.';

-- ===========================================================================
-- 2. Seed the platform_config row (repair-merge)
-- ===========================================================================
--
-- On first run: insert the default config jsonb.
-- On re-run:    only fill in keys missing from the stored row, leaving any
--               value an operator already changed untouched
--               (excluded.setting_value || platform_config.setting_value:
--               the right-hand operand wins for duplicate keys).
--
-- console_tracer_note is the trivial round-trip tracer for this foundation:
-- the console sets it, it persists via the audited RPC, and it reads back on
-- the next load — proving store + RPC + RLS + audit + shell end-to-end before
-- real flags and copy build on top.

insert into public.platform_config (setting_key, setting_value)
values (
  'platform_config',
  jsonb_build_object('console_tracer_note', '')
)
on conflict (setting_key) do update
  set setting_value = excluded.setting_value || public.platform_config.setting_value;

-- ===========================================================================
-- 3. RPC: super_admin_set_platform_config
-- ===========================================================================

create or replace function public.super_admin_set_platform_config(
  p_config jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid;
  v_row_id uuid;
  v_before jsonb;
  v_merged jsonb;
  v_note   text;
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'invalid_input';
  end if;

  -- Whitelist + per-key validation. Unknown keys are ignored so a future
  -- schema addition cannot corrupt the stored row by accident.
  if p_config ? 'console_tracer_note' then
    if jsonb_typeof(p_config -> 'console_tracer_note') <> 'string' then
      raise exception 'invalid_input';
    end if;
    v_note := p_config ->> 'console_tracer_note';
    if char_length(v_note) > 200 then
      raise exception 'invalid_input';
    end if;
  end if;

  select id, setting_value into v_row_id, v_before
    from public.platform_config
   where setting_key = 'platform_config'
   for update;

  if v_row_id is null then
    raise exception 'missing_settings';
  end if;

  -- Merge: submitted whitelisted keys override stored keys; unspecified keys
  -- retain their existing value.
  v_merged := v_before;
  if p_config ? 'console_tracer_note' then
    v_merged := v_merged
      || jsonb_build_object('console_tracer_note', p_config -> 'console_tracer_note');
  end if;

  update public.platform_config
     set setting_value = v_merged
   where id = v_row_id;

  -- Audit the change WITHOUT the raw before/after values. audit_events is
  -- readable by ministry_admin (audit_events_admin_read uses auth_is_admin()),
  -- so logging the config values here would leak Super-Admin-only platform
  -- config across the platform_config RLS boundary. We record only the key
  -- names that were submitted — enough to trace who changed what, without
  -- exposing the values (current or future flags / editable copy).
  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'super_admin.set_platform_config',
    'platform_config',
    v_row_id,
    jsonb_build_object(
      'submitted_keys', (select jsonb_agg(k) from jsonb_object_keys(p_config) k)
    )
  );

  return v_row_id;
end;
$$;

-- ===========================================================================
-- 4. Grants. Revoke from public/anon/authenticated, then grant execute to
-- authenticated. The function body enforces the super-admin gate; granting
-- execute to authenticated only makes the function callable.
-- ===========================================================================

revoke all     on function public.super_admin_set_platform_config(jsonb) from public;
revoke all     on function public.super_admin_set_platform_config(jsonb) from anon;
revoke all     on function public.super_admin_set_platform_config(jsonb) from authenticated;
grant  execute on function public.super_admin_set_platform_config(jsonb) to authenticated;

comment on function public.super_admin_set_platform_config(jsonb) is
  'Phase SAC.1 super-admin write: merges submitted whitelisted keys into platform_config, validates per-key, writes a paired audit_events row. Super-admin gate only.';
