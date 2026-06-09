-- Phase USAGE.1: Super-Admin usage & login tracking, gated behind the
-- `usage_tracking` feature flag.
--
-- The owner (Tom) wants to understand how the first cohort of users is using the
-- app: who signs in, and which top-level area (Care / Plan / Multiply / Settings)
-- they open. This is COARSE telemetry by design — never per-click, never the
-- content a user views.
--
-- This migration introduces:
--   * One new table: usage_events (append-only, keyed by the acting profile).
--   * One SECURITY DEFINER RPC: log_usage_event(p_event_type, p_area).
--
-- The toggle, enforced server-side. The RPC reads the `usage_tracking` flag out
-- of the Super-Admin platform_config row on every call and records NOTHING when
-- it is off (the default). That is the guarantee behind "anything after the
-- toggle is off is not monitored": it holds regardless of what the client glue
-- does, because the only write path is this function and it gates on the live
-- flag value.
--
-- Privacy parity with the audit trail (lib/admin/audit-summary.ts): usage rows
-- carry structural facts only — an event type and a bounded area slug — never a
-- free-text field. The RPC rejects anything that is not a recognised event type
-- or a lowercase slug, so the table can only ever hold what the console renders.
--
-- Architecture parity with the SAC.1 platform-config write:
--   * The function is the security boundary. There are no INSERT policies — the
--     SECURITY DEFINER surface is the only write path.
--   * usage_events is gated by a Super-Admin-only SELECT policy, so the Ministry
--     Admin never sees it and the panel it backs.
--   * Unlike the audited admin writes, this RPC does NOT write an audit_events
--     row: it is high-frequency telemetry, and auditing each call would both
--     drown the audit log and (since audit_events is ministry_admin-readable)
--     leak Super-Admin-only usage data across the platform_config boundary.
--
-- Trust model (deliberate). EXECUTE is granted to `authenticated` because the
-- only writers are the app's own login action and the area-view beacon, and
-- both run with the signed-in user's RLS-scoped client — there is no service-
-- role identity in the Next runtime to call this instead. The function forces
-- `actor_profile_id = auth_profile_id()`, so a caller can ONLY ever record
-- events attributed to THEMSELVES: cross-user forgery is impossible, the table
-- is Super-Admin-read-only, and there is no privilege escalation or data
-- exposure. The residual surface is therefore only that a signed-in user could
-- call the RPC directly and pollute their OWN coarse telemetry — an extra
-- `login`, or an area they didn't actually open. That is ACCEPTED by design:
-- usage_events is best-effort, self-attributed usage insight for a small set of
-- trusted internal users, not an integrity or security boundary. Harden later
-- (allowlist areas, dedupe, or role-aware area validation) only if the user
-- base stops being trusted.

-- ===========================================================================
-- 1. usage_events table — append-only coarse telemetry
-- ===========================================================================

create table if not exists public.usage_events (
  id               uuid primary key default gen_random_uuid(),
  -- on delete set null: a permanently-deleted profile must never be blocked by
  -- its telemetry, and a null actor renders as "Unknown" — the same fallback
  -- the audit trail uses. Telemetry attribution is not worth a RESTRICT here.
  actor_profile_id uuid references public.profiles(id) on delete set null,
  event_type       text not null,
  area             text,
  created_at       timestamptz not null default now()
);

-- Recency-first read (the console lists the newest events) and per-actor lookup.
create index if not exists idx_usage_events_created_at
  on public.usage_events (created_at desc);
create index if not exists idx_usage_events_actor_created
  on public.usage_events (actor_profile_id, created_at desc);

comment on table public.usage_events is
  'Phase USAGE.1: coarse usage telemetry (logins + top-level area views), written ONLY when the Super-Admin usage_tracking feature flag is on. Super-Admin-only SELECT; writes only via log_usage_event. Structural facts only — never free text.';

-- RLS: Super-Admin-only SELECT. Postgres evaluates table-level grants BEFORE
-- policies, so the explicit `grant select ... to authenticated` is required for
-- the super admin to read at all; the policy then narrows that grant to
-- super_admin sessions only. No INSERT/UPDATE/DELETE policies — all writes flow
-- through the SECURITY DEFINER RPC below.
alter table public.usage_events enable row level security;

drop policy if exists usage_events_super_admin_read on public.usage_events;
create policy usage_events_super_admin_read on public.usage_events
  for select to authenticated using (public.auth_role() = 'super_admin');

revoke all    on public.usage_events from public;
revoke all    on public.usage_events from anon;
revoke all    on public.usage_events from authenticated;
grant  select on public.usage_events to authenticated;

-- ===========================================================================
-- 2. RPC: log_usage_event
-- ===========================================================================

create or replace function public.log_usage_event(
  p_event_type text,
  p_area text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor   uuid;
  v_enabled boolean;
  v_area    text;
  v_row_id  uuid;
begin
  -- Resolve the actor server-side. No active profile (anonymous, or signed in
  -- but without a profile) means there is nothing to attribute, so this is a
  -- silent no-op rather than an error: a telemetry write must never break the
  -- surface that fired it.
  v_actor := public.auth_profile_id();
  if v_actor is null then
    return null;
  end if;

  -- The toggle, enforced server-side. Read the usage_tracking flag straight
  -- from the Super-Admin platform_config row (the definer can read it even
  -- though the calling role cannot). Only `enabled = true` records anything.
  select coalesce(
           (setting_value -> 'feature_flags' -> 'usage_tracking' ->> 'enabled')::boolean,
           false
         )
    into v_enabled
    from public.platform_config
   where setting_key = 'platform_config';

  if v_enabled is not true then
    return null;
  end if;

  -- Validate the event type. Unknown types are rejected so the table can only
  -- ever hold the coarse events the console knows how to render.
  if p_event_type not in ('login', 'area_view') then
    raise exception 'invalid_input';
  end if;

  -- The area is a bounded lowercase slug for an area_view, and null for a login.
  -- Bounding it (never free text) keeps usage telemetry to structural facts
  -- only, matching the audit-trail privacy invariant.
  if p_event_type = 'area_view' then
    if p_area is null or p_area !~ '^[a-z][a-z-]{0,31}$' then
      raise exception 'invalid_input';
    end if;
    v_area := p_area;
  else
    v_area := null;
  end if;

  insert into public.usage_events (actor_profile_id, event_type, area)
  values (v_actor, p_event_type, v_area)
  returning id into v_row_id;

  return v_row_id;
end;
$$;

-- ===========================================================================
-- 3. Grants. Revoke from public/anon/authenticated, then grant execute to
-- authenticated. The function body holds the (no-)gate: any authenticated
-- profile may log its OWN usage (actor forced to auth_profile_id(); no cross-
-- user forgery — see the Trust model note above), but only when the flag is on.
-- Granting execute to authenticated only makes the function callable.
-- ===========================================================================

revoke all     on function public.log_usage_event(text, text) from public;
revoke all     on function public.log_usage_event(text, text) from anon;
revoke all     on function public.log_usage_event(text, text) from authenticated;
grant  execute on function public.log_usage_event(text, text) to authenticated;

comment on function public.log_usage_event(text, text) is
  'Phase USAGE.1: append a coarse usage event (login | area_view) for the calling profile, but ONLY when the usage_tracking feature flag is enabled. No-ops (returns null) when there is no active profile or the flag is off. Validates event_type and bounds the area to a lowercase slug.';
