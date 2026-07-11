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

// Per-category history reset (PRD-SAC6 follow-up): the exact phrase the operator
// must type to clear one category of history. The revert reuses the shared
// CLEAN_SLATE_RESTORE_CONFIRM_PHRASE above.
export const HISTORY_RESET_CONFIRM_PHRASE = "RESET";

// One-click launch prep: the exact phrase the operator must type to clear all
// accumulated history AND hide the time-based launch warnings on Home in one
// guarded step. Composed of the existing Clean Slate wipe (recoverable snapshot
// captured first) + the launch-optics mute flags.
export const LAUNCH_PREP_CONFIRM_PHRASE = "PREPARE FOR LAUNCH";

// Attention reset (health-checks-reset): the exact phrases the operator must
// type to reset a duration-derived "Needs attention" card to a clean slate. The
// revert reuses the shared CLEAN_SLATE_RESTORE_CONFIRM_PHRASE above.
export const RESET_CARE_ATTENTION_CONFIRM_PHRASE = "RESET CARE";
export const RESET_HEALTH_ATTENTION_CONFIRM_PHRASE = "RESET HEALTH CHECKS";

// One top-level "reset everything to a clean launch state" composition: clears
// all history, hides the launch warnings, AND resets the time-based attention
// cards, in one guarded step. The granular cards below stay available for fine
// control (and for recovery — each piece reverts from its own card).
export const RESET_ALL_CONFIRM_PHRASE = "RESET EVERYTHING";

// The exact token the history-clearing RPCs raise when there is nothing to
// clear. This is an idempotent no-op, NOT a failure — the actions match this
// token to surface it as a neutral "already clean" success instead of a red
// error. Matched against the raw RPC error message (never the mapped sentence)
// so only this specific no-op is reclassified; every other token stays an error.
export const NOTHING_TO_WIPE_TOKEN = "nothing_to_wipe";

// Shared type-to-confirm guard for every danger-zone action. Trims the raw
// confirm value and compares it to the exact required phrase; returns the
// supplied error `message` on a mismatch, or `null` when it matches. Centralizes
// the copy-pasted `typeof raw === "string" ? raw.trim() : ""` + equality check
// while keeping each call site's wording its own argument.
export function requireConfirmPhrase(
  raw: unknown,
  phrase: string,
  message: string
): string | null {
  const confirm = typeof raw === "string" ? raw.trim() : "";
  return confirm === phrase ? null : message;
}

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
// `cleanup` (#880) previews the operational assignment rows a profile purge
// removes in-transaction and captures on the tombstone — announced work, not
// blockers, so they never gate `deletable`.
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
  cleanup: { table: string; column: string; count: number }[];
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
  // True when the wipe was a no-op because history was already clear. The card
  // renders this as a neutral "already clean" line rather than a red error.
  nothingToClear?: boolean;
};

// Both restore paths report the same shape: how many rows went back, per table.
// Revert additionally echoes the snapshot id it restored.
export type CleanSlateRevertSuccess = {
  snapshotId: string;
  totalRows: number;
  rowCounts: Record<string, number>;
};

// A per-category history reset / revert echoes the category it acted on, the
// snapshot captured/restored, and the per-table counts (for the success line).
export type HistoryResetSuccess = {
  category: string;
  snapshotId: string;
  totalRows: number;
  rowCounts: Record<string, number>;
  // True when the reset was a no-op because this category was already clear.
  // The card renders this as a neutral "already clean" line, not a red error.
  nothingToClear?: boolean;
};

export type HistoryResetRevertSuccess = HistoryResetSuccess;

export type CleanSlateImportSuccess = {
  totalRows: number;
  rowCounts: Record<string, number>;
};

// One-click launch prep echoes how many history rows were cleared (0 when the
// database was already clean), which launch warnings were muted, and the
// recoverable snapshot id (null when there was no history to snapshot).
export type LaunchPrepSuccess = {
  clearedRows: number;
  mutedKeys: string[];
  snapshotId: string | null;
};

// An attention reset / revert echoes the surface it acted on, the scope
// (whole queue vs a single entity), how many entities were affected, and the
// recoverable snapshot id captured/restored.
export type AttentionResetSuccess = {
  surface: "care" | "health";
  scope: "global" | "entity";
  entityId: string | null;
  affected: number;
  snapshotId: string;
};

export type AttentionResetRevertSuccess = {
  surface: "care" | "health";
  scope: "global" | "entity";
  entityId: string | null;
  snapshotId: string;
};

// activity-reset: the Home Recent-activity reset / clear. The reset echoes the
// as-of baseline date it set; the clear echoes null (the band returns to
// all-time). Non-destructive, so there is no snapshot id to carry.
export type ActivityResetSuccess = {
  baselineOn: string | null;
};

// The consolidated "reset everything" step echoes how many history rows were
// cleared (0 when already clean), which launch warnings were muted, and the
// recoverable history snapshot id (null when there was no history to snapshot).
// The care/health attention cards are reset to a global baseline as part of the
// same step; each remains separately revertable from its own card below.
export type ResetAllSuccess = {
  clearedRows: number;
  mutedKeys: string[];
  snapshotId: string | null;
};
