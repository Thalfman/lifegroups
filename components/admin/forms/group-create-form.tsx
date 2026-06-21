"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useValueChange } from "@/lib/hooks/use-value-change";
import { adminCreateGroup } from "@/app/(protected)/admin/groups/actions";
import { cn } from "@/lib/utils";
import {
  fieldHintClassName,
  fieldInputClassName,
  fieldLabelClassName,
  fieldSelectClassName,
  formGridClassName,
  formNoteClassName,
} from "./field-styles";
import {
  MEETING_DAYS_ORDERED,
  MEETING_FREQUENCY_OPTIONS,
  MEETING_PARITY_OPTIONS,
} from "./meeting-schedule-options";
import type { MeetingFrequency } from "@/types/enums";
import { GroupTypePicker } from "./group-type-picker";
import type { FormDraft } from "@/lib/nav/draft-store";
import { useActionForm, FormStatus } from "./action-form";

export function GroupCreateForm({
  // G3 (#222): a new group's capacity defaults to the ministry-wide
  // `default_group_capacity` instead of being left Unknown, so an operator
  // only sets a per-group number when a group differs. null = no ministry
  // default configured, in which case we leave the field blank (Unknown).
  defaultCapacity,
  // Supplied when rendered inside the EditingSurface drawer (#266): `onSaved`
  // closes + refreshes once the group is created, `onDirty` lets the drawer
  // warn before discarding entered values, `onCancel` renders a Cancel control
  // beside Create, and `onPendingChange` lets the drawer block dismissal while
  // the create is in flight.
  onSaved,
  onDirty,
  onCancel,
  onPendingChange,
  // The admin-managed free-text group-type list. The creatable picker offers
  // these plus an in-place "add new type" affordance (#776 OPP-3); leaving it at
  // "—" creates the group Untyped. Any value is accepted server-side (free text).
  groupTypes = [],
  // OPP-3b (#781) — a restored form draft from the "Manage group types" round
  // trip. When present, every field seeds from it (and More details opens) so the
  // operator lands back exactly where they left off. Absent on a fresh open.
  draft,
  // OPP-3b — whether to offer the "Manage group types" hand-off. On ONLY from the
  // Groups list drawer, whose return flow lands back on the list + reopens this
  // drawer; off from the group detail header, where the `groups` return target
  // would drop the user on the list instead of their detail tab (Codex P2).
  enableManageTypes = false,
  // OPP-3b — carry the setup origin through the manage round trip when the list
  // was reached from the setup-recovery flow (Codex P2).
  fromSetup = false,
}: {
  defaultCapacity: number | null;
  onSaved?: () => void;
  onDirty?: () => void;
  onCancel?: () => void;
  onPendingChange?: (pending: boolean) => void;
  groupTypes?: readonly string[];
  draft?: FormDraft;
  enableManageTypes?: boolean;
  fromSetup?: boolean;
}) {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    adminCreateGroup,
    { resetOnSuccess: true }
  );
  const [frequency, setFrequency] = useState<MeetingFrequency>(
    (draft?.meeting_frequency as MeetingFrequency) ?? "weekly"
  );
  // Open "More details" when restoring a draft so any restored optional field is
  // visible (and not silently hidden behind the collapsed section).
  const [showMore, setShowMore] = useState(draft != null);
  const [groupName, setGroupName] = useState(draft?.name ?? "");

  // useActionForm resets the <form> element on success; the local UI state
  // (frequency select, expanded "More details") lives in React, so reset it too.
  // Derived during render rather than in an effect to avoid the cascading-render
  // smell. In the drawer, `onSaved` then closes it — the form unmounts, so the
  // reset is moot there but harmless.
  useValueChange(state, (next) => {
    if (!next?.ok) return;
    setFrequency("weekly");
    setShowMore(false);
    setGroupName("");
  });

  // onSaved is a parent notification (drawer close + refresh), so it stays in a
  // post-commit effect.
  useEffect(() => {
    if (state?.ok) onSaved?.();
  }, [state, onSaved]);

  // Mirror the in-flight state up so the drawer keeps itself open until the
  // create resolves rather than being dismissed mid-write.
  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  const showParity = frequency === "biweekly";
  const canSubmit = groupName.trim().length > 0;

  return (
    <form
      ref={formRef}
      action={formAction}
      onChange={onDirty}
      className="grid gap-3"
    >
      <p className={formNoteClassName}>
        Create a new Life Group. Start with the name and when it meets &mdash;
        everything else can be filled in under More details, now or later as the
        group settles into a rhythm.
      </p>
      <div className={formGridClassName}>
        <div>
          <label htmlFor="group-name" className={fieldLabelClassName}>
            Group name
          </label>
          <input
            id="group-name"
            name="name"
            type="text"
            required
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            autoComplete="off"
            className={fieldInputClassName}
            placeholder="Wednesday Westside"
          />
        </div>
        <div>
          <label htmlFor="group-meeting_day" className={fieldLabelClassName}>
            Meeting day (optional)
          </label>
          <select
            id="group-meeting_day"
            name="meeting_day"
            defaultValue={draft?.meeting_day ?? ""}
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
          <label htmlFor="group-meeting_time" className={fieldLabelClassName}>
            Meeting time (optional)
          </label>
          <input
            id="group-meeting_time"
            name="meeting_time"
            type="time"
            defaultValue={draft?.meeting_time ?? ""}
            autoComplete="off"
            className={fieldInputClassName}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="cursor-pointer justify-self-start border-none bg-transparent p-0 font-sans text-sm text-ink2 underline hover:text-ink"
      >
        {showMore ? "Fewer details" : "More details"}
      </button>
      {/* Kept mounted (hidden) when collapsed so values entered under
          More details — most importantly meeting_frequency, which would
          otherwise default back to weekly on the server — still submit
          with the form rather than being silently discarded. */}
      <div className={cn(formGridClassName, !showMore && "hidden")}>
        <div>
          <label
            htmlFor="group-meeting_frequency"
            className={fieldLabelClassName}
          >
            Meeting frequency
          </label>
          <select
            id="group-meeting_frequency"
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
              htmlFor="group-meeting_week_parity"
              className={fieldLabelClassName}
            >
              Which weeks does it meet?
            </label>
            <select
              id="group-meeting_week_parity"
              name="meeting_week_parity"
              defaultValue={draft?.meeting_week_parity ?? ""}
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
          <label htmlFor="group-location_area" className={fieldLabelClassName}>
            Location area (optional)
          </label>
          <input
            id="group-location_area"
            name="location_area"
            type="text"
            defaultValue={draft?.location_area ?? ""}
            autoComplete="off"
            className={fieldInputClassName}
            placeholder="Westside"
          />
        </div>
        <div className="md:col-span-full">
          <label
            htmlFor="group-address_optional"
            className={fieldLabelClassName}
          >
            Address (optional)
          </label>
          <input
            id="group-address_optional"
            name="address_optional"
            type="text"
            defaultValue={draft?.address_optional ?? ""}
            autoComplete="off"
            className={fieldInputClassName}
            placeholder="123 Vine St."
          />
        </div>
        <div>
          <label htmlFor="group-capacity" className={fieldLabelClassName}>
            Capacity (optional)
          </label>
          <input
            id="group-capacity"
            name="capacity"
            // Expanded: a real number control with range checks for inline
            // feedback. Collapsed: a plain text field so NONE of the number
            // control's native validation (range, step/whole-number, bad
            // input) can block submission from a non-focusable, hidden
            // element. The server validator then surfaces any visible
            // "Capacity must be a whole number / can't be negative / over
            // 1000" error. inputMode stays numeric for the mobile keypad.
            type={showMore ? "number" : "text"}
            min={showMore ? 0 : undefined}
            max={showMore ? 1000 : undefined}
            inputMode="numeric"
            autoComplete="off"
            className={fieldInputClassName}
            // G3 (#222): seed with the ministry default so the new group
            // starts with a sensible capacity rather than Unknown. The field
            // stays mounted while collapsed, so the default submits even when
            // the operator never opens "More details". Clear it to leave the
            // group's capacity Unknown. A restored draft (#781 OPP-3b) wins —
            // including a deliberately-cleared "" — so the round trip is exact.
            defaultValue={draft?.capacity ?? defaultCapacity ?? ""}
            placeholder={
              defaultCapacity != null ? String(defaultCapacity) : "Unknown"
            }
          />
          <p className={fieldHintClassName}>
            {defaultCapacity != null
              ? `Defaults to the ministry capacity of ${defaultCapacity}. Change it for a group that's different, or clear it to leave capacity Unknown.`
              : "No ministry default set, so capacity starts Unknown. Set a number for this group, or leave it blank."}
          </p>
        </div>
        <div>
          {/* #776 OPP-3 — the creatable group-type picker: choose an existing
              type or add a brand-new one in place (no Settings detour), still
              through the audited admin_add_group_type RPC. Leaving it at "—"
              creates the group Untyped. */}
          <GroupTypePicker
            groupTypes={groupTypes}
            name="group_type"
            id="group-group_type"
            label="Group type (optional)"
            initialValue={draft?.group_type}
            enableManageTypes={enableManageTypes}
            manageDisabled={pending}
            fromSetup={fromSetup}
          />
          <p className={fieldHintClassName}>
            Choose a type from the admin-managed list, add a new one, or leave
            it blank to tag the group later.
          </p>
        </div>
        <div>
          <label htmlFor="group-launched_on" className={fieldLabelClassName}>
            Launched on (optional)
          </label>
          <input
            id="group-launched_on"
            name="launched_on"
            type="date"
            defaultValue={draft?.launched_on ?? ""}
            className={fieldInputClassName}
          />
        </div>
        <div className="md:col-span-full">
          <label htmlFor="group-description" className={fieldLabelClassName}>
            Description (optional)
          </label>
          <textarea
            id="group-description"
            name="description"
            rows={3}
            defaultValue={draft?.description ?? ""}
            className={cn(fieldInputClassName, "min-h-20 resize-y")}
            placeholder="Who this group is for, what makes it tick."
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={pending || !canSubmit}
        >
          {pending ? "Creating…" : "Create group"}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="md"
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </Button>
        ) : null}
      </div>
      {!canSubmit ? (
        <p className={fieldHintClassName}>
          Enter a group name to enable Create group.
        </p>
      ) : null}
      <FormStatus state={state} successText="Group created." />
    </form>
  );
}
