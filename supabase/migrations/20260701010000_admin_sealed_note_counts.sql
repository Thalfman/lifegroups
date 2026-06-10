-- Sealed-note presence counts for the All Notes feed (ADR 0023).
--
-- The Care Notes / Prayer Requests RLS (#381/#382) withholds SEALED rows from
-- the oversight ladder entirely, so an admin building the aggregate Notes view
-- cannot even see that sealed notes EXIST for a leader whose transparency
-- toggle is off. ADR 0023 carves out a deliberate, bounded presence-only
-- exception: this count-only SECURITY DEFINER read tells an admin HOW MANY
-- sealed care notes / prayer requests each gating leader holds — and nothing
-- else. No bodies, no dates, no authors, no group ids ever leave the function.
--
-- "Gating leader" follows ADR 0020's two arms exactly:
--   * profile-subject rows (OS/admin notes about a leader) gate on the SUBJECT
--     -> grouped by subject_profile_id;
--   * group-subject rows (a leader's group notes) gate on the AUTHOR
--     -> grouped by author_profile_id.
-- The care_notes_one_subject XOR constraint guarantees exactly one of the two
-- is set, so coalesce(subject_profile_id, author_profile_id) IS the gating
-- leader for every row.
--
-- A row is "sealed" for the caller when BOTH:
--   * the caller is not its author (the author reads their own rows already), and
--   * the gating leader's note_transparency_grant is absent or off.
-- Ministry Admin and Super Admin see IDENTICAL counts (auth_is_admin gate, no
-- super-admin bypass) — same posture as the read policies themselves.
--
-- Read-only: no audit row (precedent: read_frozen_surface_flag,
-- admin_read_feature_flags). Idempotent: CREATE OR REPLACE + re-stated grants.

set check_function_bodies = off;

create or replace function public.admin_sealed_note_counts()
returns table (
  gating_profile_id uuid,
  sealed_care_note_count integer,
  sealed_prayer_request_count integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  return query
  with sealed as (
    select
      coalesce(n.subject_profile_id, n.author_profile_id) as gating_id,
      'care_note'::text as kind
    from public.care_notes n
    where n.author_profile_id <> v_actor
      and not exists (
        select 1
          from public.note_transparency_grants g
         where g.subject_profile_id
               = coalesce(n.subject_profile_id, n.author_profile_id)
           and g.granted
      )
    union all
    select
      coalesce(r.subject_profile_id, r.author_profile_id) as gating_id,
      'prayer_request'::text as kind
    from public.prayer_requests r
    where r.author_profile_id <> v_actor
      and not exists (
        select 1
          from public.note_transparency_grants g
         where g.subject_profile_id
               = coalesce(r.subject_profile_id, r.author_profile_id)
           and g.granted
      )
  )
  select
    s.gating_id,
    (count(*) filter (where s.kind = 'care_note'))::integer,
    (count(*) filter (where s.kind = 'prayer_request'))::integer
  from sealed s
  group by s.gating_id;
end;
$$;

-- EXECUTE lockdown: deny by default, allow authenticated; the in-body
-- auth_is_admin() gate is the real boundary.
revoke all on function public.admin_sealed_note_counts() from public, anon, authenticated;
grant execute on function public.admin_sealed_note_counts() to authenticated;

comment on function public.admin_sealed_note_counts() is
  'ADR 0023 presence-only read: per gating leader, how many care_notes / prayer_requests are SEALED to the calling admin (not their own rows, gating leader''s transparency grant off/absent). Counts only — never bodies, dates, authors, or group ids. auth_is_admin() gate; Ministry Admin and Super Admin see identical counts. No audit row (read-only).';
