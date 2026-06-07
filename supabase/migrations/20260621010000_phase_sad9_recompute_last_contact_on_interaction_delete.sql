-- ADR 0014 (SAD9 follow-up, PR #426 review): keep
-- shepherd_care_profiles.last_contact_at honest when a care interaction is
-- permanently deleted.
--
-- last_contact_at is a high-water-mark date advanced by
-- admin_log_shepherd_care_interaction via greatest(...). SAD9 registered
-- shepherd_care_interaction as a super-admin permanent-deletion target, and the
-- generic delete engine removes the row with a blind `delete ... where id = $1`
-- and no per-entity hook. Deleting the interaction that set the high-water mark
-- would otherwise leave last_contact_at pointing at a contact that no longer
-- exists, and the care dashboard's "needs contact" logic would keep treating the
-- leader as recently contacted — hiding a leader who actually needs outreach.
--
-- This AFTER DELETE trigger recomputes last_contact_at from the SURVIVING
-- admin-logged contacts for the affected care profile (null when none remain), so
-- the derived clock always reflects rows that still exist — regardless of the
-- delete path (the permanent-delete engine today, or any future path). SECURITY
-- DEFINER with a pinned search_path so it can update shepherd_care_profiles no
-- matter who fired it; EXECUTE is checked at trigger-creation, not at fire time,
-- so the revokes below lock out direct calls without stopping the trigger.
--
-- Over-shepherd broad notes share this table but deliberately never ADVANCE
-- last_contact_at on insert (#123/#126), and carry no row-level discriminator —
-- admin contact can be any interaction_type, including 'other'. They are instead
-- identified by their immutable audit_events row (action
-- 'over_shepherd.log_broad_note'), which outlives the interaction, so the
-- recompute excludes them too and counts only real admin contacts — matching the
-- high-water-mark semantics exactly, never promoting a broad note to "contact".
--
-- Known, accepted limitation: the symmetric restore path (re-importing a
-- tombstoned interaction) is NOT re-advanced here — this trigger fires on delete
-- only. That is rare (delete-then-restore) and fails safe: it leaves a leader
-- flagged as needing contact rather than hiding one who does. Making restore
-- exact would need a row-level discriminator column; deferred deliberately.

set check_function_bodies = off;

create or replace function public.shepherd_care_recompute_last_contact_on_interaction_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Recompute the high-water mark from the surviving ADMIN-LOGGED contacts only.
  -- Broad notes (audit action 'over_shepherd.log_broad_note') never advanced the
  -- clock on insert, so they are excluded here too.
  update public.shepherd_care_profiles p
     set last_contact_at = (
           select max(i.interaction_at)
             from public.shepherd_care_interactions i
            where i.care_profile_id = old.care_profile_id
              and not exists (
                    select 1
                      from public.audit_events ae
                     where ae.entity_type = 'shepherd_care_interactions'
                       and ae.entity_id = i.id
                       and ae.action = 'over_shepherd.log_broad_note'
                  )
         )
   where p.id = old.care_profile_id;
  return old;
end;
$$;

revoke all on function public.shepherd_care_recompute_last_contact_on_interaction_delete() from public;
revoke all on function public.shepherd_care_recompute_last_contact_on_interaction_delete() from anon;
revoke all on function public.shepherd_care_recompute_last_contact_on_interaction_delete() from authenticated;

comment on function public.shepherd_care_recompute_last_contact_on_interaction_delete() is
  'ADR 0014 (SAD9 follow-up): AFTER DELETE on shepherd_care_interactions — recomputes shepherd_care_profiles.last_contact_at to max(interaction_at) of the surviving interactions (null when none), so a permanent delete of the most-recent contact does not leave the care dashboard treating the leader as recently contacted.';

drop trigger if exists shepherd_care_interactions_recompute_last_contact
  on public.shepherd_care_interactions;
create trigger shepherd_care_interactions_recompute_last_contact
  after delete on public.shepherd_care_interactions
  for each row
  execute function public.shepherd_care_recompute_last_contact_on_interaction_delete();
