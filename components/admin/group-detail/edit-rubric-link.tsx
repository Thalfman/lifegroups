import { LinkButton } from "@/components/ui/button";
import { decorateReturn } from "@/lib/nav/return-to";

// "Edit rubric" — the outbound half of the OPP-8 redirect-and-return (#776
// Phase 1). From a group's health tab it links to the audited Settings
// health-rubric editor (the legitimate place to change global config), carrying
// the group id + the `from=group-health` return marker so the destination shows
// a "← Back to group health" banner and the user lands back on this exact group
// + tab, focus restored to this button (its id is the ReturnFocus target). It
// never edits global config inline — the edit happens on the Settings page.
export function EditRubricLink({ groupId }: { groupId: string }) {
  const href = decorateReturn(
    `/admin/settings?tab=care&group=${groupId}`,
    "group-health"
  );
  return (
    <LinkButton
      id="edit-rubric-button"
      href={href}
      variant="ghost"
      size="sm"
      aria-label="Edit the Group-Health rubric in Settings"
    >
      Edit rubric
    </LinkButton>
  );
}
