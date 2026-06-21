import { LinkButton } from "@/components/ui/button";
import { decorateReturn } from "@/lib/nav/return-to";

// "Edit rubric" — the outbound half of the OPP-8 redirect-and-return (#776
// Phase 1). From a group's health tab it links to the audited Settings
// health-rubric editor (the legitimate place to change global config), carrying
// the group id + the `from=group-health` return marker so the destination shows
// a "← Back to group health" banner and the user lands back on this exact group
// + tab, focus restored to this button (its id is the ReturnFocus target). It
// never edits global config inline — the edit happens on the Settings page.
//
// `fromSetup`: when the group itself was reached via the setup chain, carry an
// `origin_setup` marker through the round trip (#785) so the return URL can keep
// the "← Back to setup" affordance — the single `from` param already holds
// `group-health`, so the setup origin rides a separate param.
export function EditRubricLink({
  groupId,
  fromSetup = false,
}: {
  groupId: string;
  fromSetup?: boolean;
}) {
  const base = `/admin/settings?tab=care&group=${groupId}${
    fromSetup ? "&origin_setup=1" : ""
  }`;
  const href = decorateReturn(base, "group-health");
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
