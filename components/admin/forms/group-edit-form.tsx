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
import type { GroupAudienceCategory, MeetingFrequency } from "@/types/enums";
import { useActionForm, FormStatus } from "./action-form";
import {
  EMPTY_CATEGORIES_BY_AUDIENCE,
  optionsForAudience,
  type CategoriesByAudience,
} from "./group-category-options";

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
  // #398: category-picker options grouped by top type (see create form).
  categoriesByAudience = EMPTY_CATEGORIES_BY_AUDIENCE,
}: {
  group: GroupsRow;
  onCancel?: () => void;
  onSaved?: () => void;
  onDirty?: () => void;
  onPendingChange?: (pending: boolean) => void;
  categoriesByAudience?: CategoriesByAudience;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminUpdateGroup
  );
  const [frequency, setFrequency] = useState<MeetingFrequency>(
    group.meeting_frequency
  );
  // #398: the live audience selection drives the category picker's options.
  const [audience, setAudience] = useState<GroupAudienceCategory | "">(
    group.audience_category ?? ""
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

  // #398 review: the group's current category may not appear in the active-cell
  // options — its cell was later un-applied/archived, or the options read
  // failed. While the audience is unchanged, keep that current tag as a
  // selectable (and pre-selected) option so saving an unrelated edit can't
  // silently clear it. The update RPC accepts an unchanged category, so this
  // round-trips cleanly; a top-type change intentionally resets the picker.
  const audienceUnchanged = audience === (group.audience_category ?? "");
  const currentCategoryId = group.category_id ?? "";
  const activeOptions = optionsForAudience(categoriesByAudience, audience);
  const currentCategoryMissing =
    audienceUnchanged &&
    currentCategoryId !== "" &&
    !activeOptions.some((c) => c.id === currentCategoryId);

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
            defaultValue={group.name}
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
            defaultValue={group.meeting_day ?? ""}
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
            defaultValue={isoTimeForInput(group.meeting_time)}
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
              defaultValue={group.meeting_week_parity ?? ""}
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
            defaultValue={group.location_area ?? ""}
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
            defaultValue={group.address_optional ?? ""}
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
            defaultValue={group.capacity ?? ""}
            className={fieldInputClassName}
            placeholder="12"
          />
        </div>
        <div>
          <label
            htmlFor={`edit-audience_category-${group.id}`}
            className={fieldLabelClassName}
          >
            Audience
          </label>
          <select
            id={`edit-audience_category-${group.id}`}
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
          <label
            htmlFor={`edit-category_id-${group.id}`}
            className={fieldLabelClassName}
          >
            Category
          </label>
          <select
            id={`edit-category_id-${group.id}`}
            name="category_id"
            // Keyed by audience so a top-type change resets the picker to the
            // new type's categories. Defaults to the group's current category
            // only while the audience is unchanged; otherwise "" = Uncategorized.
            key={audience}
            defaultValue={
              audience === (group.audience_category ?? "")
                ? (group.category_id ?? "")
                : ""
            }
            disabled={!audience}
            className={fieldSelectClassName}
          >
            <option value="">Uncategorized</option>
            {currentCategoryMissing ? (
              <option value={currentCategoryId}>
                Keep current category (no longer applied)
              </option>
            ) : null}
            {activeOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
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
            defaultValue={group.launched_on ?? ""}
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
            defaultValue={group.description ?? ""}
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
