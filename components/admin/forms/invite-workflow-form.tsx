"use client";

import { useEffect, useState, useTransition } from "react";
import type { CSSProperties, FormEvent } from "react";
import { PButton } from "@/components/pastoral/button";
import { Icon } from "@/components/lg/Icon";
import {
  superAdminInviteUser,
  superAdminGenerateInviteLink,
  type InviteUserSuccess,
} from "@/app/(protected)/admin/super-admin/invite-user-actions";
import {
  superAdminCreateInviteLink,
  type CreateInviteLinkSuccess,
} from "@/app/(protected)/admin/super-admin/invite-link-actions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { copyToClipboard } from "@/lib/shared/copy-to-clipboard";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
  successTextStyle,
} from "./field-styles";
import { useActionForm, FormStatus } from "./action-form";

// One invite workflow with a delivery choice (#460). Merges the old
// InviteUserForm (email invite + named-person "Copy invite link") and
// InviteLinkForm (anonymous shareable link) into a single card so role and
// group are picked once. The three server actions are reused unchanged:
//   - "Send invite"    → superAdminInviteUser (named person, invite email)
//   - "Copy invite link" → superAdminGenerateInviteLink (same audited profile
//     write as the email path, but returns a copyable setup link instead)
//   - "Generate link"  → superAdminCreateInviteLink (anonymous shareable link;
//     the invited person supplies their own name/email/password)

type InviteRole = "ministry_admin" | "over_shepherd" | "leader" | "co_leader";

type Delivery = "email" | "link";

type GroupOption = { id: string; name: string };

const ASSIGNABLE_ROLES: { value: InviteRole; label: string }[] = [
  { value: "ministry_admin", label: ROLE_LABELS.ministry_admin },
  { value: "over_shepherd", label: ROLE_LABELS.over_shepherd },
  { value: "leader", label: ROLE_LABELS.leader },
  { value: "co_leader", label: ROLE_LABELS.co_leader },
];

const DELIVERY_OPTIONS: { value: Delivery; label: string }[] = [
  { value: "email", label: "Send email invite" },
  { value: "link", label: "Generate shareable link" },
];

const DELIVERY_HINTS: Record<Delivery, string> = {
  email:
    "Invite a named person: this creates their login invite and linked " +
    "profile in one audited workflow and emails them a setup link.",
  link:
    "Generate a link to share directly — no email or name needed. The " +
    "person you invite opens it and sets up their own login (name, email, " +
    "and password).",
};

const EXPIRY_OPTIONS: { value: string; label: string }[] = [
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "custom", label: "Custom date & time…" },
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

const twoColRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
  alignItems: "end",
};

const hintTextStyle: CSSProperties = {
  fontFamily: fontBody,
  fontSize: 13,
  color: P.ink2,
  margin: 0,
  lineHeight: 1.5,
};

const fineprintStyle: CSSProperties = {
  fontFamily: fontBody,
  fontSize: 12,
  color: P.ink3,
  lineHeight: 1.5,
  margin: 0,
};

function formatExpiry(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function InviteWorkflowForm({ groups }: { groups: GroupOption[] }) {
  const { state, formAction, pending, formRef } =
    useActionForm<InviteUserSuccess>(superAdminInviteUser, {
      resetOnSuccess: true,
    });

  const [delivery, setDelivery] = useState<Delivery>("email");

  // Shared across both delivery paths — picked once, never duplicated.
  const [role, setRole] = useState<InviteRole>("leader");
  const [groupId, setGroupId] = useState<string>("");

  // Named-person "Copy invite link" (email path) runs outside useActionForm
  // (it returns a credential to display rather than resetting the form), so
  // it carries its own state.
  const [namedLinkPending, startNamedLink] = useTransition();
  const [namedLink, setNamedLink] = useState<string | null>(null);
  const [namedLinkNote, setNamedLinkNote] = useState<string | null>(null);
  const [namedLinkError, setNamedLinkError] = useState<string | null>(null);
  const [namedLinkCopied, setNamedLinkCopied] = useState(false);

  // Anonymous shareable link (link path).
  const [expiryPreset, setExpiryPreset] = useState<string>("7d");
  const [customExpiry, setCustomExpiry] = useState<string>("");
  const [singleUse, setSingleUse] = useState<boolean>(true);
  const [sharePending, startShare] = useTransition();
  const [shareResult, setShareResult] =
    useState<CreateInviteLinkSuccess | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  const groupVisible = role === "leader" || role === "co_leader";

  // useActionForm resets the <form> on success; role/group are React state.
  // Also clear any stale named-link UI so a copied link doesn't linger after
  // the email path resets the form.
  useEffect(() => {
    if (state?.ok) {
      setRole("leader");
      setGroupId("");
      setNamedLink(null);
      setNamedLinkNote(null);
      setNamedLinkError(null);
      setNamedLinkCopied(false);
    }
  }, [state]);

  function handleCopyNamedLink() {
    if (!namedLink) return;
    void copyToClipboard(namedLink).then((ok) => {
      if (ok) {
        setNamedLinkCopied(true);
        setTimeout(() => setNamedLinkCopied(false), 2000);
      }
    });
  }

  function handleGenerateNamedLink() {
    const form = formRef.current;
    // Reuse the form's native required-field validation before submitting.
    if (!form || !form.reportValidity()) return;
    setNamedLinkError(null);
    setNamedLinkNote(null);
    setNamedLinkCopied(false);
    const fd = new FormData(form);
    startNamedLink(async () => {
      const res = await superAdminGenerateInviteLink(fd);
      if (!res.ok) {
        setNamedLink(null);
        setNamedLinkError(res.errors.join(" "));
        return;
      }
      if (res.value.inviteLink) {
        setNamedLink(res.value.inviteLink);
        const ok = await copyToClipboard(res.value.inviteLink);
        if (ok) {
          setNamedLinkCopied(true);
          setTimeout(() => setNamedLinkCopied(false), 2000);
        }
      } else {
        // New-users-only: an existing login was reused, so no link exists.
        setNamedLink(null);
        setNamedLinkNote(
          "Existing login reused — no invite link to copy. Ask them to use Forgot password to set a new password."
        );
      }
    });
  }

  function handleCopyShareLink(url: string) {
    void copyToClipboard(url).then((ok) => {
      if (ok) {
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      }
    });
  }

  function handleGenerateShareLink() {
    setShareError(null);
    setShareCopied(false);
    const payload: Record<string, string> = {
      role,
      expiry_preset: expiryPreset,
      single_use: singleUse ? "true" : "false",
    };
    if (groupVisible && groupId) payload.group_id = groupId;
    if (expiryPreset === "custom" && customExpiry) {
      // datetime-local yields a local wall-clock string; Date parses it in the
      // browser's zone, and the action re-serializes to an absolute ISO.
      payload.expires_at = new Date(customExpiry).toISOString();
    }

    startShare(async () => {
      const res = await superAdminCreateInviteLink(payload);
      if (!res.ok) {
        setShareResult(null);
        setShareError(res.errors.join(" "));
        return;
      }
      setShareResult(res.value);
      handleCopyShareLink(res.value.url);
    });
  }

  // The shareable-link path is not a form action; route Enter-key submissions
  // in link mode to the same handler as the "Generate link" button.
  function handleFormSubmit(e: FormEvent<HTMLFormElement>) {
    if (delivery === "link") {
      e.preventDefault();
      handleGenerateShareLink();
    }
  }

  // Shared fields, defined once and slotted into whichever layout the active
  // delivery path uses.
  const roleField = (
    <div>
      <label htmlFor="invite-workflow-role" style={fieldLabelStyle}>
        Role
      </label>
      <select
        id="invite-workflow-role"
        name="role"
        required
        value={role}
        onChange={(e) => setRole(e.target.value as InviteRole)}
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
  );

  const groupField = groupVisible ? (
    <div>
      <label htmlFor="invite-workflow-group" style={fieldLabelStyle}>
        Group assignment (optional)
      </label>
      <select
        id="invite-workflow-group"
        name="group_id"
        value={groupId}
        onChange={(e) => setGroupId(e.target.value)}
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
  ) : null;

  return (
    <form
      ref={formRef}
      action={delivery === "email" ? formAction : undefined}
      onSubmit={handleFormSubmit}
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
          Invite someone
        </h3>
        <p style={hintTextStyle}>
          Email a named person their login setup link, or generate a shareable
          link they redeem themselves — one audited workflow either way. The
          owner role is set up separately and can’t be selected here. Group
          assignment is for leaders and co-leaders only.
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Invite delivery"
        style={{
          display: "inline-flex",
          flexWrap: "wrap",
          gap: 4,
          padding: 4,
          background: P.surface,
          border: `1px solid ${P.line}`,
          borderRadius: 999,
          justifySelf: "start",
        }}
      >
        {DELIVERY_OPTIONS.map((o) => {
          const active = delivery === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setDelivery(o.value)}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                border: "none",
                background: active ? P.ink : "transparent",
                color: active ? P.surface : P.ink2,
                fontFamily: fontSans,
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      <p style={hintTextStyle}>{DELIVERY_HINTS[delivery]}</p>

      {delivery === "email" ? (
        <>
          <div className="lg-m-grid-stack" style={twoColRowStyle}>
            <div>
              <label
                htmlFor="invite-workflow-full-name"
                style={fieldLabelStyle}
              >
                Full name
              </label>
              <input
                id="invite-workflow-full-name"
                name="full_name"
                type="text"
                required
                autoComplete="off"
                style={fieldInputStyle}
                className="lg-m-input"
              />
            </div>
            <div>
              <label htmlFor="invite-workflow-email" style={fieldLabelStyle}>
                Email
              </label>
              <input
                id="invite-workflow-email"
                name="email"
                type="email"
                required
                autoComplete="off"
                style={fieldInputStyle}
                className="lg-m-input"
              />
            </div>
          </div>

          <div className="lg-m-grid-stack" style={twoColRowStyle}>
            <div>
              <label htmlFor="invite-workflow-phone" style={fieldLabelStyle}>
                Phone (optional)
              </label>
              <input
                id="invite-workflow-phone"
                name="phone"
                type="tel"
                autoComplete="off"
                style={fieldInputStyle}
                className="lg-m-input"
              />
            </div>
            {roleField}
          </div>

          {groupField}

          <p style={fineprintStyle}>
            Both buttons create or link a real login profile. “Send invite”
            emails the setup link (needs email delivery configured); “Copy
            invite link” gives you a setup link to send yourself — use it if
            email isn’t set up yet.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <PButton
              type="submit"
              tone="terra"
              size="md"
              disabled={pending || namedLinkPending}
            >
              {pending ? "Sending invite…" : "Send invite"}
            </PButton>
            <PButton
              type="button"
              tone="ghost"
              size="md"
              onClick={handleGenerateNamedLink}
              disabled={pending || namedLinkPending}
            >
              <Icon name="clipboard" size={16} />
              {namedLinkPending ? "Generating link…" : "Copy invite link"}
            </PButton>
          </div>

          <FormStatus state={state} />

          {namedLinkError ? (
            <p style={errorTextStyle}>{namedLinkError}</p>
          ) : null}

          {namedLinkNote ? (
            <p
              style={{
                fontFamily: fontBody,
                fontSize: 12,
                color: P.ink2,
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {namedLinkNote}
            </p>
          ) : null}

          {namedLink ? (
            <div style={{ display: "grid", gap: 6 }}>
              <span style={successTextStyle}>
                Invite link generated and copied to your clipboard. Share it
                directly — using it sets the person&apos;s password.
              </span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="text"
                  readOnly
                  value={namedLink}
                  onFocus={(e) => e.currentTarget.select()}
                  style={{ ...fieldInputStyle, fontSize: 12 }}
                  aria-label="Invite link"
                />
                <PButton
                  type="button"
                  tone="ghost"
                  size="sm"
                  onClick={handleCopyNamedLink}
                >
                  <Icon
                    name={namedLinkCopied ? "check" : "clipboard"}
                    size={16}
                  />
                  {namedLinkCopied ? "Copied!" : "Copy"}
                </PButton>
              </div>
            </div>
          ) : null}

          {state?.ok ? (
            <div style={{ display: "grid", gap: 6 }}>
              <p style={successTextStyle}>
                Invite created for {state.value.email}. They can follow the
                invite email to set their password, or use Forgot password if
                the link expires.
              </p>
              <p style={fineprintStyle}>
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
        </>
      ) : (
        <>
          <div className="lg-m-grid-stack" style={twoColRowStyle}>
            {roleField}
            <div>
              <label htmlFor="invite-workflow-expiry" style={fieldLabelStyle}>
                Expires
              </label>
              <select
                id="invite-workflow-expiry"
                value={expiryPreset}
                onChange={(e) => setExpiryPreset(e.target.value)}
                style={fieldSelectStyle}
                className="lg-m-input"
              >
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {expiryPreset === "custom" ? (
            <div>
              <label
                htmlFor="invite-workflow-custom-expiry"
                style={fieldLabelStyle}
              >
                Custom expiry (date & time)
              </label>
              <input
                id="invite-workflow-custom-expiry"
                type="datetime-local"
                value={customExpiry}
                onChange={(e) => setCustomExpiry(e.target.value)}
                style={fieldInputStyle}
                className="lg-m-input"
              />
            </div>
          ) : null}

          {groupField}

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontFamily: fontBody,
              fontSize: 13,
              color: P.ink2,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={singleUse}
              onChange={(e) => setSingleUse(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            One-time use (the link is spent after one person signs up). Uncheck
            to let anyone with the link join until it expires.
          </label>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <PButton
              type="submit"
              tone="terra"
              size="md"
              disabled={sharePending}
            >
              <Icon name="clipboard" size={16} />
              {sharePending ? "Generating…" : "Generate link"}
            </PButton>
          </div>

          {shareError ? <p style={errorTextStyle}>{shareError}</p> : null}

          {shareResult ? (
            <div style={{ display: "grid", gap: 6 }}>
              <span style={successTextStyle}>
                Invite link generated and copied to your clipboard. Anyone who
                opens it sets their own login as {ROLE_LABELS[shareResult.role]}
                {shareResult.singleUse
                  ? " — single use"
                  : " — reusable until it expires"}
                . Expires {formatExpiry(shareResult.expiresAt)}.
              </span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="text"
                  readOnly
                  value={shareResult.url}
                  onFocus={(e) => e.currentTarget.select()}
                  style={{ ...fieldInputStyle, fontSize: 12 }}
                  aria-label="Invite link"
                />
                <PButton
                  type="button"
                  tone="ghost"
                  size="sm"
                  onClick={() => handleCopyShareLink(shareResult.url)}
                >
                  <Icon name={shareCopied ? "check" : "clipboard"} size={16} />
                  {shareCopied ? "Copied!" : "Copy"}
                </PButton>
              </div>
            </div>
          ) : null}
        </>
      )}
    </form>
  );
}
