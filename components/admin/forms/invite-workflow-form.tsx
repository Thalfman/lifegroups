"use client";

import { useEffect, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { useValueChange } from "@/lib/hooks/use-value-change";
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
import { cn } from "@/lib/utils";
import {
  errorTextClassName,
  fieldInputClassName,
  fieldLabelClassName,
  fieldSelectClassName,
  successTextClassName,
} from "./field-styles";
import { useActionForm, FormStatus } from "./action-form";
import { Button } from "@/components/ui/button";

// One invite workflow with a delivery choice (#460). Merges the old
// InviteUserForm (email invite + "Copy invite link") and InviteLinkForm
// (anonymous shareable link) into a single card so role and group are picked
// once. The invitee chooses their own name in every path (ADR 0032) — the
// email path collects it at the password-setup screen, the shareable link at
// self-signup. The three server actions:
//   - "Send invite"    → superAdminInviteUser (known email, invite email)
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
    "Invite someone by email: this creates their login invite and linked " +
    "profile in one audited workflow and emails them a setup link. They " +
    "choose their own name when they set their password.",
  link:
    "Generate a link to share directly, no email or name needed. The " +
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

const TWO_COL_ROW = "grid grid-cols-1 items-end gap-3 md:grid-cols-2";

const HINT_TEXT = "m-0 font-sans text-sm text-ink2";

const FINEPRINT = "m-0 font-sans text-xs text-ink3";

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
  // the email path resets the form. Derived during render rather than in an
  // effect to avoid the cascading-render smell.
  useValueChange(state, (next) => {
    if (next?.ok) {
      setRole("leader");
      setGroupId("");
      setNamedLink(null);
      setNamedLinkNote(null);
      setNamedLinkError(null);
      setNamedLinkCopied(false);
    }
  });

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
          "Existing login reused: no invite link to copy. Ask them to use Forgot password to set a new password."
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
      <label htmlFor="invite-workflow-role" className={fieldLabelClassName}>
        Role
      </label>
      <select
        id="invite-workflow-role"
        name="role"
        required
        value={role}
        onChange={(e) => setRole(e.target.value as InviteRole)}
        className={cn(fieldSelectClassName, "lg-m-input")}
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
      <label htmlFor="invite-workflow-group" className={fieldLabelClassName}>
        Group assignment (optional)
      </label>
      <select
        id="invite-workflow-group"
        name="group_id"
        value={groupId}
        onChange={(e) => setGroupId(e.target.value)}
        className={cn(fieldSelectClassName, "lg-m-input")}
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
      className="grid gap-3"
    >
      <div>
        <h3 className="m-0 mb-1 font-display text-lg font-medium text-ink">
          Invite someone
        </h3>
        <p className={HINT_TEXT}>
          Email someone their login setup link, or generate a shareable link
          they redeem themselves; one audited workflow either way, and they
          choose their own name. The owner role is set up separately and can’t
          be selected here. Group assignment is for leaders and co-leaders only.
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Invite delivery"
        className="inline-flex flex-wrap gap-1 justify-self-start rounded-pill border border-line bg-sidebar p-1"
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
              className={cn(
                "cursor-pointer rounded-pill border px-3.5 py-2 font-sans text-sm font-medium leading-tight transition-colors duration-150",
                active
                  ? "border-line bg-surface font-semibold text-ink"
                  : "border-transparent bg-transparent text-ink2 hover:bg-surface/60"
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      <p className={HINT_TEXT}>{DELIVERY_HINTS[delivery]}</p>

      {delivery === "email" ? (
        <>
          <div className={TWO_COL_ROW}>
            <div>
              <label
                htmlFor="invite-workflow-email"
                className={fieldLabelClassName}
              >
                Email
              </label>
              <input
                id="invite-workflow-email"
                name="email"
                type="email"
                required
                autoComplete="off"
                className={cn(fieldInputClassName, "lg-m-input")}
              />
            </div>
            <div>
              <label
                htmlFor="invite-workflow-phone"
                className={fieldLabelClassName}
              >
                Phone (optional)
              </label>
              <input
                id="invite-workflow-phone"
                name="phone"
                type="tel"
                autoComplete="off"
                className={cn(fieldInputClassName, "lg-m-input")}
              />
            </div>
          </div>

          <div className={TWO_COL_ROW}>
            {roleField}
            {groupField}
          </div>

          <p className={FINEPRINT}>
            Both buttons create or link a real login profile. “Send invite”
            emails the setup link (needs email delivery configured); “Copy
            invite link” gives you a setup link to send yourself. Use it if
            email isn’t set up yet.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={pending || namedLinkPending}
            >
              {pending ? "Sending invite…" : "Send invite"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={handleGenerateNamedLink}
              disabled={pending || namedLinkPending}
            >
              <Icon name="clipboard" size={16} />
              {namedLinkPending ? "Generating link…" : "Copy invite link"}
            </Button>
          </div>

          <FormStatus state={state} />

          {namedLinkError ? (
            <p className={errorTextClassName}>{namedLinkError}</p>
          ) : null}

          {namedLinkNote ? (
            <p className="m-0 font-sans text-xs text-ink2">{namedLinkNote}</p>
          ) : null}

          {namedLink ? (
            <div className="grid gap-1.5">
              <span className={successTextClassName}>
                Invite link generated and copied to your clipboard. Share it
                directly. Using it, the person chooses their name and sets their
                password.
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={namedLink}
                  onFocus={(e) => e.currentTarget.select()}
                  className={cn(fieldInputClassName, "text-xs")}
                  aria-label="Invite link"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyNamedLink}
                >
                  <Icon
                    name={namedLinkCopied ? "check" : "clipboard"}
                    size={16}
                  />
                  {namedLinkCopied ? "Copied!" : "Copy"}
                </Button>
              </div>
            </div>
          ) : null}

          {state?.ok ? (
            <div className="grid gap-1.5">
              <p className={successTextClassName}>
                Invite created for {state.value.email}. They can follow the
                invite email to choose their name and set their password, or use
                Forgot password if the link expires.
              </p>
              <p className={FINEPRINT}>
                {AUTH_USER_LABELS[state.value.authUserState]};{" "}
                {GROUP_ASSIGNMENT_LABELS[state.value.groupAssignmentState]}.
              </p>
              {state.value.warnings.length > 0 ? (
                <ul className="m-0 grid list-disc gap-1 pl-[18px]">
                  {state.value.warnings.map((w, i) => (
                    <li key={i} className="font-sans text-xs text-ink2">
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
          <div className={TWO_COL_ROW}>
            {roleField}
            <div>
              <label
                htmlFor="invite-workflow-expiry"
                className={fieldLabelClassName}
              >
                Expires
              </label>
              <select
                id="invite-workflow-expiry"
                value={expiryPreset}
                onChange={(e) => setExpiryPreset(e.target.value)}
                className={cn(fieldSelectClassName, "lg-m-input")}
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
                className={fieldLabelClassName}
              >
                Custom expiry (date & time)
              </label>
              <input
                id="invite-workflow-custom-expiry"
                type="datetime-local"
                value={customExpiry}
                onChange={(e) => setCustomExpiry(e.target.value)}
                className={cn(fieldInputClassName, "lg-m-input")}
              />
            </div>
          ) : null}

          {groupField}

          <label className="flex cursor-pointer items-center gap-2 font-sans text-sm text-ink2">
            <input
              type="checkbox"
              checked={singleUse}
              onChange={(e) => setSingleUse(e.target.checked)}
              className="h-4 w-4"
            />
            One-time use (the link is spent after one person signs up). Uncheck
            to let anyone with the link join until it expires.
          </label>

          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={sharePending}
            >
              <Icon name="clipboard" size={16} />
              {sharePending ? "Generating…" : "Generate link"}
            </Button>
          </div>

          {shareError ? (
            <p className={errorTextClassName}>{shareError}</p>
          ) : null}

          {shareResult ? (
            <div className="grid gap-1.5">
              <span className={successTextClassName}>
                Invite link generated and copied to your clipboard. Anyone who
                opens it sets their own login as {ROLE_LABELS[shareResult.role]}
                {shareResult.singleUse
                  ? ", single use"
                  : ", reusable until it expires"}
                . Expires {formatExpiry(shareResult.expiresAt)}.
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareResult.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className={cn(fieldInputClassName, "text-xs")}
                  aria-label="Invite link"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopyShareLink(shareResult.url)}
                >
                  <Icon name={shareCopied ? "check" : "clipboard"} size={16} />
                  {shareCopied ? "Copied!" : "Copy"}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </form>
  );
}
