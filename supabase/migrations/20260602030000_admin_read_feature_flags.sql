-- Admin-readable feature-flag resolution (#256 review follow-up).
-- ===========================================================================
--
-- platform_config is a Super-Admin-only store (Phase SAC.1, #159): its SELECT
-- policy is gated to super_admin, so a ministry_admin reading the table directly
-- sees no row. That was correct for the console's editable copy + tracer note,
-- but it also means frozen-surface flags (ADR 0002 / 0009) never resolve live
-- for a ministry_admin: every frozen-surface gate (and the dashboard's deferred
-- Guests card, #256) keeps reading the surface as frozen even after a Super
-- Admin has re-enabled-and-verified it. requireAdmin() admits both super_admin
-- and ministry_admin, so the gate must resolve identically for both.
--
-- This narrow SECURITY DEFINER read returns ONLY the `feature_flags` sub-object
-- of the platform_config row to any admin (super_admin + ministry_admin, via
-- auth_is_admin()). It deliberately does NOT expose the rest of the row
-- (console_tracer_note, editable_copy) — those stay Super-Admin-only behind the
-- table's RLS. The verify-before-flip resolution stays in TypeScript
-- (lib/admin/feature-flags resolveFlag); this only widens read access to the
-- stored flag state (a map of key -> {enabled, verified} booleans, no secrets),
-- not the resolution rule. A non-admin caller gets an empty object, so callers
-- fail closed (every flag off).

create or replace function public.admin_read_feature_flags()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when public.auth_is_admin() then coalesce(
      (select setting_value -> 'feature_flags'
         from public.platform_config
        where setting_key = 'platform_config'),
      '{}'::jsonb
    )
    else '{}'::jsonb
  end;
$$;

-- Deny by default, allow authenticated. The body's auth_is_admin() gate is what
-- actually scopes the data to admins; granting execute to authenticated only
-- makes the function callable (a non-admin caller gets '{}'::jsonb back).
revoke all     on function public.admin_read_feature_flags() from public;
revoke all     on function public.admin_read_feature_flags() from anon;
revoke all     on function public.admin_read_feature_flags() from authenticated;
grant  execute on function public.admin_read_feature_flags() to authenticated;

comment on function public.admin_read_feature_flags() is
  'Admin-readable (#256): returns only the feature_flags sub-object of platform_config to super_admin + ministry_admin (auth_is_admin()), so frozen-surface flags (ADR 0002 / 0009) resolve identically for both roles. Does not expose the Super-Admin-only console copy/tracer; returns {} for non-admins.';
