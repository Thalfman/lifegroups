"use client";

import { PButton } from "@/components/pastoral/button";
import { superAdminUpdateProfileRole } from "@/app/(protected)/admin/super-admin/actions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import {
  fieldLabelClassName,
  fieldSelectClassName,
  formNoteClassName,
} from "./field-styles";
import type { UserRole } from "@/types/enums";
import { useActionForm, FormStatus } from "./action-form";

// Any active profile whose current role is NOT super_admin can be the
// target of a role change.
type AssignableProfile = {
  id: string;
  full_name: string;
  email: string;
  current_role: Exclude<UserRole, "super_admin">;
};

// Roles the super admin is allowed to assign through the UI. super_admin
// is omitted (bootstrap procedure only); the legacy no-access role is
// omitted by validator and never appears in the select.
const ASSIGNABLE_ROLES = [
  { value: "ministry_admin", label: ROLE_LABELS.ministry_admin },
  { value: "over_shepherd", label: ROLE_LABELS.over_shepherd },
  { value: "leader", label: ROLE_LABELS.leader },
  { value: "co_leader", label: ROLE_LABELS.co_leader },
] as const;

export function RoleChangeForm({
  profiles,
}: {
  profiles: AssignableProfile[];
}) {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    superAdminUpdateProfileRole,
    { resetOnSuccess: true }
  );

  const noOptions = profiles.length === 0;

  return (
    <form ref={formRef} action={formAction} className="grid gap-3">
      <p className={formNoteClassName}>
        Change a profile&rsquo;s role. The owner role is set up separately and
        can&rsquo;t be assigned here. You can&rsquo;t change your own role here;
        every change records an audit event.
      </p>
      {/* Profile gets the flexible column (with a real minimum so names +
          roles stay readable); New role a fixed readable width; the submit
          button sits at the end of the same row, aligned to the field
          baseline; the grid collapses to one column on small screens. */}
      <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(240px,1fr)_minmax(180px,220px)_auto]">
        <div>
          <label htmlFor="role-change-profile" className={fieldLabelClassName}>
            Profile
          </label>
          <select
            id="role-change-profile"
            name="profile_id"
            required
            disabled={noOptions}
            className={fieldSelectClassName}
            defaultValue=""
          >
            <option value="" disabled>
              {noOptions ? "No eligible profiles" : "Pick a profile…"}
            </option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} &mdash; {ROLE_LABELS[p.current_role]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="role-change-role" className={fieldLabelClassName}>
            New role
          </label>
          <select
            id="role-change-role"
            name="new_role"
            required
            disabled={noOptions}
            className={fieldSelectClassName}
            defaultValue=""
          >
            <option value="" disabled>
              Pick a role…
            </option>
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <PButton
            type="submit"
            tone="terra"
            size="md"
            disabled={pending || noOptions}
          >
            {pending ? "Saving…" : "Change role"}
          </PButton>
        </div>
      </div>
      {noOptions ? (
        <p className="m-0 font-sans text-xs text-ink3">
          No active non-super-admin profiles exist yet. Add a leader or ministry
          admin via Manage People first.
        </p>
      ) : null}
      <FormStatus state={state} successText="Role updated." />
    </form>
  );
}

export type { AssignableProfile };
