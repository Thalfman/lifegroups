"use client";

import { useActionState, useEffect, useRef } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminCreateGroup } from "@/app/(protected)/admin/groups/actions";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  formGridStyle,
  formNoteStyle,
  successTextStyle,
} from "./field-styles";
import type { ActionResult } from "@/lib/admin/action-result";

type State = ActionResult<{ id: string }> | undefined;

export function GroupCreateForm() {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminCreateGroup,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

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
          <input
            id="group-meeting_day"
            name="meeting_day"
            type="text"
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="Wednesday"
          />
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
