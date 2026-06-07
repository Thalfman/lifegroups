"use client";

// ADR 0014 (SAD9): the Super-Admin-only inline Delete control. A small ghost
// "Delete" button that opens a quick confirm popover — no type-to-confirm phrase
// (that heavier gate stays on the danger-zone card). On open it previews what the
// delete would do via the existing preflight (blockers / confidential / "safe to
// delete"), then a one-click Delete runs the lighter superAdminInlineDelete
// action. Every guard is re-checked server-side in the action AND the SECURITY
// DEFINER RPC, so the locked records (care notes, prayer requests, audit logs,
// tombstones, super-admin profiles) can never be removed through it.
//
// Render gating is the CALLER's job: surfaces render this only when the viewer is
// super_admin. The server re-gate is the authoritative backstop.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PButton } from "@/components/pastoral/button";
import {
  superAdminInlineDelete,
  superAdminPermanentDeletePreflight,
} from "@/app/(protected)/admin/super-admin/permanent-delete-actions";
import type {
  DeletionPreflight,
  PermanentDeleteSuccess,
} from "@/lib/admin/danger-zone";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import { successTextStyle } from "@/components/admin/forms/field-styles";
import { P, fontBody, fontSans } from "@/lib/pastoral";

export function SuperAdminInlineDelete({
  entityType,
  id,
  label,
  path,
}: {
  entityType: string;
  id: string;
  label: string;
  path?: string;
}) {
  const pathname = usePathname();
  const revalidatePath = path ?? pathname ?? "";
  const [open, setOpen] = useState(false);

  const preflight = useActionForm<DeletionPreflight>(
    superAdminPermanentDeletePreflight
  );
  const del = useActionForm<PermanentDeleteSuccess>(superAdminInlineDelete);

  // Preview the delete the moment the popover opens — keyed on `open`, so it
  // fires once per open and not on the re-renders the preflight state triggers.
  useEffect(() => {
    if (open) preflight.formRef.current?.requestSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The preflight report only describes the row it ran for — stamped with its
  // target, so a stale report for another row can never gate this delete.
  const report =
    preflight.state?.ok &&
    preflight.state.value.entityType === entityType &&
    preflight.state.value.entityId === id
      ? preflight.state.value
      : null;
  const canDelete = report !== null && report.deletable;
  const deleted = del.state?.ok === true;

  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <PButton
        type="button"
        tone="ghost"
        size="sm"
        data-testid="inline-delete"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Delete ${label}`}
        onClick={() => setOpen((v) => !v)}
        style={{ color: "#923220", borderColor: "#e4b9a8" }}
      >
        Delete
      </PButton>

      {/* Hidden preflight form — auto-submitted on open via requestSubmit. */}
      <form
        ref={preflight.formRef}
        action={preflight.formAction}
        style={{ display: "none" }}
      >
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="id" value={id} />
      </form>

      {open ? (
        <div
          role="dialog"
          aria-label={`Delete ${label}`}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 20,
            width: 280,
            background: P.surface,
            border: `1px solid ${P.line}`,
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            padding: 12,
            display: "grid",
            gap: 10,
          }}
        >
          <div
            style={{
              fontFamily: fontSans,
              fontSize: 13,
              fontWeight: 700,
              color: P.ink,
            }}
          >
            Delete this record permanently?
          </div>

          <DeletePreview pending={preflight.pending} report={report} />

          <form
            ref={del.formRef}
            action={del.formAction}
            style={{ display: "flex", gap: 8, alignItems: "center" }}
          >
            <input type="hidden" name="entityType" value={entityType} />
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="path" value={revalidatePath} />
            <PButton
              type="submit"
              tone="terra"
              size="sm"
              disabled={del.pending || deleted || !canDelete}
            >
              {del.pending ? "Deleting…" : "Delete"}
            </PButton>
            <PButton
              type="button"
              tone="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              {deleted ? "Close" : "Cancel"}
            </PButton>
          </form>

          {deleted ? (
            <span style={successTextStyle}>
              Deleted — recoverable from a backup.
            </span>
          ) : null}
          <FormStatus state={del.state} />
        </div>
      ) : null}
    </span>
  );
}

function DeletePreview({
  pending,
  report,
}: {
  pending: boolean;
  report: DeletionPreflight | null;
}) {
  const noteStyle = {
    fontFamily: fontBody,
    fontSize: 12,
    color: P.ink2,
    margin: 0,
  } as const;

  if (pending || report === null) {
    return <p style={noteStyle}>Checking what depends on this…</p>;
  }
  if (report.confidential) {
    return (
      <p style={noteStyle}>
        This record is confidential and can&rsquo;t be deleted. Disable instead.
      </p>
    );
  }
  if (report.forbidden) {
    return <p style={noteStyle}>This record can&rsquo;t be deleted.</p>;
  }
  if (report.blockers.length > 0) {
    const total = report.blockers.reduce((n, b) => n + b.count, 0);
    return (
      <p style={noteStyle}>
        Blocked by {total} dependent{total === 1 ? "" : "s"} — clear{" "}
        {report.blockers.map((b) => b.table).join(", ")} first.
      </p>
    );
  }
  return (
    <p style={noteStyle}>
      Safe to delete. A backup copy is captured first so it can be recovered.
    </p>
  );
}
