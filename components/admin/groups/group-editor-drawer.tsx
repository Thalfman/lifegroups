import { ArchiveGroupButton } from "@/components/admin/forms/archive-group-button";
import { GroupCreateForm } from "@/components/admin/forms/group-create-form";
import { GroupEditForm } from "@/components/admin/forms/group-edit-form";
import { EditingSurface } from "@/components/lg/admin/editing-surface";
import { fieldLabelTextClassName } from "@/components/admin/forms/field-styles";
import type { CategoriesByAudience } from "@/components/admin/forms/group-category-options";
import type { GroupsRow } from "@/types/database";
import type { GroupEditorState } from "./types";

export function GroupEditorDrawer({
  editor,
  defaultCapacity,
  categoriesByAudience,
  onDirty,
  onPendingChange,
  onRequestClose,
  onSaved,
}: {
  editor: GroupEditorState | null;
  defaultCapacity: number | null;
  categoriesByAudience: CategoriesByAudience;
  onDirty: () => void;
  onPendingChange: (pending: boolean) => void;
  onRequestClose: () => void;
  onSaved: () => void;
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
            categoriesByAudience={categoriesByAudience}
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
          categoriesByAudience={categoriesByAudience}
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
