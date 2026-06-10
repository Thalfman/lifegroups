"use client";

import { useEffect } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminAssignMemberToGroup } from "@/app/(protected)/admin/people/actions";
import {
  errorTextClassName,
  fieldLabelClassName,
  fieldSelectClassName,
  successTextClassName,
} from "./field-styles";
import { useActionForm } from "./action-form";

export function AssignMemberForm({
  groupId,
  memberOptions,
  // Supplied when rendered inside the EditingSurface drawer (#270): `onSaved`
  // lets the drawer clear its dirty flag once an assign lands (so closing right
  // after a successful assign never falsely warns), and `onPendingChange` lets
  // it block dismissal while the write is in flight.
  onSaved,
  onPendingChange,
}: {
  groupId: string;
  memberOptions: { id: string; label: string }[];
  onSaved?: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    adminAssignMemberToGroup,
    { resetOnSuccess: true }
  );

  useEffect(() => {
    if (state?.ok) onSaved?.();
  }, [state, onSaved]);

  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  const noOptions = memberOptions.length === 0;

  return (
    <form ref={formRef} action={formAction} className="grid gap-2.5">
      <input type="hidden" name="group_id" value={groupId} />
      <div className="grid grid-cols-1 items-end gap-2.5 md:grid-cols-[1fr_auto]">
        <div>
          <label
            htmlFor={`assign-member-${groupId}`}
            className={fieldLabelClassName}
          >
            Member
          </label>
          <select
            id={`assign-member-${groupId}`}
            name="member_id"
            required
            disabled={noOptions}
            className={fieldSelectClassName}
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
          <PButton
            type="submit"
            tone="ghost"
            size="sm"
            disabled={pending || noOptions}
          >
            {pending ? "Adding…" : "Add member"}
          </PButton>
        </div>
      </div>
      {noOptions ? (
        <p className="m-0 font-sans text-xs text-ink3">
          Add a member record above before placing one in this group.
        </p>
      ) : null}
      {state && !state.ok ? (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {state.errors.map((err, i) => (
            <li key={i}>
              <p className={errorTextClassName}>{err}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {state?.ok ? (
        <p className={successTextClassName}>Member added to group.</p>
      ) : null}
    </form>
  );
}
