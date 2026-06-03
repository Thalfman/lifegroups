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
