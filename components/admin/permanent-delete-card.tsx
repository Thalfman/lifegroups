"use client";

// ADR 0014 (#312–#316): the Super-Admin-only Permanent Deletion danger-zone
// card. Pick a curated entity type and a specific row, preflight what blocks the
// delete (cascade/restrict/no-action dependents named with counts, or the opaque
// confidential block), then confirm with the PERMANENTLY DELETE phrase. A
// recovery list re-imports tombstoned rows (#315). Every mutation is re-gated
// and re-validated server-side in the RPC; the client gating is only UX.

import { useEffect, useMemo, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import {
  superAdminPermanentDelete,
  superAdminPermanentDeletePreflight,
  superAdminRestoreTombstone,
} from "@/app/(protected)/admin/super-admin/permanent-delete-actions";
import {
  PERMANENT_DELETE_CONFIRM_PHRASE,
  TOMBSTONE_RESTORE_CONFIRM_PHRASE,
  type DeletionPreflight,
  type PermanentDeleteSuccess,
  type TombstoneRestoreSuccess,
} from "@/lib/admin/danger-zone";
import type {
  PermanentDeletionTargetGroup,
  RecentTombstone,
} from "@/lib/supabase/permanent-deletion-reads";
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

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function PermanentDeleteCard({
  targets,
  tombstones,
}: {
  targets: PermanentDeletionTargetGroup[];
  tombstones: RecentTombstone[];
}) {
  const preflight = useActionForm<DeletionPreflight>(
    superAdminPermanentDeletePreflight
  );
  const del = useActionForm<PermanentDeleteSuccess>(superAdminPermanentDelete, {
    resetOnSuccess: true,
  });

  const [entityType, setEntityType] = useState(targets[0]?.entityType ?? "");
  const [selectedId, setSelectedId] = useState("");
  const [confirm, setConfirm] = useState("");

  const activeGroup = useMemo(
    () => targets.find((t) => t.entityType === entityType),
    [targets, entityType]
  );

  // A new target selection invalidates the prior preflight + confirm.
  useEffect(() => {
    setConfirm("");
  }, [entityType, selectedId]);

  const report = preflight.state?.ok ? preflight.state.value : null;
  // The preflight result only describes the row it was run for; once the
  // selection changes the operator must re-check. We key the report to the row
  // by clearing it implicitly (the confirm reset above) and gating delete on a
  // freshly-checked, deletable report for THIS row.
  const phraseMatches = confirm.trim() === PERMANENT_DELETE_CONFIRM_PHRASE;
  const canDelete =
    !!selectedId && phraseMatches && report !== null && report.deletable;

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
        Permanent deletion
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
        Physically removes a curated record. This is the bounded exception to
        archive-everywhere — a tombstone is captured first so it can be
        recovered, and the act is audited. Records with cascade/restrict
        dependents are refused until those are cleared; confidential records
        cannot be deleted (disable instead).
      </p>

      {/* Target pickers. */}
      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <label htmlFor="perm-delete-type" style={fieldLabelStyle}>
            Record type
          </label>
          <select
            id="perm-delete-type"
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setSelectedId("");
            }}
            className={fieldInputClass}
            style={fieldInputStyle}
          >
            {targets.map((g) => (
              <option key={g.entityType} value={g.entityType}>
                {g.pluralLabel}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="perm-delete-row" style={fieldLabelStyle}>
            Record
          </label>
          <select
            id="perm-delete-row"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className={fieldInputClass}
            style={fieldInputStyle}
          >
            <option value="">Select a {activeGroup?.label ?? "record"}…</option>
            {(activeGroup?.items ?? []).map((it) => (
              <option key={it.id} value={it.id}>
                {it.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Preflight. */}
      <form action={preflight.formAction} style={{ display: "grid", gap: 8 }}>
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="id" value={selectedId} />
        <div>
          <PButton
            type="submit"
            tone="ghost"
            size="md"
            disabled={preflight.pending || !selectedId}
          >
            {preflight.pending ? "Checking…" : "Check dependents"}
          </PButton>
        </div>
        <FormStatus state={preflight.state} />
      </form>

      {report ? <PreflightReport report={report} /> : null}

      {/* Confirm + delete. */}
      <form action={del.formAction} style={{ display: "grid", gap: 10 }}>
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="id" value={selectedId} />
        <div>
          <label htmlFor="perm-delete-confirm" style={fieldLabelStyle}>
            Type {PERMANENT_DELETE_CONFIRM_PHRASE} to confirm
          </label>
          <input
            id="perm-delete-confirm"
            name="confirm"
            type="text"
            autoComplete="off"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={PERMANENT_DELETE_CONFIRM_PHRASE}
            className={fieldInputClass}
            style={fieldInputStyle}
          />
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <PButton
            type="submit"
            tone="terra"
            size="md"
            disabled={del.pending || !canDelete}
          >
            {del.pending ? "Deleting…" : "Permanently delete"}
          </PButton>
          {del.state?.ok ? (
            <span style={successTextStyle}>
              Deleted. A tombstone was captured for recovery.
            </span>
          ) : null}
        </div>
        {report !== null && !report.deletable ? (
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 12,
              color: P.ink2,
              margin: 0,
            }}
          >
            This record can&rsquo;t be deleted yet — see the blockers above.
          </p>
        ) : null}
        <FormStatus state={del.state} />
      </form>

      <TombstoneRecovery tombstones={tombstones} />
    </div>
  );
}

function PreflightReport({ report }: { report: DeletionPreflight }) {
  if (report.confidential) {
    return (
      <div
        style={{
          border: `1px solid ${P.line}`,
          borderRadius: 8,
          background: P.surface,
          padding: "10px 12px",
          fontFamily: fontBody,
          fontSize: 12.5,
          color: P.ink2,
        }}
      >
        This person has confidential records and cannot be permanently deleted;
        disable instead.
      </div>
    );
  }
  if (report.forbidden) {
    return (
      <div
        style={{
          border: `1px solid ${P.line}`,
          borderRadius: 8,
          background: P.surface,
          padding: "10px 12px",
          fontFamily: fontBody,
          fontSize: 12.5,
          color: P.ink2,
        }}
      >
        That record can&rsquo;t be targeted for permanent deletion.
      </div>
    );
  }
  return (
    <div
      style={{
        border: `1px solid ${P.line}`,
        borderRadius: 8,
        background: P.surface,
        padding: "10px 12px",
        display: "grid",
        gap: 6,
        fontFamily: fontSans,
        fontSize: 12,
        color: P.ink2,
      }}
    >
      {report.blockers.length > 0 ? (
        <>
          <div style={{ fontWeight: 700, color: P.ink }}>
            Blocked by {report.blockers.length} dependent
            {report.blockers.length === 1 ? "" : "s"} — clear these first:
          </div>
          {report.blockers.map((b) => (
            <div
              key={`${b.table}.${b.column}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <span>
                {b.table}.{b.column} ({b.action})
              </span>
              <strong style={{ color: P.ink }}>{b.count}</strong>
            </div>
          ))}
        </>
      ) : (
        <div style={{ color: P.ink }}>
          No blocking dependents — safe to delete.
        </div>
      )}
      {report.setNull.length > 0 ? (
        <div style={{ marginTop: 4 }}>
          Will null + capture {report.setNull.reduce((n, s) => n + s.count, 0)}{" "}
          set-null reference
          {report.setNull.reduce((n, s) => n + s.count, 0) === 1
            ? ""
            : "s"}{" "}
          (re-linkable on restore).
        </div>
      ) : null}
    </div>
  );
}

function TombstoneRecovery({ tombstones }: { tombstones: RecentTombstone[] }) {
  return (
    <div
      style={{
        borderTop: `1px solid ${P.terra}`,
        paddingTop: 14,
        display: "grid",
        gap: 10,
      }}
    >
      <h4
        style={{
          fontFamily: fontDisplay,
          fontSize: 15,
          fontWeight: 600,
          color: P.ink,
          margin: 0,
        }}
      >
        Recover a deleted record
      </h4>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 12.5,
          color: P.terraTextStrong,
          lineHeight: 1.55,
          margin: 0,
        }}
      >
        Restore a tombstoned row from its captured snapshot, re-linking the
        dependents the delete nulled. The tombstone is kept after restoring.
      </p>
      {tombstones.length === 0 ? (
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 12.5,
            color: P.ink2,
            margin: 0,
          }}
        >
          No tombstones yet — nothing has been permanently deleted.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {tombstones.map((t) => (
            <TombstoneRow key={t.id} tombstone={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function TombstoneRow({ tombstone }: { tombstone: RecentTombstone }) {
  const restore = useActionForm<TombstoneRestoreSuccess>(
    superAdminRestoreTombstone,
    { resetOnSuccess: true }
  );
  const [confirm, setConfirm] = useState("");
  const ok = restore.state?.ok;
  useEffect(() => {
    if (ok) setConfirm("");
  }, [ok]);
  const matches = confirm.trim() === TOMBSTONE_RESTORE_CONFIRM_PHRASE;
  const alreadyRestored = tombstone.restoredAt !== null;

  return (
    <form
      ref={restore.formRef}
      action={restore.formAction}
      style={{
        border: `1px solid ${P.line}`,
        borderRadius: 8,
        background: P.surface,
        padding: "10px 12px",
        display: "grid",
        gap: 8,
      }}
    >
      <input type="hidden" name="tombstoneId" value={tombstone.id} />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          fontFamily: fontSans,
          fontSize: 12,
          color: P.ink2,
        }}
      >
        <span>
          <strong style={{ color: P.ink }}>{tombstone.label}</strong>{" "}
          <span style={{ color: P.ink3 }}>({tombstone.entityType})</span>
        </span>
        <span>{formatTime(tombstone.deletedAt)} UTC</span>
      </div>
      {alreadyRestored ? (
        <span style={{ fontFamily: fontSans, fontSize: 12, color: P.ink3 }}>
          Already restored {formatTime(tombstone.restoredAt as string)} UTC.
        </span>
      ) : (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <input
            name="confirm"
            type="text"
            autoComplete="off"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={TOMBSTONE_RESTORE_CONFIRM_PHRASE}
            className={fieldInputClass}
            style={{ ...fieldInputStyle, maxWidth: 220 }}
          />
          <PButton
            type="submit"
            tone="ghost"
            size="md"
            disabled={restore.pending || !matches}
          >
            {restore.pending ? "Restoring…" : "Restore"}
          </PButton>
          {restore.state?.ok ? (
            <span style={successTextStyle}>
              Restored ({restore.state.value.relinked} re-linked,{" "}
              {restore.state.value.skipped} skipped).
            </span>
          ) : null}
        </div>
      )}
      <FormStatus state={restore.state} />
    </form>
  );
}
