"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import {
  superAdminInviteUser,
  type InviteUserSuccess,
} from "@/app/(protected)/admin/super-admin/invite-user-actions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { P, fontBody, fontDisplay } from "@/lib/pastoral";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
  successTextStyle,
} from "./field-styles";
import type { ActionResult } from "@/lib/admin/action-result";

type InviteUserRole = "ministry_admin" | "leader" | "co_leader";

type GroupOption = { id: string; name: string };

type State = ActionResult<InviteUserSuccess> | undefined;

const ASSIGNABLE_ROLES: { value: InviteUserRole; label: string }[] = [
  { value: "ministry_admin", label: ROLE_LABELS.ministry_admin },
  { value: "leader", label: ROLE_LABELS.leader },
  { value: "co_leader", label: ROLE_LABELS.co_leader },
];

const GROUP_ASSIGNMENT_LABELS: Record<
  InviteUserSuccess["groupAssignmentState"],
  string
> = {
  none: "no group assignment",
  created: "group assignment created",
  reactivated: "group assignment reactivated",
  already_active: "group assignment already active",
};

const AUTH_USER_LABELS: Record<InviteUserSuccess["authUserState"], string> = {
  invited: "invite email sent",
  existing_reused: "existing login reused",
};

export function InviteUserForm({ groups }: { groups: GroupOption[] }) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    superAdminInviteUser,
    undefined,
  );
  const [role, setRole] = useState<InviteUserRole>("leader");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setRole("leader");
    }
  }, [state]);

  const groupVisible = role === "leader" || role === "co_leader";

  return (
    <form ref={formRef} action={formAction} style={{ display: "grid", gap: 12 }}>
      <div>
        <h3
          style={{
            fontFamily: fontDisplay,
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: -0.2,
            color: P.ink,
            margin: "0 0 4px",
          }}
        >
          Invite user
        </h3>
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Create the login invite and linked profile in one audited workflow.
          super_admin is bootstrap-only and is not selectable here. Group
          assignment is for leaders and co-leaders only.
        </p>
      </div>

      <div
        className="lg-m-grid-stack"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          alignItems: "end",
        }}
      >
        <div>
          <label htmlFor="invite-user-full-name" style={fieldLabelStyle}>
            Full name
          </label>
          <input
            id="invite-user-full-name"
            name="full_name"
            type="text"
            required
            autoComplete="off"
            style={fieldInputStyle}
            className="lg-m-input"
          />
        </div>
        <div>
          <label htmlFor="invite-user-email" style={fieldLabelStyle}>
            Email
          </label>
          <input
            id="invite-user-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            style={fieldInputStyle}
            className="lg-m-input"
          />
        </div>
      </div>

      <div
        className="lg-m-grid-stack"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          alignItems: "end",
        }}
      >
        <div>
          <label htmlFor="invite-user-phone" style={fieldLabelStyle}>
            Phone (optional)
          </label>
          <input
            id="invite-user-phone"
            name="phone"
            type="tel"
            autoComplete="off"
            style={fieldInputStyle}
            className="lg-m-input"
          />
        </div>
        <div>
          <label htmlFor="invite-user-role" style={fieldLabelStyle}>
            Role
          </label>
          <select
            id="invite-user-role"
            name="role"
            required
            value={role}
            onChange={(e) => setRole(e.target.value as InviteUserRole)}
            style={fieldSelectStyle}
            className="lg-m-input"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {groupVisible ? (
        <div>
          <label htmlFor="invite-user-group" style={fieldLabelStyle}>
            Group assignment (optional)
          </label>
          <select
            id="invite-user-group"
            name="group_id"
            defaultValue=""
            style={fieldSelectStyle}
            className="lg-m-input"
          >
            <option value="">No group assignment</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <p
        style={{
          fontFamily: fontBody,
          fontSize: 12,
          color: P.ink3,
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        This sends a real invite and creates or links a real login profile.
      </p>

      <div>
        <PButton type="submit" tone="terra" size="md" disabled={pending}>
          {pending ? "Sending invite…" : "Send invite"}
        </PButton>
      </div>

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

      {state?.ok ? (
        <div style={{ display: "grid", gap: 6 }}>
          <p style={successTextStyle}>
            Invite created for {state.value.email}. They can follow the invite
            email, or use Forgot password if the link expires.
          </p>
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 12,
              color: P.ink3,
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {AUTH_USER_LABELS[state.value.authUserState]};{" "}
            {GROUP_ASSIGNMENT_LABELS[state.value.groupAssignmentState]}.
          </p>
          {state.value.warnings.length > 0 ? (
            <ul
              style={{
                listStyle: "disc",
                paddingLeft: 18,
                margin: 0,
                display: "grid",
                gap: 4,
              }}
            >
              {state.value.warnings.map((w, i) => (
                <li
                  key={i}
                  style={{
                    fontFamily: fontBody,
                    fontSize: 12,
                    color: P.ink2,
                  }}
                >
                  {w}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
