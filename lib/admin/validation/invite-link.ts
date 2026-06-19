// Phase IL.1 — shareable self-signup invite link payload.
//
// The super_admin picks a role (+ optional group for leaders), an expiry, and
// whether the link is single-use. No invitee identity is collected here; the
// invited person supplies their own name/email/password when they open the
// link. Mirrors the role/group rules of validateInviteUserPayload (super-admin.ts)
// so both invite surfaces stay consistent.

import { isUuid } from "@/lib/shared/uuid";
import type { ValidationResult } from "./shared";
import { isRecord, normalizeUuid, readBooleanFlag } from "./shared";

const INVITE_LINK_ROLES: ReadonlySet<
  "ministry_admin" | "over_shepherd" | "leader" | "co_leader"
> = new Set(["ministry_admin", "over_shepherd", "leader", "co_leader"]);

// Preset durations offered by the form, in milliseconds. A "custom" choice
// instead carries an explicit ISO expiry in `expires_at`.
export const EXPIRY_PRESETS = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
} as const;

export type ExpiryPreset = keyof typeof EXPIRY_PRESETS;

// Hard ceiling matched by the DB (super_admin_create_invitation rejects
// expiries > 90 days). Kept here too so the action fails fast before the RPC.
export const MAX_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000;

export type CreateInviteLinkPayload = {
  role: "ministry_admin" | "over_shepherd" | "leader" | "co_leader";
  group_id?: string;
  single_use: boolean;
  // Resolved absolute expiry as an ISO timestamp.
  expires_at: string;
};

export function validateCreateInviteLinkPayload(
  input: unknown
): ValidationResult<CreateInviteLinkPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  const role = typeof input.role === "string" ? input.role : "";
  if (!INVITE_LINK_ROLES.has(role as CreateInviteLinkPayload["role"])) {
    errors.push(
      "Role must be Ministry Admin, Over-Shepherd, Shepherd, or Co-Shepherd."
    );
  }

  // Group only applies to leader / co_leader, mirroring the email invite form.
  const groupRaw =
    typeof input.group_id === "string" && input.group_id.trim().length > 0
      ? input.group_id.trim()
      : undefined;
  if (groupRaw !== undefined && !isUuid(groupRaw)) {
    errors.push("Group selection is invalid.");
  }
  if (groupRaw !== undefined && role !== "leader" && role !== "co_leader") {
    errors.push("Only shepherds and co-shepherds can be assigned to a group.");
  }

  // Expiry: either a known preset or a custom future ISO datetime, both
  // resolved to an absolute timestamp here.
  const presetRaw =
    typeof input.expiry_preset === "string" ? input.expiry_preset : "";
  const customRaw =
    typeof input.expires_at === "string" ? input.expires_at.trim() : "";

  let expiresAtMs: number | null = null;
  if (presetRaw === "custom") {
    if (customRaw.length === 0) {
      errors.push("Choose a custom expiry date and time.");
    } else {
      const parsed = Date.parse(customRaw);
      if (Number.isNaN(parsed)) {
        errors.push("The custom expiry date is invalid.");
      } else {
        expiresAtMs = parsed;
      }
    }
  } else if (presetRaw in EXPIRY_PRESETS) {
    expiresAtMs = Date.now() + EXPIRY_PRESETS[presetRaw as ExpiryPreset];
  } else {
    errors.push("Choose when the link should expire.");
  }

  if (expiresAtMs !== null) {
    const now = Date.now();
    // Small skew allowance so a "now-ish" custom value isn't rejected.
    if (expiresAtMs <= now + 60 * 1000) {
      errors.push("The expiry must be in the future.");
    } else if (expiresAtMs > now + MAX_EXPIRY_MS) {
      errors.push("The expiry can be at most 90 days from now.");
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const value: CreateInviteLinkPayload = {
    role: role as CreateInviteLinkPayload["role"],
    single_use: readBooleanFlag(input.single_use),
    expires_at: new Date(expiresAtMs as number).toISOString(),
  };
  if (groupRaw !== undefined) value.group_id = normalizeUuid(groupRaw);
  return { ok: true, value };
}
