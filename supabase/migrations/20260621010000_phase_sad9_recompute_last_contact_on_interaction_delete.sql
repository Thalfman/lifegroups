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
-- interactions for the affected care profile (null when none remain), so the
-- derived clock always reflects rows that still exist — regardless of the delete
-- path (the permanent-delete engine today, or any future path). SECURITY DEFINER
-- with a pinned search_path so it can update shepherd_care_profiles no matter who
-- fired it; EXECUTE is checked at trigger-creation, not at fire time, so the
-- revokes below lock out direct calls without stopping the trigger.
--
-- Caveat (accepted): over-shepherd broad notes share this table but deliberately
-- never ADVANCE last_contact_at on insert, and are indistinguishable from admin
-- contact at the row level. The recompute uses max(interaction_at) over all
-- survivors, so in the rare case the newest survivor is a broad note the clock
-- reflects it — a small, bounded over-estimate, strictly better than pointing at
-- a deleted row, and it never advances past a real surviving interaction.

set check_function_bodies = off;

create or replace function public.shepherd_care_recompute_last_contact_on_interaction_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.shepherd_care_profiles p
     set last_contact_at = (
           select max(i.interaction_at)
             from public.shepherd_care_interactions i
            where i.care_profile_id = old.care_profile_id
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
