// PRD-SAC6 Danger-Zone shared constants + result shapes. Plain module (NOT
// "use server"), so both the server actions and the client cards can import the
// type-to-confirm phrases and success types — a "use server" file may only
// export async functions, so these can't live alongside the actions.

// Clean Slate (#288): the exact phrase the operator must type to wipe history.
export const CLEAN_SLATE_CONFIRM_PHRASE = "CLEAR HISTORY";

// Audit-log reset (#290): the exact phrase the operator must type to reset.
export const AUDIT_RESET_CONFIRM_PHRASE = "RESET AUDIT LOGS";

// Clean Slate revert + import (#293/#294): the exact phrase the operator must
// type to restore a snapshot back into the database.
export const CLEAN_SLATE_RESTORE_CONFIRM_PHRASE = "RESTORE";

// ADR 0014 (#312): the exact phrase the operator must type to permanently
// delete a curated entity (physical removal, captured to a tombstone).
export const PERMANENT_DELETE_CONFIRM_PHRASE = "PERMANENTLY DELETE";

// ADR 0014 (#315): the exact phrase the operator must type to restore a
// tombstoned row back into the database from its snapshot.
export const TOMBSTONE_RESTORE_CONFIRM_PHRASE = "RESTORE RECORD";

// A clean permanent deletion echoes which entity was removed and the tombstone
// it can be recovered from.
export type PermanentDeleteSuccess = {
  entityType: string;
  entityId: string;
  tombstoneId: string;
};

// One blocking dependent reported by the preflight: a child table whose FK
// action (cascade / restrict / no-action) would erase or refuse the delete.
export type DeletionBlocker = {
  table: string;
  column: string;
  action: string;
  count: number;
};

// The #313 preflight report. `confidential` is the opaque private-care-note
// block (#314) — when true the UI shows the opaque message and NO blocker
// detail, by design. `forbidden` covers a rejected target (e.g. a super_admin
// profile). `setNull` previews the dependents the delete will null + capture.
export type DeletionPreflight = {
  // The target this report describes, so the UI can discard it once the
  // operator selects a different row (a stale report must never gate a delete).
  entityType: string;
  entityId: string;
  deletable: boolean;
  confidential: boolean;
  forbidden: boolean;
  blockers: DeletionBlocker[];
  setNull: { table: string; column: string; count: number }[];
};

// A tombstone restore (#315) echoes the re-inserted row + how many set-null
// dependents were re-linked vs skipped (children that no longer exist).
export type TombstoneRestoreSuccess = {
  tombstoneId: string;
  entityType: string;
  entityId: string;
  relinked: number;
  skipped: number;
};

export type CleanSlateWipeSuccess = {
  snapshotId: string;
  totalRows: number;
  rowCounts: Record<string, number>;
};

// Both restore paths report the same shape: how many rows went back, per table.
// Revert additionally echoes the snapshot id it restored.
export type CleanSlateRevertSuccess = {
  snapshotId: string;
  totalRows: number;
  rowCounts: Record<string, number>;
};

export type CleanSlateImportSuccess = {
  totalRows: number;
  rowCounts: Record<string, number>;
};
