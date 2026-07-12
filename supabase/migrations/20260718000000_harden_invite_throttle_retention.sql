-- SEC-2: store only versioned HMAC identifiers in the public invite throttle.
--
-- Legacy rows may contain literal client IPs, so they are intentionally
-- discarded. The ledger is ephemeral abuse-control state, not an audit trail.
-- Rotating RATE_LIMIT_HMAC_SECRET intentionally starts fresh limiter history.

delete from public.invite_redeem_throttle;

alter table public.invite_redeem_throttle
  add constraint invite_redeem_throttle_key_hmac_check
  check (throttle_key ~ '^ip:v1:[0-9a-f]{64}$');

-- The original (throttle_key, attempted_at) index serves per-key counts. This
-- second index supports global expiry without scanning every historical key.
create index if not exists invite_redeem_throttle_attempted_at_idx
  on public.invite_redeem_throttle (attempted_at);

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
  v_jwt_role := current_setting('request.jwt.claims', true)::jsonb ->> 'role';
  if v_jwt_role is distinct from 'service_role' then
    raise exception 'edge_function_only';
  end if;

  -- Defense in depth: even a future Edge Function regression cannot put a raw
  -- IP back into this table. v1 is HMAC-SHA256 rendered as 64 lowercase hex.
  if p_key is null or p_key !~ '^ip:v1:[0-9a-f]{64}$' then
    raise exception 'invalid_throttle_key';
  end if;
  if coalesce(p_limit, 0) <= 0 or coalesce(p_window_seconds, 0) <= 0 then
    raise exception 'invalid_input';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('invite_redeem_throttle'),
    hashtext(p_key)
  );

  v_window := make_interval(secs => p_window_seconds);

  -- Global expiry is deliberate. The previous implementation only pruned when
  -- the same key returned, leaving one-off client identifiers indefinitely.
  delete from public.invite_redeem_throttle
   where attempted_at < now() - v_window;

  select count(*) into v_count
    from public.invite_redeem_throttle
   where throttle_key = p_key
     and attempted_at >= now() - v_window;

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.invite_redeem_throttle (throttle_key)
  values (p_key);
  return true;
end;
$$;

revoke all on function public.check_invite_redeem_rate(text, integer, integer)
  from public;
revoke all on function public.check_invite_redeem_rate(text, integer, integer)
  from anon;
revoke all on function public.check_invite_redeem_rate(text, integer, integer)
  from authenticated;
grant execute on function public.check_invite_redeem_rate(text, integer, integer)
  to service_role;

comment on column public.invite_redeem_throttle.throttle_key is
  'Versioned HMAC-SHA256 client-IP identifier (ip:v1:<hex>); never a raw IP. Ephemeral abuse-control state.';

comment on function public.check_invite_redeem_rate(text, integer, integer) is
  'Service-role-only invite redemption throttle. Accepts only ip:v1 HMAC identifiers, globally expires rows outside the requested window, and records an allowed attempt.';
