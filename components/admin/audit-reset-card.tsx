"use client";

// PRD-SAC6 Feature 3 (#290): the Danger-Zone audit-log reset card. Standalone
// (independent of Clean Slate): shows the current audit_events row count and
// gates an archive-then-purge behind a RESET AUDIT LOGS type-to-confirm phrase
// (re-checked server-side). The prior rows are archived before the purge, so
// the action is reversible.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { superAdminResetAuditLogs } from "@/app/(protected)/admin/super-admin/audit-reset-actions";
import { AUDIT_RESET_CONFIRM_PHRASE } from "@/lib/admin/danger-zone";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import {
  fieldInputClassName,
  fieldLabelClassName,
  successTextClassName,
} from "@/components/admin/forms/field-styles";
import {
  DangerCard,
  DangerSection,
} from "@/components/admin/danger-zone-card-shell";

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
        <div className="flex justify-between gap-3 rounded-sm border border-line bg-surfaceAlt px-3 py-2.5 font-sans text-xs text-ink2">
          <span>Current audit events</span>
          <strong className="text-ink">
            {auditEventCount === null ? "unknown" : auditEventCount}
          </strong>
        </div>

        <form action={formAction} className="grid gap-2.5">
          <div>
            <label
              htmlFor="audit-reset-confirm"
              className={fieldLabelClassName}
            >
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
              className={fieldInputClassName}
            />
          </div>
          <div className="flex items-center gap-2.5">
            <Button
              type="submit"
              variant="destructive"
              size="md"
              disabled={pending || !phraseMatches}
            >
              {pending ? "Resetting…" : "Reset audit log"}
            </Button>
            {state?.ok ? (
              <span className={successTextClassName}>
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
