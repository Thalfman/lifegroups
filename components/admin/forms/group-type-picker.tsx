"use client";

import { useRouter } from "next/navigation";
import { adminAddGroupType } from "@/app/(protected)/admin/plan/actions";
import { CreatablePicker } from "@/components/admin/forms/creatable-picker";
import { newDraftId, saveFormDraft, snapshotForm } from "@/lib/nav/draft-store";
import { decorateReturn, DRAFT_PARAM } from "@/lib/nav/return-to";

// Picker for a free-text group type (#747), now a thin specialization of the
// shared CreatablePicker (#776 Phase 0): the existing-types dropdown plus a
// "＋ Add new type…" affordance that appends to the canonical group_types list
// via the idempotent admin_add_group_type RPC and selects it.

export function GroupTypePicker({
  groupTypes = [],
  name = "desired_group_type",
  id = "prospect-desired_group_type",
  label = "Desired group type (optional)",
  initialValue,
  enableManageTypes = false,
}: {
  groupTypes?: readonly string[];
  name?: string;
  id?: string;
  label?: string;
  // The group's current type (the edit form), preselected and kept selectable
  // even if it's no longer in the admin list. The prospect/create forms omit it.
  initialValue?: string;
  // OPP-3b (#781) — when set (the group create/edit forms), render a "Manage
  // group types" affordance that hands off to the Settings list editor and
  // returns to this exact form with every field restored. The prospect form
  // leaves it off (its return flow isn't wired), so adding a type stays inline.
  enableManageTypes?: boolean;
}) {
  return (
    <div className="grid gap-1">
      <CreatablePicker
        options={groupTypes}
        name={name}
        id={id}
        label={label}
        initialValue={initialValue}
        addOptionLabel="＋ Add new type…"
        newItemLabel="New group type"
        placeholder="e.g. Young Families"
        addHint="Adds the type to the shared list so it's available everywhere."
        emptyError="Enter a group type."
        onCreate={async (value) => {
          const formData = new FormData();
          formData.set("group_type", value);
          const result = await adminAddGroupType(undefined, formData);
          return result.ok
            ? { ok: true }
            : {
                ok: false,
                error: result.errors[0] ?? "Couldn't add that type. Try again.",
              };
        }}
      />
      {/* The router is only needed for the manage hand-off, so it lives in a
          child rendered solely when enabled — consumers that don't opt in (the
          prospect form) need no App Router context. */}
      {enableManageTypes ? <ManageGroupTypesLink /> : null}
    </div>
  );
}

// The "Manage group types" hand-off (#781 OPP-3b): snapshot the half-filled form
// to sessionStorage, then route to the audited Settings group-types editor
// carrying the draft id + the `groups` return marker. On save (or cancel) the
// Settings banner returns the user to the Groups list, which reopens this drawer
// and restores the draft — no inline global-config editing; list management
// stays on its real page (plan §3a).
function ManageGroupTypesLink() {
  const router = useRouter();
  function manageTypes(event: React.MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.closest("form");
    if (!form) return;
    const draftId = newDraftId();
    saveFormDraft(draftId, snapshotForm(form));
    router.push(
      decorateReturn(
        `/admin/settings?tab=groups&${DRAFT_PARAM}=${draftId}`,
        "groups"
      )
    );
  }
  return (
    <button
      type="button"
      onClick={manageTypes}
      className="cursor-pointer justify-self-start border-none bg-transparent p-0 font-sans text-xs text-ink2 underline hover:text-ink"
    >
      Manage group types
    </button>
  );
}
