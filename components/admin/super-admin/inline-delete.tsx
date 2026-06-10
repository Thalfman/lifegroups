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
import { Button } from "@/components/ui/button";
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
import { successTextClassName } from "@/components/admin/forms/field-styles";
import { SuperAdminOnlyMark } from "@/components/admin/super-admin-only-badge";

const NOTE_CLASS = "m-0 font-sans text-xs text-ink2";

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
  // A finished preflight that produced no usable report is a failure (stale row,
  // transient RPC error) — distinct from "still checking". Surface it instead of
  // leaving the popover stuck on "Checking…".
  const preflightFailed =
    !preflight.pending && preflight.state !== undefined && report === null;
  const canDelete = report !== null && report.deletable;
  const deleted = del.state?.ok === true;

  return (
    <span className="relative inline-flex items-center gap-1.5">
      {/* Marks this Delete as private to the super admin — it never renders for
          other roles, so the marker is only ever seen by a super admin. */}
      <SuperAdminOnlyMark />
      <PButton
        type="button"
        tone="ghost"
        size="sm"
        data-testid="inline-delete"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Delete ${label}`}
        onClick={() => setOpen((v) => !v)}
        className="border-rose/40 text-rose hover:bg-roseSoft"
      >
        Delete
      </PButton>

      {/* Hidden preflight form — auto-submitted on open via requestSubmit. */}
      <form
        ref={preflight.formRef}
        action={preflight.formAction}
        className="hidden"
      >
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="id" value={id} />
      </form>

      {open ? (
        <div
          role="dialog"
          aria-label={`Delete ${label}`}
          className="absolute right-0 top-[calc(100%+6px)] z-dropdown grid w-[280px] gap-2.5 rounded-md border border-line bg-surface p-3 shadow-softLg"
        >
          <div className="font-sans text-sm font-semibold text-ink">
            Delete this record permanently?
          </div>

          <DeletePreview
            pending={preflight.pending}
            failed={preflightFailed}
            report={report}
            onRetry={() => preflight.formRef.current?.requestSubmit()}
          />

          <form
            ref={del.formRef}
            action={del.formAction}
            className="flex items-center gap-2"
          >
            <input type="hidden" name="entityType" value={entityType} />
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="path" value={revalidatePath} />
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={del.pending || deleted || !canDelete}
            >
              {del.pending ? "Deleting…" : "Delete"}
            </Button>
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
            <span className={successTextClassName}>
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
  failed,
  report,
  onRetry,
}: {
  pending: boolean;
  failed: boolean;
  report: DeletionPreflight | null;
  onRetry: () => void;
}) {
  if (pending) {
    return <p className={NOTE_CLASS}>Checking what depends on this…</p>;
  }
  if (failed) {
    return (
      <div className="grid gap-1.5">
        <p className="m-0 font-sans text-xs text-rose">
          Couldn&rsquo;t check what this affects — the record may have changed.
        </p>
        <PButton type="button" tone="ghost" size="sm" onClick={onRetry}>
          Retry check
        </PButton>
      </div>
    );
  }
  if (report === null) {
    return <p className={NOTE_CLASS}>Checking what depends on this…</p>;
  }
  if (report.confidential) {
    return (
      <p className={NOTE_CLASS}>
        This record is confidential and can&rsquo;t be deleted. Disable instead.
      </p>
    );
  }
  if (report.forbidden) {
    return <p className={NOTE_CLASS}>This record can&rsquo;t be deleted.</p>;
  }
  if (report.blockers.length > 0) {
    const total = report.blockers.reduce((n, b) => n + b.count, 0);
    return (
      <p className={NOTE_CLASS}>
        Blocked by {total} dependent{total === 1 ? "" : "s"} — clear{" "}
        {report.blockers.map((b) => b.table).join(", ")} first.
      </p>
    );
  }
  return (
    <p className={NOTE_CLASS}>
      Safe to delete. A backup copy is captured first so it can be recovered.
    </p>
  );
}
