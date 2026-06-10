"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { adminChangeLeaderRole } from "@/app/(protected)/admin/people/actions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import {
  errorTextClassName,
  fieldLabelClassName,
  fieldSelectClassName,
  successTextClassName,
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
      <div className="grid gap-1">
        <Button
          variant="solid"
          size="sm"
          type="button"
          onClick={() => {
            setNewRole(otherRole);
            setOpen(true);
          }}
          aria-label={`Change role for ${profileName}`}
        >
          Change role
        </Button>
        {state?.ok ? (
          <p className={cn(successTextClassName, "px-2 py-1 text-2xs")}>
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
      className="grid min-w-[230px] gap-2 rounded-sm border border-line bg-bg px-3 py-2.5"
    >
      <input type="hidden" name="profile_id" value={profileId} />
      <p className="m-0 font-sans text-xs text-ink2">
        Swap {profileName}&rsquo;s role between leader and co-leader. Group
        assignments stay as they are.
      </p>
      <div>
        <label
          htmlFor={`change-role-${profileId}`}
          className={fieldLabelClassName}
        >
          New role
        </label>
        <select
          id={`change-role-${profileId}`}
          name="new_role"
          required
          value={newRole}
          onChange={(e) => setNewRole(e.target.value as LeaderRole)}
          className={fieldSelectClassName}
        >
          <option value="leader">{ROLE_LABELS.leader}</option>
          <option value="co_leader">{ROLE_LABELS.co_leader}</option>
        </select>
      </div>
      {downgrade ? (
        <p className="m-0 font-sans text-xs text-clayDeep">
          Downgrading to {ROLE_LABELS.co_leader} narrows what {profileName} can
          do. You&rsquo;ll be asked to confirm.
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setNewRole(otherRole);
            setOpen(false);
          }}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant={downgrade ? "primary" : "solid"}
          size="sm"
          disabled={pending}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {state && !state.ok ? (
        <ul className="m-0 grid list-none gap-1 p-0">
          {state.errors.map((err, i) => (
            <li key={i}>
              <p className={errorTextClassName}>{err}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
