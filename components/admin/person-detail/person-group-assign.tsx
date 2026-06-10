"use client";

import { Button } from "@/components/ui/button";
import {
  adminAssignLeaderToGroup,
  adminAssignMemberToGroup,
} from "@/app/(protected)/admin/people/actions";
import {
  errorTextClassName,
  fieldLabelClassName,
  fieldSelectClassName,
  successTextClassName,
} from "@/components/admin/forms/field-styles";
import { useActionForm } from "@/components/admin/forms/action-form";
import { cn } from "@/lib/utils";

// Person-centric placement: the person is fixed (this detail page) and the
// admin picks a group, the inverse of the group-centric Assignments matrix.
// Leaders carry a role-in-group (leader / co-leader); members do not. This is
// how placement folds into People per the reduction plan — assignment lives on
// the person's own Group tab rather than a separate top-level Assignments view.
export function PersonGroupAssign({
  kind,
  personId,
  availableGroups,
}: {
  kind: "profile" | "member";
  personId: string;
  availableGroups: { id: string; name: string }[];
}) {
  const action =
    kind === "profile" ? adminAssignLeaderToGroup : adminAssignMemberToGroup;
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    action,
    { resetOnSuccess: true }
  );

  const noGroups = availableGroups.length === 0;

  return (
    <form ref={formRef} action={formAction} className="grid gap-2.5">
      <input
        type="hidden"
        name={kind === "profile" ? "profile_id" : "member_id"}
        value={personId}
      />
      <div
        className={cn(
          "grid grid-cols-1 items-end gap-2.5",
          kind === "profile"
            ? "md:grid-cols-[1fr_140px_auto]"
            : "md:grid-cols-[1fr_auto]"
        )}
      >
        <div>
          <label
            htmlFor={`assign-group-${personId}`}
            className={fieldLabelClassName}
          >
            Group
          </label>
          <select
            id={`assign-group-${personId}`}
            name="group_id"
            required
            disabled={noGroups}
            className={fieldSelectClassName}
            defaultValue=""
          >
            <option value="" disabled>
              {noGroups ? "No active groups yet" : "Pick a group…"}
            </option>
            {availableGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        {kind === "profile" ? (
          <div>
            <label
              htmlFor={`assign-role-${personId}`}
              className={fieldLabelClassName}
            >
              Role
            </label>
            <select
              id={`assign-role-${personId}`}
              name="role"
              required
              disabled={noGroups}
              className={fieldSelectClassName}
              defaultValue="leader"
            >
              <option value="leader">Leader</option>
              <option value="co_leader">Co-leader</option>
            </select>
          </div>
        ) : null}
        <div>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={pending || noGroups}
          >
            {pending ? "Placing…" : "Place in group"}
          </Button>
        </div>
      </div>
      {noGroups ? (
        <p className="m-0 font-sans text-xs text-ink3">
          There are no active groups to place this person in yet.
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
        <p className={successTextClassName}>Placed in group.</p>
      ) : null}
    </form>
  );
}
