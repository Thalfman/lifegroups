"use client";

import { PButton } from "@/components/pastoral/button";
import { adminAssignLeaderToGroup } from "@/app/(protected)/admin/people/actions";
import {
  errorTextStyle,
  fieldLabelStyle,
  fieldSelectStyle,
  successTextStyle,
} from "./field-styles";
import { useActionForm } from "./action-form";
import { P, fontBody } from "@/lib/pastoral";

export function AssignLeaderForm({
  groupId,
  leaderOptions,
}: {
  groupId: string;
  leaderOptions: { id: string; label: string }[];
}) {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    adminAssignLeaderToGroup,
    { resetOnSuccess: true }
  );

  const noOptions = leaderOptions.length === 0;

  return (
    <form
      ref={formRef}
      action={formAction}
      style={{ display: "grid", gap: 10 }}
    >
      <input type="hidden" name="group_id" value={groupId} />
      <div
        className="lg-m-grid-stack"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 140px auto",
          gap: 10,
          alignItems: "end",
        }}
      >
        <div>
          <label htmlFor={`assign-leader-${groupId}`} style={fieldLabelStyle}>
            Leader
          </label>
          <select
            id={`assign-leader-${groupId}`}
            name="profile_id"
            required
            disabled={noOptions}
            style={fieldSelectStyle}
            defaultValue=""
          >
            <option value="" disabled>
              {noOptions ? "No active leaders yet" : "Pick a leader…"}
            </option>
            {leaderOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor={`assign-leader-role-${groupId}`}
            style={fieldLabelStyle}
          >
            Role
          </label>
          <select
            id={`assign-leader-role-${groupId}`}
            name="role"
            required
            disabled={noOptions}
            style={fieldSelectStyle}
            defaultValue="leader"
          >
            <option value="leader">Leader</option>
            <option value="co_leader">Co-leader</option>
          </select>
        </div>
        <div>
          <PButton
            type="submit"
            tone="terra"
            size="sm"
            disabled={pending || noOptions}
          >
            {pending ? "Assigning…" : "Assign leader"}
          </PButton>
        </div>
      </div>
      {noOptions ? (
        <p
          style={{
            ...fieldSelectStyle,
            padding: 0,
            border: 0,
            background: "none",
            fontFamily: fontBody,
            color: P.ink3,
            fontSize: 12,
          }}
        >
          Add a leader profile above before assigning one to this group.
        </p>
      ) : null}
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
      {state?.ok ? <p style={successTextStyle}>Leader assigned.</p> : null}
    </form>
  );
}
