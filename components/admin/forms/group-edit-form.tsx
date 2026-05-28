"use client";

import { useActionState, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminUpdateGroup } from "@/app/(protected)/admin/groups/actions";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
  successTextStyle,
} from "./field-styles";
import { P, fontBody } from "@/lib/pastoral";
import { MEETING_DAYS_ORDERED, MEETING_FREQUENCY_OPTIONS, MEETING_PARITY_OPTIONS } from "./meeting-schedule-options";
import type { ActionResult } from "@/lib/admin/action-result";
import type { GroupsRow } from "@/types/database";
import type { MeetingFrequency } from "@/types/enums";

type State = ActionResult<{ id: string }> | undefined;

function isoTimeForInput(value: string | null): string {
  if (!value) return "";
  // Postgres `time` round-trips as either `HH:mm` or `HH:mm:ss`. The
  // <input type="time"> control wants `HH:mm`, so trim seconds.
  const match = /^(\d{2}):(\d{2})/.exec(value);
  return match ? `${match[1]}:${match[2]}` : "";
}

export function GroupEditForm({
  group,
  onClose,
}: {
  group: GroupsRow;
  onClose?: () => void;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminUpdateGroup,
    undefined,
  );
  const [frequency, setFrequency] = useState<MeetingFrequency>(group.meeting_frequency);

  const showParity = frequency === "biweekly";

  return (
    <form
      action={formAction}
      style={{
        display: "grid",
        gap: 12,
        background: P.bg,
        border: `1px solid ${P.line}`,
        borderRadius: 10,
        padding: "16px 18px",
      }}
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
          <label htmlFor={`edit-meeting_day-${group.id}`} style={fieldLabelStyle}>
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
          <label htmlFor={`edit-meeting_time-${group.id}`} style={fieldLabelStyle}>
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
          <label htmlFor={`edit-meeting_frequency-${group.id}`} style={fieldLabelStyle}>
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
              Bi-weekly parity
            </label>
            <select
              id={`edit-meeting_week_parity-${group.id}`}
              name="meeting_week_parity"
              defaultValue={group.meeting_week_parity ?? ""}
              style={fieldSelectStyle}
            >
              <option value="">Choose week parity</option>
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
              Used for bi-weekly groups only. Odd/even is based on the
              calendar week number.
            </p>
          </div>
        ) : null}
        <div>
          <label htmlFor={`edit-location_area-${group.id}`} style={fieldLabelStyle}>
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
          <label htmlFor={`edit-address_optional-${group.id}`} style={fieldLabelStyle}>
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
          <label htmlFor={`edit-audience_category-${group.id}`} style={fieldLabelStyle}>
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
          <label htmlFor={`edit-life_stage-${group.id}`} style={fieldLabelStyle}>
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
            <option value="families_with_adult_kids">Families with adult kids</option>
            <option value="retirement">Retirement</option>
            <option value="multi_generational">Multi-generational</option>
            <option value="spanish_speaking">Spanish speaking</option>
          </select>
        </div>
        <div>
          <label htmlFor={`edit-launched_on-${group.id}`} style={fieldLabelStyle}>
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
          <label htmlFor={`edit-description-${group.id}`} style={fieldLabelStyle}>
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
        {onClose ? (
          <PButton
            type="button"
            tone="ghost"
            size="sm"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </PButton>
        ) : null}
      </div>

      {state && !state.ok ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
          {state.errors.map((err, i) => (
            <li key={i}>
              <p style={errorTextStyle}>{err}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {state?.ok ? (
        <p style={successTextStyle}>Group updated.</p>
      ) : null}
    </form>
  );
}
