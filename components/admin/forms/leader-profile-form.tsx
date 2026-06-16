"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useValueChange } from "@/lib/hooks/use-value-change";
import {
  adminCreateLeaderProfile,
  adminAddPersonToGroup,
} from "@/app/(protected)/admin/people/actions";
import {
  fieldHintClassName,
  fieldInputClassName,
  fieldLabelClassName,
  fieldSelectClassName,
  formGridClassName,
  formNoteClassName,
} from "./field-styles";
import { useActionForm, FormStatus } from "./action-form";
import { isEmail } from "@/lib/admin/validation/shared";

export function LeaderProfileForm({
  // Supplied when rendered inside the EditingSurface drawer: `onSaved` closes
  // + refreshes once the profile is created, `onDirty` lets the drawer warn
  // before discarding entered values, `onCancel` renders a Cancel control, and
  // `onPendingChange` lets the drawer block dismissal while the create is in
  // flight.
  onSaved,
  onDirty,
  onCancel,
  onPendingChange,
  // Group roster create-and-assign (#643): when set, the same form creates the
  // leader profile AND puts them on this group (with the chosen in-group role)
  // in one atomic audited write, via adminAddPersonToGroup.
  assignToGroup,
}: {
  onSaved?: () => void;
  onDirty?: () => void;
  onCancel?: () => void;
  onPendingChange?: (pending: boolean) => void;
  assignToGroup?: { groupId: string; groupName: string };
} = {}) {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    assignToGroup ? adminAddPersonToGroup : adminCreateLeaderProfile,
    { resetOnSuccess: true }
  );
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  // Reset the controlled fields on a fresh successful create (the <form> reset
  // only clears uncontrolled inputs). Derived during render rather than in an
  // effect to avoid the cascading-render smell.
  useValueChange(state, (next) => {
    if (!next?.ok) return;
    setFullName("");
    setEmail("");
  });

  // onSaved is a parent notification (drawer close + refresh), so it stays in a
  // post-commit effect.
  useEffect(() => {
    if (state?.ok) onSaved?.();
  }, [state, onSaved]);

  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  const canSubmit = fullName.trim().length > 0 && isEmail(email.trim());

  return (
    <form
      ref={formRef}
      action={formAction}
      onChange={onDirty}
      className="grid gap-3"
    >
      {assignToGroup ? (
        <>
          <input type="hidden" name="group_id" value={assignToGroup.groupId} />
          <input type="hidden" name="kind" value="leader" />
        </>
      ) : null}
      <p className={formNoteClassName}>
        {assignToGroup
          ? `Creates a leader profile and assigns them to ${assignToGroup.groupName}. Track their care from the person's page.`
          : "Creates a leader profile in the directory. Assign them to a group and track their care from the person's page."}
      </p>
      <div className={formGridClassName}>
        <div>
          <label htmlFor="leader-full_name" className={fieldLabelClassName}>
            Full name
          </label>
          <input
            id="leader-full_name"
            name="full_name"
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="off"
            className={fieldInputClassName}
            placeholder="Julian Example"
          />
        </div>
        <div>
          <label htmlFor="leader-email" className={fieldLabelClassName}>
            Email
          </label>
          <input
            id="leader-email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            className={fieldInputClassName}
            placeholder="julian@example.com"
          />
        </div>
        <div>
          <label htmlFor="leader-phone" className={fieldLabelClassName}>
            Phone (optional)
          </label>
          <input
            id="leader-phone"
            name="phone"
            type="tel"
            autoComplete="off"
            className={fieldInputClassName}
            placeholder="(555) 123-4567"
          />
        </div>
        {assignToGroup ? (
          <div>
            <label htmlFor="leader-role" className={fieldLabelClassName}>
              Role in this group
            </label>
            <select
              id="leader-role"
              name="role"
              required
              defaultValue="leader"
              className={fieldSelectClassName}
            >
              <option value="leader">Leader</option>
              <option value="co_leader">Co-leader</option>
            </select>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2.5">
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={pending || !canSubmit}
        >
          {pending
            ? "Saving…"
            : assignToGroup
              ? "Add leader to group"
              : "Add leader"}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="md"
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </Button>
        ) : null}
      </div>
      {!canSubmit ? (
        <p className={fieldHintClassName}>
          Enter a full name and valid email to enable Add leader.
        </p>
      ) : null}
      <FormStatus
        state={state}
        successText={
          assignToGroup
            ? `Leader added to ${assignToGroup.groupName}.`
            : "Leader profile added."
        }
      />
    </form>
  );
}
