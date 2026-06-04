"use client";

import { useState, useTransition } from "react";
import { PButton } from "@/components/pastoral/button";
import { Icon } from "@/components/lg/Icon";
import {
  superAdminCreateInviteLink,
  type CreateInviteLinkSuccess,
} from "@/app/(protected)/admin/super-admin/invite-link-actions";
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

type InviteLinkRole =
  | "ministry_admin"
  | "over_shepherd"
  | "leader"
  | "co_leader";

type GroupOption = { id: string; name: string };

const ASSIGNABLE_ROLES: { value: InviteLinkRole; label: string }[] = [
  { value: "ministry_admin", label: ROLE_LABELS.ministry_admin },
  { value: "over_shepherd", label: ROLE_LABELS.over_shepherd },
  { value: "leader", label: ROLE_LABELS.leader },
  { value: "co_leader", label: ROLE_LABELS.co_leader },
];

const EXPIRY_OPTIONS: { value: string; label: string }[] = [
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "custom", label: "Custom date & time…" },
];

function formatExpiry(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function InviteLinkForm({ groups }: { groups: GroupOption[] }) {
  const [role, setRole] = useState<InviteLinkRole>("leader");
  const [groupId, setGroupId] = useState<string>("");
  const [expiryPreset, setExpiryPreset] = useState<string>("7d");
  const [customExpiry, setCustomExpiry] = useState<string>("");
  const [singleUse, setSingleUse] = useState<boolean>(true);

  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<CreateInviteLinkSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const groupVisible = role === "leader" || role === "co_leader";

  function handleCopy(url: string) {
    void copyToClipboard(url).then((ok) => {
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    });
  }

  function handleGenerate() {
    setError(null);
    setCopied(false);
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

    startTransition(async () => {
      const res = await superAdminCreateInviteLink(payload);
      if (!res.ok) {
        setResult(null);
        setError(res.errors.join(" "));
        return;
      }
      setResult(res.value);
      handleCopy(res.value.url);
    });
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
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
          Shareable invite link
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
          Generate a link to share directly — no email or name needed. The
          person you invite opens it and sets up their own login (name, email,
          and password). Pick the role, group, and when the link expires.
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
          <label htmlFor="invite-link-role" style={fieldLabelStyle}>
            Role
          </label>
          <select
            id="invite-link-role"
            value={role}
            onChange={(e) => setRole(e.target.value as InviteLinkRole)}
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
        <div>
          <label htmlFor="invite-link-expiry" style={fieldLabelStyle}>
            Expires
          </label>
          <select
            id="invite-link-expiry"
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
          <label htmlFor="invite-link-custom-expiry" style={fieldLabelStyle}>
            Custom expiry (date & time)
          </label>
          <input
            id="invite-link-custom-expiry"
            type="datetime-local"
            value={customExpiry}
            onChange={(e) => setCustomExpiry(e.target.value)}
            style={fieldInputStyle}
            className="lg-m-input"
          />
        </div>
      ) : null}

      {groupVisible ? (
        <div>
          <label htmlFor="invite-link-group" style={fieldLabelStyle}>
            Group assignment (optional)
          </label>
          <select
            id="invite-link-group"
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
      ) : null}

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
        One-time use (the link is spent after one person signs up). Uncheck to
        let anyone with the link join until it expires.
      </label>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <PButton
          type="button"
          tone="terra"
          size="md"
          onClick={handleGenerate}
          disabled={pending}
        >
          <Icon name="clipboard" size={16} />
          {pending ? "Generating…" : "Generate invite link"}
        </PButton>
      </div>

      {error ? <p style={errorTextStyle}>{error}</p> : null}

      {result ? (
        <div style={{ display: "grid", gap: 6 }}>
          <span style={successTextStyle}>
            Invite link generated and copied to your clipboard. Anyone who opens
            it sets their own login as {ROLE_LABELS[result.role]}
            {result.singleUse
              ? " — single use"
              : " — reusable until it expires"}
            . Expires {formatExpiry(result.expiresAt)}.
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="text"
              readOnly
              value={result.url}
              onFocus={(e) => e.currentTarget.select()}
              style={{ ...fieldInputStyle, fontSize: 12 }}
              aria-label="Invite link"
            />
            <PButton
              type="button"
              tone="ghost"
              size="sm"
              onClick={() => handleCopy(result.url)}
            >
              <Icon name={copied ? "check" : "clipboard"} size={16} />
              {copied ? "Copied!" : "Copy"}
            </PButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
