"use client";

import { adminAddGroupType } from "@/app/(protected)/admin/plan/actions";
import { CreatablePicker } from "@/components/admin/forms/creatable-picker";

// Picker for a free-text group type (#747), now a thin specialization of the
// shared CreatablePicker (#776 Phase 0): the existing-types dropdown plus a
// "＋ Add new type…" affordance that appends to the canonical group_types list
// via the idempotent admin_add_group_type RPC and selects it.

export function GroupTypePicker({
  groupTypes = [],
  name = "desired_group_type",
  id = "prospect-desired_group_type",
  label = "Desired group type (optional)",
}: {
  groupTypes?: readonly string[];
  name?: string;
  id?: string;
  label?: string;
}) {
  return (
    <CreatablePicker
      options={groupTypes}
      name={name}
      id={id}
      label={label}
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
  );
}
