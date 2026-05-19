"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminCreateGroup } from "@/app/(protected)/admin/groups/actions";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
  formGridStyle,
  formNoteStyle,
  successTextStyle,
} from "./field-styles";
import { P, fontBody } from "@/lib/pastoral";
import {
  MEETING_DAYS_ORDERED,
  MEETING_FREQUENCY_OPTIONS,
  MEETING_PARITY_OPTIONS,
} from "./meeting-schedule-options";
import type { ActionResult } from "@/lib/admin/action-result";
import type { MeetingFrequency } from "@/types/enums";

type State = ActionResult<{ id: string }> | undefined;

export function GroupCreateForm() {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminCreateGroup,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [frequency, setFrequency] = useState<MeetingFrequency>("weekly");

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setFrequency("weekly");
    }
  }, [state]);

  const showParity = frequency === "biweekly";

  return (
    <form ref={formRef} action={formAction} style={{ display: "grid", gap: 12 }}>
      <p style={formNoteStyle}>
        Create a new Life Group. The name is required &mdash; everything else can
        be filled in later as the group settles into a rhythm.
      </p>
      <div style={formGridStyle}>
        <div>
          <label htmlFor="group-name" style={fieldLabelStyle}>
            Group name
          </label>
          <input
            id="group-name"
            name="name"
            type="text"
            required
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="Wednesday Westside"
          />
        </div>
        <div>
          <label htmlFor="group-meeting_day" style={fieldLabelStyle}>
            Meeting day (optional)
          </label>
          <select
            id="group-meeting_day"
            name="meeting_day"
            defaultValue=""
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
          <label htmlFor="group-meeting_time" style={fieldLabelStyle}>
            Meeting time (optional)
          </label>
          <input
            id="group-meeting_time"
            name="meeting_time"
            type="time"
            autoComplete="off"
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label htmlFor="group-meeting_frequency" style={fieldLabelStyle}>
            Meeting frequency
          </label>
          <select
            id="group-meeting_frequency"
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
            <label htmlFor="group-meeting_week_parity" style={fieldLabelStyle}>
              Bi-weekly parity
            </label>
            <select
              id="group-meeting_week_parity"
              name="meeting_week_parity"
              defaultValue=""
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
              Bi-weekly groups meet on odd or even calendar week numbers.
            </p>
          </div>
        ) : null}
        <div>
          <label htmlFor="group-location_area" style={fieldLabelStyle}>
            Location area (optional)
          </label>
          <input
            id="group-location_area"
            name="location_area"
            type="text"
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="Westside"
          />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="group-address_optional" style={fieldLabelStyle}>
            Address (optional)
          </label>
          <input
            id="group-address_optional"
            name="address_optional"
            type="text"
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="123 Vine St."
          />
        </div>
        <div>
          <label htmlFor="group-capacity" style={fieldLabelStyle}>
            Capacity (optional)
          </label>
          <input
            id="group-capacity"
            name="capacity"
            type="number"
            min={0}
            max={1000}
            inputMode="numeric"
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="12"
          />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="group-description" style={fieldLabelStyle}>
            Description (optional)
          </label>
          <textarea
            id="group-description"
            name="description"
            rows={3}
            style={{ ...fieldInputStyle, resize: "vertical", minHeight: 80 }}
            placeholder="Who this group is for, what makes it tick."
          />
        </div>
        <div>
          <PButton type="submit" tone="terra" size="md" disabled={pending}>
            {pending ? "Creating…" : "Create group"}
          </PButton>
        </div>
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
      {state?.ok ? <p style={successTextStyle}>Group created.</p> : null}
    </form>
  );
}
