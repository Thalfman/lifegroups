"use client";

import { useEffect, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminChangeLeaderRole } from "@/app/(protected)/admin/people/actions";
import { P, fontBody } from "@/lib/pastoral";
import {
  errorTextStyle,
  fieldLabelStyle,
  fieldSelectStyle,
  successTextStyle,
} from "./field-styles";
import { useActionForm } from "./action-form";

export function ChangeLeaderRoleForm({
  profileId,
  profileName,
  currentRole,
}: {
  profileId: string;
  profileName: string;
  currentRole: "leader" | "co_leader";
}) {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    adminChangeLeaderRole,
    { resetOnSuccess: true }
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  const otherRole: "leader" | "co_leader" =
    currentRole === "leader" ? "co_leader" : "leader";

  if (!open) {
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <PButton
          tone="ghost"
          size="sm"
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Change role for ${profileName}`}
        >
          Change role
        </PButton>
        {state?.ok ? (
          <p style={{ ...successTextStyle, padding: "4px 8px", fontSize: 11 }}>
            Role updated.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      style={{
        display: "grid",
        gap: 8,
        background: P.bg,
        border: `1px solid ${P.line}`,
        borderRadius: 8,
        padding: "10px 12px",
        minWidth: 230,
      }}
    >
      <input type="hidden" name="profile_id" value={profileId} />
      <p
        style={{ fontFamily: fontBody, fontSize: 12, color: P.ink2, margin: 0 }}
      >
        Swap {profileName}&rsquo;s role between leader and co-leader. Group
        assignments stay as they are.
      </p>
      <div>
        <label htmlFor={`change-role-${profileId}`} style={fieldLabelStyle}>
          New role
        </label>
        <select
          id={`change-role-${profileId}`}
          name="new_role"
          required
          defaultValue={otherRole}
          style={fieldSelectStyle}
        >
          <option value="leader">Leader</option>
          <option value="co_leader">Co-Leader</option>
        </select>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <PButton
          type="button"
          tone="ghost"
          size="sm"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Cancel
        </PButton>
        <PButton type="submit" tone="terra" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </PButton>
      </div>
      {state && !state.ok ? (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gap: 4,
          }}
        >
          {state.errors.map((err, i) => (
            <li key={i}>
              <p style={errorTextStyle}>{err}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
