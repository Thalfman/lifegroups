"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { adminUpdateGroup } from "@/app/(protected)/admin/groups/actions";
import { cn } from "@/lib/utils";
import {
  fieldHintClassName,
  fieldInputClassName,
  fieldLabelClassName,
  fieldSelectClassName,
  formGridClassName,
} from "./field-styles";
import {
  MEETING_DAYS_ORDERED,
  MEETING_FREQUENCY_OPTIONS,
  MEETING_PARITY_OPTIONS,
} from "./meeting-schedule-options";
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

  const showParity = frequency === "biweekly";

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
        <div>
          <label
            htmlFor={`edit-name-${group.id}`}
            className={fieldLabelClassName}
          >
            Group name
          </label>
          <input
            id={`edit-name-${group.id}`}
            name="name"
            type="text"
            required
            defaultValue={draft?.name ?? group.name}
            className={fieldInputClassName}
          />
        </div>
        <div>
          <label
            htmlFor={`edit-meeting_day-${group.id}`}
            className={fieldLabelClassName}
          >
            Meeting day
          </label>
          <select
            id={`edit-meeting_day-${group.id}`}
            name="meeting_day"
            defaultValue={draft?.meeting_day ?? group.meeting_day ?? ""}
            className={fieldSelectClassName}
          >
            <option value="">Not set</option>
            {MEETING_DAYS_ORDERED.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor={`edit-meeting_time-${group.id}`}
            className={fieldLabelClassName}
          >
            Meeting time
          </label>
          <input
            id={`edit-meeting_time-${group.id}`}
            name="meeting_time"
            type="time"
            defaultValue={
              draft?.meeting_time ?? isoTimeForInput(group.meeting_time)
            }
            className={fieldInputClassName}
          />
        </div>
        <div>
          <label
            htmlFor={`edit-meeting_frequency-${group.id}`}
            className={fieldLabelClassName}
          >
            Meeting frequency
          </label>
          <select
            id={`edit-meeting_frequency-${group.id}`}
            name="meeting_frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as MeetingFrequency)}
            className={fieldSelectClassName}
          >
            {MEETING_FREQUENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        {showParity ? (
          <div>
            <label
              htmlFor={`edit-meeting_week_parity-${group.id}`}
              className={fieldLabelClassName}
            >
              Which weeks does it meet?
            </label>
            <select
              id={`edit-meeting_week_parity-${group.id}`}
              name="meeting_week_parity"
              defaultValue={
                draft?.meeting_week_parity ?? group.meeting_week_parity ?? ""
              }
              className={fieldSelectClassName}
            >
              <option value="">Choose weeks</option>
              {MEETING_PARITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className={fieldHintClassName}>
              For groups that meet every other week. Odd and even weeks
              alternate through the year — pick the set this group gathers on.
            </p>
          </div>
        ) : null}
        <div>
          <label
            htmlFor={`edit-location_area-${group.id}`}
            className={fieldLabelClassName}
          >
            Location area
          </label>
          <input
            id={`edit-location_area-${group.id}`}
            name="location_area"
            type="text"
            defaultValue={draft?.location_area ?? group.location_area ?? ""}
            className={fieldInputClassName}
            placeholder="Westside"
          />
        </div>
        <div className="md:col-span-full">
          <label
            htmlFor={`edit-address_optional-${group.id}`}
            className={fieldLabelClassName}
          >
            Address
          </label>
          <input
            id={`edit-address_optional-${group.id}`}
            name="address_optional"
            type="text"
            defaultValue={
              draft?.address_optional ?? group.address_optional ?? ""
            }
            className={fieldInputClassName}
          />
        </div>
        <div>
          <label
            htmlFor={`edit-capacity-${group.id}`}
            className={fieldLabelClassName}
          >
            Capacity
          </label>
          <input
            id={`edit-capacity-${group.id}`}
            name="capacity"
            type="number"
            min={0}
            max={1000}
            inputMode="numeric"
            defaultValue={draft?.capacity ?? group.capacity ?? ""}
            className={fieldInputClassName}
            placeholder="12"
          />
        </div>
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
        <div>
          <label
            htmlFor={`edit-launched_on-${group.id}`}
            className={fieldLabelClassName}
          >
            Launched on
          </label>
          <input
            id={`edit-launched_on-${group.id}`}
            name="launched_on"
            type="date"
            defaultValue={draft?.launched_on ?? group.launched_on ?? ""}
            className={fieldInputClassName}
          />
        </div>
        <div className="md:col-span-full">
          <label
            htmlFor={`edit-description-${group.id}`}
            className={fieldLabelClassName}
          >
            Description
          </label>
          <textarea
            id={`edit-description-${group.id}`}
            name="description"
            rows={3}
            defaultValue={draft?.description ?? group.description ?? ""}
            className={cn(fieldInputClassName, "min-h-20 resize-y")}
          />
        </div>
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
