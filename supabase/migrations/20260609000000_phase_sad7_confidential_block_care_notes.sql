-- ADR 0014 (#388): seal author-private Care Notes / Prayer Requests in the
-- permanent-delete preflight — treat them opaquely, never leak their count.
--
-- Follow-up to #382 / PR #387 (Codex P1, deferred by decision). The super-admin
-- permanent-delete preflight (super_admin_permanent_delete_preflight ->
-- super_admin_collect_dependents -> the danger-zone UI) walks every inbound FK
-- and lists each dependent as `table.column (action) + count`. Author-private
-- Care Notes / Prayer Requests (#381 / #382, ADR 0017 / ADR 0020) are
-- sealed-by-default (visible only to the author, or to the oversight ladder when
-- that leader's transparency toggle is on). But because their subject/author FKs
-- are `on delete cascade` / `on delete restrict`, super_admin_collect_dependents
-- buckets them as BLOCKERS — so the preflight reported their count/existence to
-- the Super Admin regardless of the toggle:
--
--   * Profile target (#381): care_notes.subject_profile_id /
--     prayer_requests.subject_profile_id (OS notes ABOUT that leader), and
--     care_notes.author_profile_id / prayer_requests.author_profile_id (notes
--     that person WROTE).
--   * Group target (#382): care_notes.subject_group_id /
--     prayer_requests.subject_group_id (the leader's group notes).
--
-- Only the count + existence leaked — never the body (RLS still seals content),
-- super-admin-only, only in the destructive-op preview. RLS forbids no delete
-- RPC for these notes today, so the cascade/restrict FKs already make any such
-- target undeletable (has_blocking_dependents) — this change does NOT alter
-- deletability, it only swaps a count-leaking block for the OPAQUE confidential
-- block already used for the SC.4 Private Care Note (whole delete reported
-- `confidential: true`, no per-table counts). Chosen over suppressing the count
-- while allowing the delete, because that would let the `on delete cascade` fire
-- and silently destroy author-private pastoral content the tombstone (which
-- snapshots only set-null dependents) could never recover. See ADR 0014.
--
-- This slice extends super_admin_confidential_block() via create-or-replace; the
-- engine + preflight already route every target through it and short-circuit
-- BEFORE super_admin_collect_dependents runs, so both profile and group targets
-- are covered with no other function touched. Existence checks only — no note
-- body is ever read.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- super_admin_confidential_block(entity_type, id) — extend the opaque block.
-- Keeps the SC.4 arm (shepherd_care_private_notes via the care profile) and adds
-- the author-private Care Note / Prayer Request arms:
--   * profile -> the target is the SUBJECT of, or the AUTHOR of, any care_notes
--     / prayer_requests row.
--   * group   -> the target is the SUBJECT (subject_group_id) of any care_notes
--     / prayer_requests row.
-- Existence-only; the engine/preflight report it opaquely (no table/count/key
-- metadata). Internal helper — runs inside the SECURITY DEFINER engine, so the
-- existence checks read past RLS without a content read.
-- ---------------------------------------------------------------------------
create or replace function public.super_admin_confidential_block(
  p_entity_type text,
  p_id uuid
)
returns boolean
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if p_entity_type = 'profile' then
    return
      -- SC.4 Private Care Note (ADR 0002/0003) — unchanged from #314.
      exists (
        select 1
          from public.shepherd_care_private_notes n
          join public.shepherd_care_profiles cp on cp.id = n.care_profile_id
         where cp.shepherd_profile_id = p_id
      )
      -- #388: author-private Care Notes ABOUT or BY this person (ADR 0017/0020).
      or exists (
        select 1 from public.care_notes
         where subject_profile_id = p_id
            or author_profile_id = p_id
      )
      or exists (
        select 1 from public.prayer_requests
         where subject_profile_id = p_id
            or author_profile_id = p_id
      );
  end if;

  if p_entity_type = 'group' then
    -- #388: a leader's author-private group notes (ADR 0020).
    return
      exists (select 1 from public.care_notes where subject_group_id = p_id)
      or exists (
        select 1 from public.prayer_requests where subject_group_id = p_id
      );
  end if;

  return false;
end;
$$;

revoke all on function public.super_admin_confidential_block(text, uuid) from public;
revoke all on function public.super_admin_confidential_block(text, uuid) from anon;
revoke all on function public.super_admin_confidential_block(text, uuid) from authenticated;

comment on function public.super_admin_confidential_block(text, uuid) is
  'ADR 0014 (#313/#314/#388): opaque permanent-blocker hook. True when the target holds sealed pastoral content — SC.4 private care notes, or author-private Care Notes / Prayer Requests it is the subject or author of (profile) / subject group of (group). Reported opaquely — no count/table/key metadata. Internal helper.';
