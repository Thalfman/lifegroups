"use client";

import { useActionState, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminUpdateGroup } from "@/app/(protected)/admin/groups/actions";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  successTextStyle,
} from "./field-styles";
import { P, fontBody } from "@/lib/pastoral";
import type { ActionResult } from "@/lib/admin/action-result";
import type { GroupsRow } from "@/types/database";

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
          <input
            id={`edit-meeting_day-${group.id}`}
            name="meeting_day"
            type="text"
            defaultValue={group.meeting_day ?? ""}
            style={fieldInputStyle}
            placeholder="Wednesday"
          />
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

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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

// Convenience toggle wrapper: shows an "Edit" button until clicked, then
// renders the inline edit form. Keeps the group list compact by default.
export function EditGroupToggle({ group }: { group: GroupsRow }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <PButton type="button" tone="ghost" size="sm" onClick={() => setOpen(true)}>
        Edit
      </PButton>
    );
  }
  return (
    <div
      style={{
        gridColumn: "1 / -1",
        fontFamily: fontBody,
      }}
    >
      <GroupEditForm group={group} onClose={() => setOpen(false)} />
    </div>
  );
}
