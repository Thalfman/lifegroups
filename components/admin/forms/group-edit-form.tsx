"use client";

import { useEffect, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminUpdateGroup } from "@/app/(protected)/admin/groups/actions";
import {
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
} from "./field-styles";
import { P, fontBody } from "@/lib/pastoral";
import {
  MEETING_DAYS_ORDERED,
  MEETING_FREQUENCY_OPTIONS,
  MEETING_PARITY_OPTIONS,
} from "./meeting-schedule-options";
import type { GroupsRow } from "@/types/database";
import type { MeetingFrequency } from "@/types/enums";
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
}: {
  group: GroupsRow;
  onCancel?: () => void;
  onSaved?: () => void;
  onDirty?: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminUpdateGroup
  );
  const [frequency, setFrequency] = useState<MeetingFrequency>(
    group.meeting_frequency
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

  return (
    <form
      action={formAction}
      onChange={onDirty}
      style={{ display: "grid", gap: 12 }}
    >
      <input type="hidden" name="group_id" value={group.id} />
      <div
        className="lg-m-grid-stack"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          alignItems: "end",
        }}
      >
        <div>
          <label htmlFor={`edit-name-${group.id}`} style={fieldLabelStyle}>
            Group name
          </label>
          <input
            id={`edit-name-${group.id}`}
            name="name"
            type="text"
            required
            defaultValue={group.name}
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label
            htmlFor={`edit-meeting_day-${group.id}`}
            style={fieldLabelStyle}
          >
            Meeting day
          </label>
          <select
            id={`edit-meeting_day-${group.id}`}
            name="meeting_day"
            defaultValue={group.meeting_day ?? ""}
            style={fieldSelectStyle}
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
            style={fieldLabelStyle}
          >
            Meeting time
          </label>
          <input
            id={`edit-meeting_time-${group.id}`}
            name="meeting_time"
            type="time"
            defaultValue={isoTimeForInput(group.meeting_time)}
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label
            htmlFor={`edit-meeting_frequency-${group.id}`}
            style={fieldLabelStyle}
          >
            Meeting frequency
          </label>
          <select
            id={`edit-meeting_frequency-${group.id}`}
            name="meeting_frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as MeetingFrequency)}
            style={fieldSelectStyle}
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
              style={fieldLabelStyle}
            >
              Which weeks does it meet?
            </label>
            <select
              id={`edit-meeting_week_parity-${group.id}`}
              name="meeting_week_parity"
              defaultValue={group.meeting_week_parity ?? ""}
              style={fieldSelectStyle}
            >
              <option value="">Choose weeks</option>
              {MEETING_PARITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p
              style={{
                fontFamily: fontBody,
                fontSize: 12,
                color: P.ink3,
                margin: "6px 0 0",
                lineHeight: 1.4,
              }}
            >
              For groups that meet every other week. Odd and even weeks
              alternate through the year — pick the set this group gathers on.
            </p>
          </div>
        ) : null}
        <div>
          <label
            htmlFor={`edit-location_area-${group.id}`}
            style={fieldLabelStyle}
          >
            Location area
          </label>
          <input
            id={`edit-location_area-${group.id}`}
            name="location_area"
            type="text"
            defaultValue={group.location_area ?? ""}
            style={fieldInputStyle}
            placeholder="Westside"
          />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label
            htmlFor={`edit-address_optional-${group.id}`}
            style={fieldLabelStyle}
          >
            Address
          </label>
          <input
            id={`edit-address_optional-${group.id}`}
            name="address_optional"
            type="text"
            defaultValue={group.address_optional ?? ""}
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label htmlFor={`edit-capacity-${group.id}`} style={fieldLabelStyle}>
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
            style={fieldInputStyle}
            placeholder="12"
          />
        </div>
        <div>
          <label
            htmlFor={`edit-audience_category-${group.id}`}
            style={fieldLabelStyle}
          >
            Audience
          </label>
          <select
            id={`edit-audience_category-${group.id}`}
            name="audience_category"
            defaultValue={group.audience_category ?? ""}
            style={fieldSelectStyle}
          >
            <option value="">Unset</option>
            <option value="men">Men</option>
            <option value="women">Women</option>
            <option value="mixed">Mixed / couples</option>
          </select>
        </div>
        <div>
          <label
            htmlFor={`edit-life_stage-${group.id}`}
            style={fieldLabelStyle}
          >
            Life stage
          </label>
          <select
            id={`edit-life_stage-${group.id}`}
            name="life_stage"
            defaultValue={group.life_stage ?? ""}
            style={fieldSelectStyle}
          >
            <option value="">Unset</option>
            <option value="young_professionals">Young professionals</option>
            <option value="young_families">Young families</option>
            <option value="families_with_kids">Families with kids/teens</option>
            <option value="families_with_adult_kids">
              Families with adult kids
            </option>
            <option value="retirement">Retirement</option>
            <option value="multi_generational">Multi-generational</option>
            <option value="spanish_speaking">Spanish speaking</option>
          </select>
        </div>
        <div>
          <label
            htmlFor={`edit-launched_on-${group.id}`}
            style={fieldLabelStyle}
          >
            Launched on
          </label>
          <input
            id={`edit-launched_on-${group.id}`}
            name="launched_on"
            type="date"
            defaultValue={group.launched_on ?? ""}
            style={fieldInputStyle}
          />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label
            htmlFor={`edit-description-${group.id}`}
            style={fieldLabelStyle}
          >
            Description
          </label>
          <textarea
            id={`edit-description-${group.id}`}
            name="description"
            rows={3}
            defaultValue={group.description ?? ""}
            style={{ ...fieldInputStyle, resize: "vertical", minHeight: 80 }}
          />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          paddingTop: 10,
          borderTop: `1px solid ${P.line}`,
          marginTop: 2,
        }}
      >
        <PButton type="submit" tone="terra" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </PButton>
        {onCancel ? (
          <PButton
            type="button"
            tone="ghost"
            size="sm"
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </PButton>
        ) : null}
      </div>

      <FormStatus state={state} successText="Group updated." />
    </form>
  );
}
