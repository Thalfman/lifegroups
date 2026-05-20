"use client";

import { useActionState, useEffect, useRef } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminAssignMemberToGroup } from "@/app/(protected)/admin/people/actions";
import {
  errorTextStyle,
  fieldLabelStyle,
  fieldSelectStyle,
  successTextStyle,
} from "./field-styles";
import type { ActionResult } from "@/lib/admin/action-result";
import { P, fontBody } from "@/lib/pastoral";

type State = ActionResult<{ id: string }> | undefined;

export function AssignMemberForm({
  groupId,
  memberOptions,
}: {
  groupId: string;
  memberOptions: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminAssignMemberToGroup,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  const noOptions = memberOptions.length === 0;

  return (
    <form ref={formRef} action={formAction} style={{ display: "grid", gap: 10 }}>
      <input type="hidden" name="group_id" value={groupId} />
      <div
        className="lg-m-grid-stack"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 10,
          alignItems: "end",
        }}
      >
        <div>
          <label htmlFor={`assign-member-${groupId}`} style={fieldLabelStyle}>
            Member
          </label>
          <select
            id={`assign-member-${groupId}`}
            name="member_id"
            required
            disabled={noOptions}
            style={fieldSelectStyle}
            defaultValue=""
          >
            <option value="" disabled>
              {noOptions ? "No active members yet" : "Pick a member…"}
            </option>
            {memberOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <PButton type="submit" tone="ghost" size="sm" disabled={pending || noOptions}>
            {pending ? "Adding…" : "Add member"}
          </PButton>
        </div>
      </div>
      {noOptions ? (
        <p style={{ fontFamily: fontBody, color: P.ink3, fontSize: 12, margin: 0 }}>
          Add a member record above before placing one in this group.
        </p>
      ) : null}
      {state && !state.ok ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
          {state.errors.map((err, i) => (
            <li key={i}>
              <p style={errorTextStyle}>{err}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {state?.ok ? <p style={successTextStyle}>Member added to group.</p> : null}
    </form>
  );
}
