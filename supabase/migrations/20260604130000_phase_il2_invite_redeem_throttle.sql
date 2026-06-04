-- Phase IL.2: DB-backed rate limit for public invite redemption.
--
-- The `redeem-invite` Edge Function is public (verify_jwt=false) because the
-- invite token is the credential. The per-IP limiter in the Next server action
-- only covers the browser flow; a direct POST to the function URL bypasses it.
-- This adds an always-on, service-role-only throttle the Edge Function calls on
-- every request, keyed on the caller's peer IP (the infra-set x-forwarded-for),
-- so a single IP can't hammer the endpoint to brute-force tokens or mass-create
-- accounts from a leaked/reusable link. It replaces the shared-secret gate
-- (which required a manually-set secret) with a mechanism that needs no config.
--
-- Idempotent (create ... if not exists / create or replace) so it can be both
-- applied directly to production and re-applied by the Supabase Git integration
-- on merge without colliding.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- (a) throttle ledger
-- ---------------------------------------------------------------------------
create table if not exists public.invite_redeem_throttle (
  id uuid primary key default gen_random_uuid(),
  throttle_key text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists invite_redeem_throttle_key_time_idx
  on public.invite_redeem_throttle (throttle_key, attempted_at);

-- Reachable only through the SECURITY DEFINER RPC below (and the service role).
-- RLS on with no policies denies anon/authenticated entirely.
alter table public.invite_redeem_throttle enable row level security;

-- ---------------------------------------------------------------------------
-- (b) check_invite_redeem_rate — sliding-window counter, service-role only.
-- ---------------------------------------------------------------------------
-- Returns true if the key is under p_limit within the trailing p_window_seconds
-- (and records the attempt), false if it is at/over the limit. Prunes the key's
-- own expired rows on each call so the ledger stays small for a low-volume app.
create or replace function public.check_invite_redeem_rate(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_jwt_role text;
  v_count integer;
  v_window interval;
begin
  -- Service-role-only gate (the Edge Function uses the service-role key).
  v_jwt_role := current_setting('request.jwt.claims', true)::jsonb ->> 'role';
  if v_jwt_role is distinct from 'service_role' then
    raise exception 'edge_function_only';
  end if;

  -- No key to throttle on (caller couldn't determine a peer IP): allow rather
  -- than collapse every keyless caller into one shared bucket.
  if p_key is null or btrim(p_key) = '' then
    return true;
  end if;
  if coalesce(p_limit, 0) <= 0 or coalesce(p_window_seconds, 0) <= 0 then
    raise exception 'invalid_input';
  end if;

  v_window := make_interval(secs => p_window_seconds);

  -- Housekeeping: drop this key's rows older than the window.
  delete from public.invite_redeem_throttle
   where throttle_key = p_key
     and attempted_at < now() - v_window;

  select count(*) into v_count
    from public.invite_redeem_throttle
   where throttle_key = p_key
     and attempted_at >= now() - v_window;

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.invite_redeem_throttle (throttle_key) values (p_key);
  return true;
end;
$$;

revoke all     on function public.check_invite_redeem_rate(text, integer, integer) from public;
revoke all     on function public.check_invite_redeem_rate(text, integer, integer) from anon;
revoke all     on function public.check_invite_redeem_rate(text, integer, integer) from authenticated;
grant  execute on function public.check_invite_redeem_rate(text, integer, integer) to service_role;

comment on function public.check_invite_redeem_rate(text, integer, integer) is
  'Phase IL.2 service-role-only sliding-window rate check for public invite redemption (functions/redeem-invite). Returns false when the key is at/over the limit in the window; records the attempt otherwise.';
