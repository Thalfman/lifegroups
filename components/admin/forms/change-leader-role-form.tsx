"use client";

import { useEffect, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminChangeLeaderRole } from "@/app/(protected)/admin/people/actions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { P, fontBody } from "@/lib/pastoral";
import {
  errorTextStyle,
  fieldLabelStyle,
  fieldSelectStyle,
  successTextStyle,
} from "./field-styles";
import { useActionForm } from "./action-form";

type LeaderRole = "leader" | "co_leader";

// Leader → Co-Leader narrows what the person can do, so it is the destructive
// direction and carries a confirmation step (mirroring the deactivate confirm).
// Co-Leader → Leader is a promotion and goes through without a guard.
function isRoleDowngrade(from: LeaderRole, to: LeaderRole): boolean {
  return from === "leader" && to === "co_leader";
}

export function ChangeLeaderRoleForm({
  profileId,
  profileName,
  currentRole,
}: {
  profileId: string;
  profileName: string;
  currentRole: LeaderRole;
}) {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    adminChangeLeaderRole,
    { resetOnSuccess: true }
  );
  const [open, setOpen] = useState(false);

  const otherRole: LeaderRole =
    currentRole === "leader" ? "co_leader" : "leader";

  // Track the selected target role so the Save button can read as primary for a
  // promotion and as destructive (terra) for a downgrade.
  const [newRole, setNewRole] = useState<LeaderRole>(otherRole);
  const downgrade = isRoleDowngrade(currentRole, newRole);

  useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      setNewRole(otherRole);
    }
  }, [state, otherRole]);

  // The destructive direction (role downgrade) carries an explicit confirm step,
  // consistent with the deactivate buttons' window.confirm guard.
  function confirmDowngrade(e: React.FormEvent<HTMLFormElement>) {
    if (
      downgrade &&
      !window.confirm(
        `Change ${profileName} from ${ROLE_LABELS[currentRole]} to ${ROLE_LABELS[newRole]}? This narrows what they can do.`
      )
    ) {
      e.preventDefault();
    }
  }

  if (!open) {
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <PButton
          tone="solid"
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
      onSubmit={confirmDowngrade}
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
          value={newRole}
          onChange={(e) => setNewRole(e.target.value as LeaderRole)}
          style={fieldSelectStyle}
        >
          <option value="leader">{ROLE_LABELS.leader}</option>
          <option value="co_leader">{ROLE_LABELS.co_leader}</option>
        </select>
      </div>
      {downgrade ? (
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 12,
            color: P.terraTextStrong,
            margin: 0,
          }}
        >
          Downgrading to {ROLE_LABELS.co_leader} narrows what {profileName} can
          do. You&rsquo;ll be asked to confirm.
        </p>
      ) : null}
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
        <PButton
          type="submit"
          tone={downgrade ? "terra" : "solid"}
          size="sm"
          disabled={pending}
        >
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
