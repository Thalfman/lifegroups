"use client";

import { useRouter } from "next/navigation";
import { EditingSurface } from "@/components/lg/admin/editing-surface";
import { useEditingDrawer } from "@/components/lg/admin/use-editing-drawer";
import { EntityActionMenu } from "@/components/admin/contextual/entity-action-menu";
import { ChangeLeaderRoleForm } from "@/components/admin/forms/change-leader-role-form";
import { ConfirmActionButton } from "@/components/admin/forms/confirm-action-button";
import { deactivateProfileConfirmMessage } from "@/components/admin/forms/deactivate-profile-button";
import { deactivateMemberConfirmMessage } from "@/components/admin/forms/deactivate-member-button";
import {
  adminDeactivateProfile,
  adminDeactivateMember,
} from "@/app/(protected)/admin/people/actions";
import type { ContextualAction } from "@/lib/admin/contextual-actions";
import type { UserRole } from "@/lib/auth/roles";

// The person detail-header action menu (#781 OPP-6) — the People-directory's
// per-person lifecycle actions, now reachable from the person's own detail page
// so reviewing someone no longer means going back to the directory row to act.
// The menu is the generic, registry-driven EntityActionMenu; the bodies resolve
// in a drawer this header owns (the action bodies need person-specific context —
// the current leader role, profile-vs-member — the shared host's {kind,id,label}
// entity doesn't carry). Every write still flows through the existing audited
// people actions (no new write path); acting refreshes the current detail tab.

export type PersonHeaderTarget = {
  kind: "profile" | "member";
  id: string;
  fullName: string;
  status: string;
  // The raw leader role when this person is a leader/co-leader, else null —
  // "Change role" is only meaningful (and only RPC-valid) for those two.
  leaderRole: "leader" | "co_leader" | null;
};

type DrawerState = { action: ContextualAction };

export function PersonDetailHeaderActions({
  person,
  viewerRole,
}: {
  person: PersonHeaderTarget;
  viewerRole: UserRole;
}) {
  const router = useRouter();
  const drawer = useEditingDrawer<DrawerState>();
  const isActive = person.status === "active";

  // Instance applicability on top of the registry's role gate: change-role only
  // for an active leader/co-leader; archive only for someone still active.
  function applicable(action: ContextualAction): boolean {
    if (action.id === "change_person_role")
      return person.leaderRole !== null && isActive;
    if (action.id === "archive_person") return isActive;
    return true;
  }

  function handleSaved() {
    drawer.markSaved();
    // The detail page is a server component; repaint the current tab so the
    // change (new role / archived status) shows without a manual reload.
    router.refresh();
  }

  const active = drawer.target?.action ?? null;

  return (
    <>
      <EntityActionMenu
        entity={{ kind: "person", id: person.id, label: person.fullName }}
        viewerRole={viewerRole}
        triggerAriaLabel={`Actions for ${person.fullName}`}
        actionFilter={applicable}
        onSelect={(action) => drawer.open({ action })}
      />
      <EditingSurface
        open={drawer.isOpen}
        onRequestClose={drawer.requestClose}
        eyebrow={person.fullName}
        title={active?.label ?? ""}
        closeLabel={active ? `Close ${active.label}` : "Close"}
      >
        {active ? (
          <PersonActionBody
            action={active}
            person={person}
            onSaved={handleSaved}
            onCancel={drawer.requestClose}
            onPendingChange={drawer.reportPending}
            onDirty={drawer.markDirty}
          />
        ) : null}
      </EditingSurface>
      {drawer.discardDialog}
    </>
  );
}

function PersonActionBody({
  action,
  person,
  onSaved,
  onCancel,
  onPendingChange,
  onDirty,
}: {
  action: ContextualAction;
  person: PersonHeaderTarget;
  onSaved: () => void;
  onCancel: () => void;
  onPendingChange: (pending: boolean) => void;
  onDirty: () => void;
}) {
  if (action.id === "change_person_role" && person.leaderRole !== null) {
    return (
      <ChangeLeaderRoleForm
        profileId={person.id}
        profileName={person.fullName}
        currentRole={person.leaderRole}
        onSaved={onSaved}
        onCancel={onCancel}
        onPendingChange={onPendingChange}
        onDirty={onDirty}
      />
    );
  }

  if (action.id === "archive_person") {
    const isProfile = person.kind === "profile";
    return (
      <div className="grid gap-3">
        <p className="m-0 font-sans text-sm text-ink2">
          {isProfile
            ? "Archiving closes this person's shepherd assignments. They can be restored later from the People directory."
            : "Archiving closes this person's active group memberships today. They can be restored later from the People directory."}
        </p>
        <ConfirmActionButton
          action={isProfile ? adminDeactivateProfile : adminDeactivateMember}
          confirmMessage={
            isProfile
              ? deactivateProfileConfirmMessage(person.fullName)
              : deactivateMemberConfirmMessage(person.fullName)
          }
          hiddenFields={[
            isProfile
              ? { name: "profile_id", value: person.id }
              : { name: "member_id", value: person.id },
          ]}
          idleLabel="Archive"
          pendingLabel="Archiving…"
          tone="terra"
          ariaLabel={`Archive ${person.fullName}`}
          onSuccess={onSaved}
          onPendingChange={onPendingChange}
        />
      </div>
    );
  }

  return null;
}
