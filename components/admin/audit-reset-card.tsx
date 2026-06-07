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
import {
  DangerCard,
  DangerSection,
} from "@/components/admin/danger-zone-card-shell";
import { P, fontSans } from "@/lib/pastoral";

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
    <DangerCard
      title="Reset audit log"
      intro="Archives the current audit events to a backup, then clears the live audit log. Independent of Clean Slate. The reset itself is recorded as a fresh audit entry."
    >
      <DangerSection
        variant="destructive"
        label="Archive & clear"
        status={{ label: "Requires confirmation", tone: "confirm" }}
      >
        <div
          style={{
            fontFamily: fontSans,
            fontSize: 12,
            color: P.ink2,
            border: `1px solid ${P.line}`,
            borderRadius: 8,
            background: P.bgDeep,
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
      </DangerSection>
    </DangerCard>
  );
}
