"use client";

import { useEditingDrawer } from "@/components/lg/admin/use-editing-drawer";
import { GroupActionsMenu } from "@/components/admin/groups/group-actions-menu";
import { GroupEditorDrawer } from "@/components/admin/groups/group-editor-drawer";
import type { GroupEditorState } from "@/components/admin/groups/types";
import type { GroupsRow } from "@/types/database";

// The group-detail header action menu (#776 Phase 1, OPP-2). Reviewing a group
// on its detail page, an admin can Edit (drawer), Archive (inside the edit
// drawer's lifecycle section) / Restore, and — for super admins — Delete,
// without going back to the list to find the row. It reuses the SAME
// GroupActionsMenu + GroupEditorDrawer the list shell uses (no new write path);
// only the drawer state is owned locally, via the shared useEditingDrawer hook.
//
// Acting keeps the user on the same detail tab: the menu/drawer are in-page, so
// the URL (and its `?tab=`) never changes, and onSaved → router.refresh()
// repaints the current tab with the change.
export function GroupDetailHeaderActions({
  group,
  groupTypes,
  defaultCapacity,
  isSuperAdmin,
}: {
  group: GroupsRow;
  groupTypes: readonly string[];
  defaultCapacity: number | null;
  isSuperAdmin: boolean;
}) {
  const drawer = useEditingDrawer<GroupEditorState>();

  return (
    <>
      <GroupActionsMenu
        group={group}
        groupLabel={group.name}
        isArchived={group.lifecycle_status !== "active"}
        isSuperAdmin={isSuperAdmin}
        onEdit={(g) => drawer.open({ mode: "edit", group: g })}
      />
      <GroupEditorDrawer
        editor={drawer.target}
        defaultCapacity={defaultCapacity}
        groupTypes={groupTypes}
        onDirty={drawer.markDirty}
        onPendingChange={drawer.reportPending}
        onRequestClose={drawer.requestClose}
        onSaved={drawer.markSaved}
      />
      {drawer.discardDialog}
    </>
  );
}
