"use client";

import { useEffect, useState, useTransition } from "react";
import { PButton } from "@/components/pastoral/button";
import { Icon } from "@/components/lg/Icon";
import {
  superAdminInviteUser,
  superAdminGenerateInviteLink,
  type InviteUserSuccess,
} from "@/app/(protected)/admin/super-admin/invite-user-actions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { copyToClipboard } from "@/lib/shared/copy-to-clipboard";
import { P, fontBody, fontDisplay } from "@/lib/pastoral";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
  successTextStyle,
} from "./field-styles";
import { useActionForm, FormStatus } from "./action-form";

type InviteUserRole =
  | "ministry_admin"
  | "over_shepherd"
  | "leader"
  | "co_leader";

type GroupOption = { id: string; name: string };

const ASSIGNABLE_ROLES: { value: InviteUserRole; label: string }[] = [
  { value: "ministry_admin", label: ROLE_LABELS.ministry_admin },
  { value: "over_shepherd", label: ROLE_LABELS.over_shepherd },
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
  const { state, formAction, pending, formRef } =
    useActionForm<InviteUserSuccess>(superAdminInviteUser, {
      resetOnSuccess: true,
    });
  const [role, setRole] = useState<InviteUserRole>("leader");

  // "Copy invite link" runs outside useActionForm (it returns a credential to
  // display rather than resetting the form), so it carries its own state.
  const [linkPending, startLink] = useTransition();
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // useActionForm resets the <form> on success; the role select is React state.
  // Also clear any stale link UI so a copied link doesn't linger after the
  // email path resets the form.
  useEffect(() => {
    if (state?.ok) {
      setRole("leader");
      setInviteLink(null);
      setLinkNote(null);
      setLinkError(null);
      setCopied(false);
    }
  }, [state]);

  function handleCopyExisting() {
    if (!inviteLink) return;
    void copyToClipboard(inviteLink).then((ok) => {
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    });
  }

  function handleGenerateLink() {
    const form = formRef.current;
    // Reuse the form's native required-field validation before submitting.
    if (!form || !form.reportValidity()) return;
    setLinkError(null);
    setLinkNote(null);
    setCopied(false);
    const fd = new FormData(form);
    startLink(async () => {
      const res = await superAdminGenerateInviteLink(fd);
      if (!res.ok) {
        setInviteLink(null);
        setLinkError(res.errors.join(" "));
        return;
      }
      if (res.value.inviteLink) {
        setInviteLink(res.value.inviteLink);
        const ok = await copyToClipboard(res.value.inviteLink);
        if (ok) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      } else {
        // New-users-only: an existing login was reused, so no link exists.
        setInviteLink(null);
        setLinkNote(
          "Existing login reused — no invite link to copy. Ask them to use Forgot password to set a new password."
        );
      }
    });
  }

  const groupVisible = role === "leader" || role === "co_leader";

  return (
    <form
      ref={formRef}
      action={formAction}
      style={{ display: "grid", gap: 12 }}
    >
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
          The owner role is set up separately and can’t be selected here. Group
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
        Both create or link a real login profile. “Send invite” emails the setup
        link (needs email delivery configured); “Copy invite link” gives you a
        setup link to send yourself — use it if email isn’t set up yet.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <PButton
          type="submit"
          tone="terra"
          size="md"
          disabled={pending || linkPending}
        >
          {pending ? "Sending invite…" : "Send invite"}
        </PButton>
        <PButton
          type="button"
          tone="ghost"
          size="md"
          onClick={handleGenerateLink}
          disabled={pending || linkPending}
        >
          <Icon name="clipboard" size={16} />
          {linkPending ? "Generating link…" : "Copy invite link"}
        </PButton>
      </div>

      <FormStatus state={state} />

      {linkError ? <p style={errorTextStyle}>{linkError}</p> : null}

      {linkNote ? (
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 12,
            color: P.ink2,
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          {linkNote}
        </p>
      ) : null}

      {inviteLink ? (
        <div style={{ display: "grid", gap: 6 }}>
          <span style={successTextStyle}>
            Invite link generated and copied to your clipboard. Share it
            directly — using it sets the person&apos;s password.
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="text"
              readOnly
              value={inviteLink}
              onFocus={(e) => e.currentTarget.select()}
              style={{ ...fieldInputStyle, fontSize: 12 }}
              aria-label="Invite link"
            />
            <PButton
              type="button"
              tone="ghost"
              size="sm"
              onClick={handleCopyExisting}
            >
              <Icon name={copied ? "check" : "clipboard"} size={16} />
              {copied ? "Copied!" : "Copy"}
            </PButton>
          </div>
        </div>
      ) : null}

      {state?.ok ? (
        <div style={{ display: "grid", gap: 6 }}>
          <p style={successTextStyle}>
            Invite created for {state.value.email}. They can follow the invite
            email to set their password, or use Forgot password if the link
            expires.
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
