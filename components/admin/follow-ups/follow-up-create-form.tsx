"use client";

import { useActionState, useEffect, useRef } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminCreateFollowUp } from "@/app/(protected)/admin/follow-ups/actions";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
  formGridStyle,
  formNoteStyle,
  successTextStyle,
} from "@/components/admin/forms/field-styles";
import {
  followUpPriorityLabel,
  followUpTypeLabel,
} from "@/lib/dashboard/labels";
import type { ActionResult } from "@/lib/admin/action-result";
import type {
  GroupsRow,
  GuestsRow,
  MembersRow,
  ProfilesRow,
} from "@/types/database";
import type {
  FollowUpPriority,
  FollowUpType,
} from "@/types/enums";

type State = ActionResult<{ id: string }> | undefined;

const TYPES: FollowUpType[] = [
  "attendance",
  "guest",
  "leader",
  "capacity",
  "pause",
  "care",
  "admin",
];

const PRIORITIES: FollowUpPriority[] = ["low", "normal", "high"];

export function FollowUpCreateForm({
  groups,
  members,
  guests,
  assignees,
}: {
  groups: GroupsRow[];
  members: MembersRow[];
  guests: GuestsRow[];
  assignees: ProfilesRow[];
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminCreateFollowUp,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  const sortedMembers = [...members].sort((a, b) =>
    a.full_name.localeCompare(b.full_name),
  );

  return (
    <form ref={formRef} action={formAction} style={{ display: "grid", gap: 12 }}>
      <p style={formNoteStyle}>
        Title and type are required. Relate it to whichever entity makes sense
        — group, member, guest — and assign someone if you want them to own it.
        Notes are optional and capped at 1000 characters each.
      </p>
      <div style={formGridStyle}>
        <div>
          <label htmlFor="fu-title" style={fieldLabelStyle}>
            Title
          </label>
          <input
            id="fu-title"
            name="title"
            type="text"
            required
            maxLength={200}
            style={fieldInputStyle}
            placeholder="Reach out to Skyler about placement"
          />
        </div>
        <div>
          <label htmlFor="fu-type" style={fieldLabelStyle}>
            Type
          </label>
          <select
            id="fu-type"
            name="type"
            required
            defaultValue="guest"
            style={fieldSelectStyle}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {followUpTypeLabel(t)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fu-priority" style={fieldLabelStyle}>
            Priority
          </label>
          <select
            id="fu-priority"
            name="priority"
            defaultValue="normal"
            style={fieldSelectStyle}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {followUpPriorityLabel(p)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fu-due_date" style={fieldLabelStyle}>
            Due date (optional)
          </label>
          <input
            id="fu-due_date"
            name="due_date"
            type="date"
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label htmlFor="fu-related_group_id" style={fieldLabelStyle}>
            Related group (optional)
          </label>
          <select
            id="fu-related_group_id"
            name="related_group_id"
            defaultValue=""
            style={fieldSelectStyle}
          >
            <option value="">—</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {g.lifecycle_status === "closed" ? " (closed)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fu-related_member_id" style={fieldLabelStyle}>
            Related member (optional)
          </label>
          <select
            id="fu-related_member_id"
            name="related_member_id"
            defaultValue=""
            style={fieldSelectStyle}
          >
            <option value="">—</option>
            {sortedMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fu-related_guest_id" style={fieldLabelStyle}>
            Related guest (optional)
          </label>
          <select
            id="fu-related_guest_id"
            name="related_guest_id"
            defaultValue=""
            style={fieldSelectStyle}
          >
            <option value="">—</option>
            {guests.map((g) => (
              <option key={g.id} value={g.id}>
                {g.full_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fu-assigned_to" style={fieldLabelStyle}>
            Assigned to (optional)
          </label>
          <select
            id="fu-assigned_to"
            name="assigned_to"
            defaultValue=""
            style={fieldSelectStyle}
          >
            <option value="">— (unassigned)</option>
            {assignees.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="fu-leader_visible_note" style={fieldLabelStyle}>
            Leader-visible note (optional, max 1000 chars)
          </label>
          <textarea
            id="fu-leader_visible_note"
            name="leader_visible_note"
            rows={2}
            maxLength={1000}
            style={{ ...fieldInputStyle, resize: "vertical", minHeight: 60 }}
            placeholder="Anything the assigned leader should see when they open this."
          />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="fu-admin_private_note" style={fieldLabelStyle}>
            Admin-private note (optional, max 1000 chars) — leaders never see this
          </label>
          <textarea
            id="fu-admin_private_note"
            name="admin_private_note"
            rows={2}
            maxLength={1000}
            style={{ ...fieldInputStyle, resize: "vertical", minHeight: 60 }}
            placeholder="Context only the admin team should see."
          />
        </div>
        <div>
          <PButton type="submit" tone="terra" size="md" disabled={pending}>
            {pending ? "Saving…" : "Create follow-up"}
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
      {state?.ok ? <p style={successTextStyle}>Follow-up created.</p> : null}
    </form>
  );
}
