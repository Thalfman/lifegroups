import { ArchiveGroupButton } from "@/components/admin/forms/archive-group-button";
import { GroupCreateForm } from "@/components/admin/forms/group-create-form";
import { GroupEditForm } from "@/components/admin/forms/group-edit-form";
import { EditingSurface } from "@/components/lg/admin/editing-surface";
import { fieldLabelTextClassName } from "@/components/admin/forms/field-styles";
import type { FormDraft } from "@/lib/nav/draft-store";
import type { GroupsRow } from "@/types/database";
import type { GroupEditorState } from "./types";

export function GroupEditorDrawer({
  editor,
  defaultCapacity,
  groupTypes,
  onDirty,
  onPendingChange,
  onRequestClose,
  onSaved,
  // OPP-3b (#781) — a restored form draft to seed the open form with, when the
  // drawer was reopened by the "Manage group types" return round trip.
  draft,
  // OPP-3b — whether to offer the "Manage group types" hand-off in the form's
  // type picker. On only from the Groups list (whose return flow reopens this
  // drawer); the group detail header leaves it off (Codex P2).
  enableManageTypes = false,
  // OPP-3b — carry the setup origin through the manage round trip (Codex P2).
  fromSetup = false,
}: {
  editor: GroupEditorState | null;
  defaultCapacity: number | null;
  groupTypes: readonly string[];
  onDirty: () => void;
  onPendingChange: (pending: boolean) => void;
  onRequestClose: () => void;
  onSaved: () => void;
  draft?: FormDraft;
  enableManageTypes?: boolean;
  fromSetup?: boolean;
}) {
  const group = editor?.mode === "edit" ? editor.group : null;

  return (
    <EditingSurface
      open={editor !== null}
      onRequestClose={onRequestClose}
      eyebrow={group ? "Edit group" : "New group"}
      title={group ? group.name : "Start a Life Group"}
      description={
        group
          ? "Update this group's details. Saving affects only this group."
          : "Just a name is enough to get started — capacity, day, and shepherd can be filled in now or later."
      }
      closeLabel={group ? `Close ${group.name} editor` : "Close new group form"}
    >
      {editor?.mode === "edit" ? (
        // Keyed per group so the fields + action state reset when a different
        // group is opened, while the Dialog itself stays mounted.
        <div className="grid gap-4" key={editor.group.id}>
          <GroupEditForm
            group={editor.group}
            groupTypes={groupTypes}
            draft={draft}
            enableManageTypes={enableManageTypes}
            fromSetup={fromSetup}
            onCancel={onRequestClose}
            onDirty={onDirty}
            onPendingChange={onPendingChange}
            onSaved={onSaved}
          />
          <ArchiveSection
            group={editor.group}
            onArchived={onSaved}
            onPendingChange={onPendingChange}
          />
        </div>
      ) : editor?.mode === "create" ? (
        <GroupCreateForm
          defaultCapacity={defaultCapacity}
          groupTypes={groupTypes}
          draft={draft}
          enableManageTypes={enableManageTypes}
          fromSetup={fromSetup}
          onCancel={onRequestClose}
          onDirty={onDirty}
          onPendingChange={onPendingChange}
          onSaved={onSaved}
        />
      ) : null}
    </EditingSurface>
  );
}

// Archiving lives with editing but is deliberately set apart: it takes the
// group off the active roster (a lifecycle move), which is not the same as
// cancelling the edit above — the old inline panel conflated the two.
function ArchiveSection({
  group,
  onArchived,
  onPendingChange,
}: {
  group: GroupsRow;
  onArchived: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  return (
    <div className="grid gap-2.5 rounded-md border border-line bg-surface px-4 py-3">
      <div className="grid gap-1">
        <span className={fieldLabelTextClassName}>
          Lifecycle &middot; separate from edit
        </span>
        <span className="font-sans text-sm leading-normal text-ink2">
          Archive takes the group off the active roster. The record stays and
          you can restore it later. This is not the same as cancelling your edit
          above.
        </span>
      </div>
      <ArchiveGroupButton
        groupId={group.id}
        groupName={group.name}
        onArchived={onArchived}
        onPendingChange={onPendingChange}
      />
    </div>
  );
}
