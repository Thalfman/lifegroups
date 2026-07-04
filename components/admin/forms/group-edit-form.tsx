"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { adminUpdateGroup } from "@/app/(protected)/admin/groups/actions";
import { cn } from "@/lib/utils";
import { fieldInputClassName, formGridClassName } from "./field-styles";
import { FormField } from "./form-field";
import {
  CapacityField,
  MeetingDayTimeFields,
  MeetingFrequencyParityFields,
} from "./meeting-schedule-fields";
import type { GroupsRow } from "@/types/database";
import type { MeetingFrequency } from "@/types/enums";
import { GroupTypePicker } from "./group-type-picker";
import type { FormDraft } from "@/lib/nav/draft-store";
import { useActionForm, FormStatus } from "./action-form";

function isoTimeForInput(value: string | null): string {
  if (!value) return "";
  // Postgres `time` round-trips as either `HH:mm` or `HH:mm:ss`. The
  // <input type="time"> control wants `HH:mm`, so trim seconds.
  const match = /^(\d{2}):(\d{2})/.exec(value);
  return match ? `${match[1]}:${match[2]}` : "";
}

export function GroupEditForm({
  group,
  // The form always lives inside the EditingSurface drawer (#266), which
  // supplies the chrome, so it reports save/dirty/pending back to the drawer
  // rather than framing itself: `onSaved` lets the drawer close + refresh,
  // `onDirty` lets it warn before discarding unsaved edits, `onCancel` renders
  // a Cancel control that dismisses it, and `onPendingChange` lets it block
  // dismissal while the save is in flight.
  onCancel,
  onSaved,
  onDirty,
  onPendingChange,
  // The admin-managed free-text group-type list (see create form).
  groupTypes = [],
  // OPP-3b (#781) — a restored draft from the "Manage group types" round trip.
  // When present, each field seeds from it instead of the stored group value, so
  // an in-progress edit survives the hop to Settings and back.
  draft,
  // OPP-3b — offer the "Manage group types" hand-off only from the Groups list
  // drawer (off by default). The detail header reuses this form but its return
  // target is the list, not the detail tab, so it leaves the affordance off
  // (Codex P2).
  enableManageTypes = false,
  // OPP-3b — carry the setup origin through the manage round trip (Codex P2).
  fromSetup = false,
}: {
  group: GroupsRow;
  onCancel?: () => void;
  onSaved?: () => void;
  onDirty?: () => void;
  onPendingChange?: (pending: boolean) => void;
  groupTypes?: readonly string[];
  draft?: FormDraft;
  enableManageTypes?: boolean;
  fromSetup?: boolean;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminUpdateGroup
  );
  const [frequency, setFrequency] = useState<MeetingFrequency>(
    (draft?.meeting_frequency as MeetingFrequency) ?? group.meeting_frequency
  );

  // Notify the drawer once the update lands so it can close and refresh the
  // list. `onSaved` is memoized by the caller, so this fires once per save.
  useEffect(() => {
    if (state?.ok) onSaved?.();
  }, [state, onSaved]);

  // Mirror the in-flight state up so the drawer can keep itself open until the
  // write resolves (otherwise dismissing mid-save would drop the refresh).
  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  const idFor = (field: string) => `edit-${field}-${group.id}`;

  // The group's stored type may no longer be in the admin-managed list (it was
  // removed, or this group was typed via free text). Keep it as a selectable
  // (and pre-selected) option so saving an unrelated edit can't silently clear
  // it; the update RPC round-trips the unchanged value cleanly. A restored draft
  // (#781 OPP-3b) takes precedence over the stored type.
  const currentType = draft?.group_type ?? group.group_type ?? "";

  return (
    <form action={formAction} onChange={onDirty} className="grid gap-3">
      <input type="hidden" name="group_id" value={group.id} />
      <div className={formGridClassName}>
        <FormField htmlFor={idFor("name")} label="Group name">
          <input
            id={idFor("name")}
            name="name"
            type="text"
            required
            defaultValue={draft?.name ?? group.name}
            className={fieldInputClassName}
          />
        </FormField>
        <MeetingDayTimeFields
          idFor={idFor}
          dayDefault={draft?.meeting_day ?? group.meeting_day ?? ""}
          timeDefault={
            draft?.meeting_time ?? isoTimeForInput(group.meeting_time)
          }
        />
        <MeetingFrequencyParityFields
          idFor={idFor}
          frequency={frequency}
          onFrequencyChange={setFrequency}
          parityDefault={
            draft?.meeting_week_parity ?? group.meeting_week_parity ?? ""
          }
        />
        <FormField htmlFor={idFor("location_area")} label="Location area">
          <input
            id={idFor("location_area")}
            name="location_area"
            type="text"
            defaultValue={draft?.location_area ?? group.location_area ?? ""}
            className={fieldInputClassName}
            placeholder="Westside"
          />
        </FormField>
        <FormField
          htmlFor={idFor("address_optional")}
          label="Address"
          className="md:col-span-full"
        >
          <input
            id={idFor("address_optional")}
            name="address_optional"
            type="text"
            defaultValue={
              draft?.address_optional ?? group.address_optional ?? ""
            }
            className={fieldInputClassName}
          />
        </FormField>
        <CapacityField
          id={idFor("capacity")}
          label="Capacity"
          asNumber
          defaultValue={draft?.capacity ?? group.capacity ?? ""}
          placeholder="12"
        />
        <div>
          {/* #776 OPP-3 — the creatable group-type picker. `initialValue`
              preselects the group's current type and keeps it selectable even
              if it has since been removed from the admin list (replacing the
              old hand-rolled "(not in current list)" option), and lets the admin
              add a brand-new type in place via the audited add-type RPC. */}
          <GroupTypePicker
            groupTypes={groupTypes}
            name="group_type"
            id={`edit-group_type-${group.id}`}
            label="Group type"
            initialValue={currentType}
            enableManageTypes={enableManageTypes}
            manageDisabled={pending}
            fromSetup={fromSetup}
          />
        </div>
        <FormField htmlFor={idFor("launched_on")} label="Launched on">
          <input
            id={idFor("launched_on")}
            name="launched_on"
            type="date"
            defaultValue={draft?.launched_on ?? group.launched_on ?? ""}
            className={fieldInputClassName}
          />
        </FormField>
        <FormField
          htmlFor={idFor("description")}
          label="Description"
          className="md:col-span-full"
        >
          <textarea
            id={idFor("description")}
            name="description"
            rows={3}
            defaultValue={draft?.description ?? group.description ?? ""}
            className={cn(fieldInputClassName, "min-h-20 resize-y")}
          />
        </FormField>
      </div>

      <div className="mt-0.5 flex flex-wrap items-center gap-2.5 border-t border-line pt-2.5">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </Button>
        ) : null}
      </div>

      <FormStatus state={state} successText="Group updated." />
    </form>
  );
}
