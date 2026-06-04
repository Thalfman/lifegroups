"use client";

import { PButton } from "@/components/pastoral/button";
import {
  adminAssignLeaderToGroup,
  adminAssignMemberToGroup,
} from "@/app/(protected)/admin/people/actions";
import {
  errorTextStyle,
  fieldLabelStyle,
  fieldSelectStyle,
  successTextStyle,
} from "@/components/admin/forms/field-styles";
import { useActionForm } from "@/components/admin/forms/action-form";
import { P, fontBody } from "@/lib/pastoral";

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
    <form
      ref={formRef}
      action={formAction}
      style={{ display: "grid", gap: 10 }}
    >
      <input
        type="hidden"
        name={kind === "profile" ? "profile_id" : "member_id"}
        value={personId}
      />
      <div
        className="lg-m-grid-stack"
        style={{
          display: "grid",
          gridTemplateColumns:
            kind === "profile" ? "1fr 140px auto" : "1fr auto",
          gap: 10,
          alignItems: "end",
        }}
      >
        <div>
          <label htmlFor={`assign-group-${personId}`} style={fieldLabelStyle}>
            Group
          </label>
          <select
            id={`assign-group-${personId}`}
            name="group_id"
            required
            disabled={noGroups}
            style={fieldSelectStyle}
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
            <label htmlFor={`assign-role-${personId}`} style={fieldLabelStyle}>
              Role
            </label>
            <select
              id={`assign-role-${personId}`}
              name="role"
              required
              disabled={noGroups}
              style={fieldSelectStyle}
              defaultValue="leader"
            >
              <option value="leader">Leader</option>
              <option value="co_leader">Co-leader</option>
            </select>
          </div>
        ) : null}
        <div>
          <PButton
            type="submit"
            tone="terra"
            size="sm"
            disabled={pending || noGroups}
          >
            {pending ? "Placing…" : "Place in group"}
          </PButton>
        </div>
      </div>
      {noGroups ? (
        <p
          style={{
            fontFamily: fontBody,
            color: P.ink3,
            fontSize: 12,
            margin: 0,
          }}
        >
          There are no active groups to place this person in yet.
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
      {state?.ok ? <p style={successTextStyle}>Placed in group.</p> : null}
    </form>
  );
}
