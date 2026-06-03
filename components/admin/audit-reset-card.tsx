"use client";

// PRD-SAC6 Feature 3 (#290): the Danger-Zone audit-log reset card. Standalone
// (independent of Clean Slate): shows the current audit_events row count and
// gates an archive-then-purge behind a RESET AUDIT LOGS type-to-confirm phrase
// (re-checked server-side). The prior rows are archived before the purge, so
// the action is reversible.

import { useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { superAdminResetAuditLogs } from "@/app/(protected)/admin/super-admin/audit-reset-actions";
import { AUDIT_RESET_CONFIRM_PHRASE } from "@/lib/admin/danger-zone";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import {
  fieldInputClass,
  fieldInputStyle,
  fieldLabelStyle,
  successTextStyle,
} from "@/components/admin/forms/field-styles";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";

export function AuditResetCard({
  auditEventCount,
}: {
  auditEventCount: number | null;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    superAdminResetAuditLogs
  );
  const [confirm, setConfirm] = useState("");

  const phraseMatches = confirm.trim() === AUDIT_RESET_CONFIRM_PHRASE;

  return (
    <div
      style={{
        background: P.terraSoft,
        border: `1px solid ${P.terra}`,
        borderRadius: 10,
        padding: "18px 22px",
        display: "grid",
        gap: 12,
      }}
    >
      <h3
        style={{
          fontFamily: fontDisplay,
          fontSize: 18,
          fontWeight: 600,
          color: P.ink,
          margin: 0,
        }}
      >
        Reset audit log
      </h3>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          color: P.terraTextStrong,
          lineHeight: 1.55,
          margin: 0,
        }}
      >
        Archives the current audit events to a backup table, then purges the
        live audit log. Reversible from the archive; the purge itself is
        recorded as a fresh audit entry. Independent of Clean Slate.
      </p>

      <div
        style={{
          fontFamily: fontSans,
          fontSize: 12,
          color: P.ink2,
          border: `1px solid ${P.line}`,
          borderRadius: 8,
          background: P.surface,
          padding: "10px 12px",
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <span>Current audit events</span>
        <strong style={{ color: P.ink }}>
          {auditEventCount === null ? "unknown" : auditEventCount}
        </strong>
      </div>

      <form action={formAction} style={{ display: "grid", gap: 10 }}>
        <div>
          <label htmlFor="audit-reset-confirm" style={fieldLabelStyle}>
            Type {AUDIT_RESET_CONFIRM_PHRASE} to confirm
          </label>
          <input
            id="audit-reset-confirm"
            name="confirm"
            type="text"
            autoComplete="off"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={AUDIT_RESET_CONFIRM_PHRASE}
            className={fieldInputClass}
            style={fieldInputStyle}
          />
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <PButton
            type="submit"
            tone="terra"
            size="md"
            disabled={pending || !phraseMatches}
          >
            {pending ? "Resetting…" : "Reset audit log"}
          </PButton>
          {state?.ok ? (
            <span style={successTextStyle}>
              Audit log reset. Prior events were archived.
            </span>
          ) : null}
        </div>
        <FormStatus state={state} />
      </form>
    </div>
  );
}
