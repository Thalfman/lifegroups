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
    undefined
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [frequency, setFrequency] = useState<MeetingFrequency>("weekly");
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setFrequency("weekly");
      setShowMore(false);
    }
  }, [state]);

  const showParity = frequency === "biweekly";

  return (
    <form
      ref={formRef}
      action={formAction}
      style={{ display: "grid", gap: 12 }}
    >
      <p style={formNoteStyle}>
        Create a new Life Group. Start with the name and when it meets &mdash;
        everything else can be filled in under More details, now or later as the
        group settles into a rhythm.
      </p>
      <div className="lg-m-grid-stack" style={formGridStyle}>
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
      </div>
      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        style={{
          justifySelf: "start",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          fontFamily: fontBody,
          fontSize: 12.5,
          color: P.ink2,
          textDecoration: "underline",
        }}
      >
        {showMore ? "Fewer details" : "More details"}
      </button>
      {/* Kept mounted (hidden) when collapsed so values entered under
          More details — most importantly meeting_frequency, which would
          otherwise default back to weekly on the server — still submit
          with the form rather than being silently discarded. */}
      <div
        className="lg-m-grid-stack"
        style={showMore ? formGridStyle : { ...formGridStyle, display: "none" }}
      >
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
              Which weeks does it meet?
            </label>
            <select
              id="group-meeting_week_parity"
              name="meeting_week_parity"
              defaultValue=""
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
            // Only enforce the native range while the section is expanded.
            // The field stays mounted (display:none) when collapsed, where a
            // non-focusable out-of-range value would block submission with no
            // visible bubble; collapsed, we defer to the server validator,
            // which surfaces a "Capacity can't be negative / over 1000" error.
            min={showMore ? 0 : undefined}
            max={showMore ? 1000 : undefined}
            inputMode="numeric"
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="12"
          />
        </div>
        <div>
          <label htmlFor="group-audience_category" style={fieldLabelStyle}>
            Audience (optional)
          </label>
          <select
            id="group-audience_category"
            name="audience_category"
            defaultValue=""
            style={fieldSelectStyle}
          >
            <option value="">Unset</option>
            <option value="men">Men</option>
            <option value="women">Women</option>
            <option value="mixed">Mixed / couples</option>
          </select>
        </div>
        <div>
          <label htmlFor="group-life_stage" style={fieldLabelStyle}>
            Life stage (optional)
          </label>
          <select
            id="group-life_stage"
            name="life_stage"
            defaultValue=""
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
          <label htmlFor="group-launched_on" style={fieldLabelStyle}>
            Launched on (optional)
          </label>
          <input
            id="group-launched_on"
            name="launched_on"
            type="date"
            style={fieldInputStyle}
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
      </div>
      <div>
        <PButton type="submit" tone="terra" size="md" disabled={pending}>
          {pending ? "Creating…" : "Create group"}
        </PButton>
      </div>
      {state && !state.ok ? (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gap: 6,
          }}
        >
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
