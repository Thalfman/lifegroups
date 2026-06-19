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
import type { GroupAudienceCategory, MeetingFrequency } from "@/types/enums";
import { useActionForm, FormStatus } from "./action-form";
import {
  EMPTY_CATEGORIES_BY_AUDIENCE,
  optionsForAudience,
  type CategoriesByAudience,
} from "./group-category-options";

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
  // #398: the category-picker options grouped by top type. The picker filters to
  // the categories applied to the group's selected audience (its cell).
  categoriesByAudience = EMPTY_CATEGORIES_BY_AUDIENCE,
}: {
  defaultCapacity: number | null;
  onSaved?: () => void;
  onDirty?: () => void;
  onCancel?: () => void;
  onPendingChange?: (pending: boolean) => void;
  categoriesByAudience?: CategoriesByAudience;
}) {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    adminCreateGroup,
    { resetOnSuccess: true }
  );
  const [frequency, setFrequency] = useState<MeetingFrequency>("weekly");
  const [showMore, setShowMore] = useState(false);
  const [groupName, setGroupName] = useState("");
  // #398: the live audience selection drives which categories the picker offers
  // (only those with an active cell under that top type). "" = unset.
  const [audience, setAudience] = useState<GroupAudienceCategory | "">("");

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
    setAudience("");
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
            defaultValue=""
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
              defaultValue=""
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
            // group's capacity Unknown.
            defaultValue={defaultCapacity ?? ""}
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
          <label
            htmlFor="group-audience_category"
            className={fieldLabelClassName}
          >
            Audience (optional)
          </label>
          <select
            id="group-audience_category"
            name="audience_category"
            value={audience}
            onChange={(e) =>
              setAudience(e.target.value as GroupAudienceCategory | "")
            }
            className={fieldSelectClassName}
          >
            <option value="">Unset</option>
            <option value="men">Men</option>
            <option value="women">Women</option>
            <option value="mixed">Mixed</option>
          </select>
        </div>
        <div>
          <label htmlFor="group-category_id" className={fieldLabelClassName}>
            Category (optional)
          </label>
          <select
            id="group-category_id"
            name="category_id"
            // Keyed by audience so the selection resets when the top type
            // changes (a category from the old type wouldn't apply to the new
            // one). "" = Uncategorized.
            key={audience}
            defaultValue=""
            disabled={!audience}
            className={fieldSelectClassName}
          >
            <option value="">Uncategorized</option>
            {optionsForAudience(categoriesByAudience, audience).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <p className={fieldHintClassName}>
            {audience
              ? "Categories applied to this audience. Leave Uncategorized to tag it later."
              : "Pick an audience first to choose a category. Until then the group is Uncategorized."}
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
