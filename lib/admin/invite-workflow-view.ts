// Pure view model for the invite workflow card (#460): the state choreography
// of components/admin/forms/invite-workflow-form.tsx — delivery routing, the
// share-link payload assembly, and the settlement of the two imperative
// server-action calls — extracted so the branching is unit-testable without
// rendering (the confirm-action-view move; ADR 0039). No React, no I/O: the
// shell keeps the hooks, clipboard, and JSX and projects these values.

import type { ActionResult } from "@/lib/shared/action-result";
import type { ActionFormState } from "@/lib/forms/action-form-view";
import type { InviteUserPayload } from "@/lib/admin/validation";
import { ROLE_LABELS } from "@/lib/auth/roles";

export type InviteRole =
  | "ministry_admin"
  | "over_shepherd"
  | "leader"
  | "co_leader";

export type InviteDelivery = "email" | "link";

export type InviteGroupOption = { id: string; name: string };

// Success payload of superAdminInviteUser / superAdminGenerateInviteLink.
// Declared here (not in the "use server" module) so the view model never
// imports from app/; the action file re-exports it unchanged.
export type InviteUserSuccess = {
  profileId: string;
  email: string;
  role: InviteUserPayload["role"];
  authUserState: "invited" | "existing_reused";
  groupAssignmentState: "none" | "created" | "reactivated" | "already_active";
  // Present only on the "link" delivery path for a newly-invited user; the
  // copyable invite action_link. Absent when an existing login is reused.
  inviteLink?: string;
  warnings: string[];
};

// Success payload of superAdminCreateInviteLink (same re-homing note).
export type CreateInviteLinkSuccess = {
  url: string;
  role: InviteRole;
  singleUse: boolean;
  expiresAt: string;
};

export const ASSIGNABLE_ROLES: { value: InviteRole; label: string }[] = [
  { value: "ministry_admin", label: ROLE_LABELS.ministry_admin },
  { value: "over_shepherd", label: ROLE_LABELS.over_shepherd },
  { value: "leader", label: ROLE_LABELS.leader },
  { value: "co_leader", label: ROLE_LABELS.co_leader },
];

export const DELIVERY_OPTIONS: { value: InviteDelivery; label: string }[] = [
  { value: "email", label: "Send email invite" },
  { value: "link", label: "Generate shareable link" },
];

export const DELIVERY_HINTS: Record<InviteDelivery, string> = {
  email:
    "Invite someone by email: this creates their login invite and linked " +
    "profile in one audited workflow and emails them a setup link. They " +
    "choose their own name when they set their password.",
  link:
    "Generate a link to share directly, no email or name needed. The " +
    "person you invite opens it and sets up their own login (name, email, " +
    "and password).",
};

export const EXPIRY_OPTIONS: { value: string; label: string }[] = [
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "custom", label: "Custom date & time…" },
];

export const GROUP_ASSIGNMENT_LABELS: Record<
  InviteUserSuccess["groupAssignmentState"],
  string
> = {
  none: "no group assignment",
  created: "group assignment created",
  reactivated: "group assignment reactivated",
  already_active: "group assignment already active",
};

export const AUTH_USER_LABELS: Record<
  InviteUserSuccess["authUserState"],
  string
> = {
  invited: "invite email sent",
  existing_reused: "existing login reused",
};

export function formatExpiry(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// Group assignment applies to the two group-scoped roles only.
export function inviteGroupVisible(role: InviteRole): boolean {
  return role === "leader" || role === "co_leader";
}

// The email path submits through the form action; the shareable-link path is
// not a form action, so Enter-key submissions route to the generate handler.
export type InviteSubmitRoute = "form_action" | "share_link";

export function inviteSubmitRoute(delivery: InviteDelivery): InviteSubmitRoute {
  return delivery === "link" ? "share_link" : "form_action";
}

// Assemble the superAdminCreateInviteLink payload from the link-path state:
// group_id only when the role is group-assignable and a group is picked, and
// expires_at only when the custom preset carries a value. datetime-local
// yields a local wall-clock string; Date parses it in the browser's zone, and
// the action re-serializes to an absolute ISO.
export function shareLinkPayload(args: {
  role: InviteRole;
  groupId: string;
  expiryPreset: string;
  customExpiry: string;
  singleUse: boolean;
}): Record<string, string> {
  const payload: Record<string, string> = {
    role: args.role,
    expiry_preset: args.expiryPreset,
    single_use: args.singleUse ? "true" : "false",
  };
  if (inviteGroupVisible(args.role) && args.groupId) {
    payload.group_id = args.groupId;
  }
  if (args.expiryPreset === "custom" && args.customExpiry) {
    payload.expires_at = new Date(args.customExpiry).toISOString();
  }
  return payload;
}

// Settle a superAdminGenerateInviteLink result. "existing_reused" is the
// new-users-only branch: an existing login was reused, so no link exists.
export type NamedLinkOutcome =
  | { kind: "error"; message: string }
  | { kind: "link"; url: string }
  | { kind: "existing_reused"; note: string };

export function namedLinkOutcome(
  res: ActionResult<InviteUserSuccess>
): NamedLinkOutcome {
  if (!res.ok) return { kind: "error", message: res.errors.join(" ") };
  if (res.value.inviteLink) return { kind: "link", url: res.value.inviteLink };
  return {
    kind: "existing_reused",
    note: "Existing login reused: no invite link to copy. Ask them to use Forgot password to set a new password.",
  };
}

// Settle a superAdminCreateInviteLink result.
export type ShareLinkOutcome =
  | { kind: "error"; message: string }
  | { kind: "created"; value: CreateInviteLinkSuccess };

export function shareLinkOutcome(
  res: ActionResult<CreateInviteLinkSuccess>
): ShareLinkOutcome {
  if (!res.ok) return { kind: "error", message: res.errors.join(" ") };
  return { kind: "created", value: res.value };
}

// useActionForm resets the <form> on success; role/group are React state, so
// the shell applies these values (and clears the named-link UI) when the
// email-path action lands ok. Null means "no reset".
export function inviteEmailSuccessReset(
  state: ActionFormState<InviteUserSuccess>
): { role: InviteRole; groupId: string } | null {
  return state?.ok ? { role: "leader", groupId: "" } : null;
}

export type InviteWorkflowButtonsView = {
  sendInvite: { label: string; disabled: boolean };
  copyInviteLink: { label: string; disabled: boolean };
  generateShareLink: { label: string; disabled: boolean };
};

// The email-path buttons gate on each other (one profile write at a time);
// the link path pends independently.
export function inviteWorkflowButtonsView(args: {
  emailPending: boolean;
  namedLinkPending: boolean;
  sharePending: boolean;
}): InviteWorkflowButtonsView {
  const emailDisabled = args.emailPending || args.namedLinkPending;
  return {
    sendInvite: {
      label: args.emailPending ? "Sending invite…" : "Send invite",
      disabled: emailDisabled,
    },
    copyInviteLink: {
      label: args.namedLinkPending ? "Generating link…" : "Copy invite link",
      disabled: emailDisabled,
    },
    generateShareLink: {
      label: args.sharePending ? "Generating…" : "Generate link",
      disabled: args.sharePending,
    },
  };
}

// The fineprint under the email-path success message.
export function inviteResultLine(value: InviteUserSuccess): string {
  return `${AUTH_USER_LABELS[value.authUserState]}; ${
    GROUP_ASSIGNMENT_LABELS[value.groupAssignmentState]
  }.`;
}

// The share-path success line, including the single-use wording.
export function shareLinkDescription(value: CreateInviteLinkSuccess): string {
  const usage = value.singleUse
    ? ", single use"
    : ", reusable until it expires";
  return (
    "Invite link generated and copied to your clipboard. Anyone who opens " +
    `it sets their own login as ${ROLE_LABELS[value.role]}${usage}. ` +
    `Expires ${formatExpiry(value.expiresAt)}.`
  );
}
