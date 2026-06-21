// Super-Admin domain slice of the admin RPC gateway: the Super Admin Console
// platform-config + account management writes, invitation minting, the Clean
// Slate / launch-prep / reset families, permanent deletion + tombstone recovery,
// the activity-baseline reset (jsonb channel), and the bulk people import (text
// channel). Most entries here gate on the super-admin role; the bulk-import
// pair includes an admin-gated sibling. The args-map slices reference the LITERAL
// Postgres function names as keys.

import type { UserRole } from "@/types/enums";

// The uuid-channel args-map slice for the super-admin domain. Keys are the
// LITERAL Postgres function names; every RPC here returns a uuid on success.
export type SuperAdminUuidRpcArgs = {
  // Phase 5A.3 super admin role management RPC.
  super_admin_update_profile_role: {
    p_profile_id: string;
    p_new_role: UserRole;
  };
  // Phase SAC.1 (#159) Super Admin Console platform-config write. The RPC
  // merges the submitted whitelisted keys into platform_config and writes a
  // paired audit_events row in one transaction, behind the super-admin gate.
  super_admin_set_platform_config: { p_config: Record<string, unknown> };
  // Phase SAC.3 (#163) account management: set a profile's active/inactive
  // status, and log a password-reset email send. Both are audited +
  // super-admin gated in the RPC.
  super_admin_set_profile_status: {
    p_profile_id: string;
    p_status: "active" | "inactive";
  };
  super_admin_log_password_reset: { p_profile_id: string };
  // Phase IL.1 — mint a shareable self-signup invite link. Returns the new
  // invitations.id. The raw token is generated + hashed in the action layer;
  // only its hash reaches the RPC.
  super_admin_create_invitation: {
    p_token_hash: string;
    p_role: UserRole;
    p_group_id: string | null;
    p_single_use: boolean;
    p_expires_at: string;
  };
  // Phase SAC.4 (#164) coverage editing from the Super Admin Console reuses
  // the existing Phase 5D.1 coverage RPCs (admin_assign_shepherd_to_over_shepherd
  // / admin_end_shepherd_coverage_assignment below). Those gate on
  // auth_is_admin(), which super_admin satisfies, so no new RPC is needed.
  //
  // PRD-SAC6 (#288) Clean Slate history wipe. Takes no arguments; the RPC
  // snapshots + deletes the history tables and writes the paired audit row in
  // one transaction, returning the snapshot id (the action reads counts back
  // from the snapshot row by id — not through this uuid channel).
  super_admin_clean_slate_wipe: Record<string, never>;
  // PRD-SAC6 (#293) Clean Slate in-DB revert. Restores the snapshot payload
  // (explicit id, else the latest un-restored snapshot) and returns the
  // restored snapshot id; the action reads counts back from the snapshot row
  // by id.
  super_admin_clean_slate_revert: { p_snapshot_id: string | null };
  // PRD-SAC6 (#294) Clean Slate import from a JSON export. The payload is the
  // parsed export file; the RPC does authoritative validation + restore and
  // returns the paired audit row id.
  super_admin_clean_slate_import: { p_payload: Record<string, unknown> };
  // PRD-SAC6 follow-up: one-click launch prep. In one transaction the RPC
  // mutes the three launch-optics warning flags, runs the Clean Slate history
  // wipe (idempotent — nothing_to_wipe is swallowed), and purges the
  // per-category history-reset snapshots. Returns the wipe snapshot id, or
  // null when history was already clear (the action reads cleared counts back
  // from the snapshot row).
  super_admin_launch_prep: Record<string, never>;
  // Danger-Zone consolidation: one-click "reset everything to a clean launch
  // state". In one transaction the RPC runs launch prep (mute flags +
  // clean-slate history wipe + category-snapshot purge) and resets the two
  // time-based "Needs attention" cards (care + health) to a global baseline.
  // Returns the history wipe snapshot id, or null when history was already
  // clear (the action reads cleared counts back from the snapshot row).
  super_admin_reset_all: Record<string, never>;
  // PRD-SAC6 follow-up: per-category history reset. Snapshots + deletes one
  // category's history tables and writes the paired audit row in one
  // transaction, returning the snapshot id (the action reads counts back from
  // the snapshot row).
  super_admin_reset_history_category: { p_category: string };
  // PRD-SAC6 follow-up: revert a per-category history reset. Restores only the
  // snapshot's category tables and returns the restored snapshot id.
  super_admin_reset_history_category_revert: { p_snapshot_id: string };
  // PRD-SAC6 (#290) standalone audit-log reset (archive-then-purge). Returns
  // the id of the single fresh audit row the purge writes.
  super_admin_reset_audit_logs: Record<string, never>;
  // health-checks-reset: set a leader-care reset baseline (global or
  // per-leader) and clean-slate field-wipe the targeted care profiles. Returns
  // the snapshot id (the action reads counts back from the snapshot row).
  super_admin_reset_care_attention: {
    p_scope: string;
    p_entity_id: string | null;
  };
  // health-checks-reset: set a health-check reset baseline (global or
  // per-group). No row mutation — "missing" is absence-derived. Returns the
  // snapshot id.
  super_admin_reset_health_attention: {
    p_scope: string;
    p_entity_id: string | null;
  };
  // health-checks-reset: revert an attention reset, restoring the prior
  // baseline and (for care) the snapshotted profile field values. Returns the
  // snapshot id.
  super_admin_reset_attention_revert: { p_snapshot_id: string };
  // ADR 0014 (#312–#316) permanent deletion. The delete RPC snapshots the row
  // + its set-null dependents into a tombstone, writes the paired audit row,
  // and physically removes the row, returning the tombstone id.
  super_admin_permanent_delete: { p_entity_type: string; p_id: string };
};

// The jsonb-channel args-map slice for the super-admin domain. These RPCs return
// a structured jsonb document (passed through as `unknown`; the action layer
// validates its shape).
export type SuperAdminJsonRpcArgs = {
  // activity-reset: set/replace the single global activity baseline at today
  // (church-local), flooring the Home Recent-activity tiles WITHOUT deleting
  // any domain rows. Returns the baseline date (a jsonb scalar, not a uuid).
  super_admin_reset_activity: Record<string, never>;
  // activity-reset: remove the global activity baseline so the tiles return
  // to all-time counts. Returns true when a baseline was removed.
  super_admin_clear_activity_reset: Record<string, never>;
  // ADR 0014 (#313) preflight: returns a jsonb report of blocking dependents +
  // captured set-null dependents (and an opaque confidential flag for #314),
  // so the danger-zone panel can name what blocks a deletion before attempting
  // it.
  super_admin_permanent_delete_preflight: {
    p_entity_type: string;
    p_id: string;
  };
  // ADR 0014 (#315) recovery: re-inserts a tombstoned row from its snapshot
  // and re-links the captured set-null dependents, returning a jsonb report of
  // how many links were restored vs skipped.
  super_admin_restore_tombstone: { p_tombstone_id: string };
};

// The text-channel args-map slice for the super-admin domain. These RPCs return
// a plain `text` scalar that is NOT a uuid, so they must not go through the uuid
// trust-boundary read.
export type SuperAdminTextRpcArgs = {
  // Phase SAC.5 (#165) bulk people import. p_rows is the parsed + de-duped row
  // array from lib/admin/people-import.ts; the RPC returns the created COUNT
  // as a `text` scalar (e.g. "0", "3") — NOT a uuid. It must use the text
  // channel: the uuid channel would run the count through `readUuidRpcData`,
  // which rejects any non-uuid string as null, so every successful import
  // would read as a failure.
  super_admin_bulk_import_people: { p_rows: Array<Record<string, unknown>> };
  // Admin-gated bulk people import (20260707000000): same parsed + de-duped row
  // array and `text` created-count return as the super-admin importer above,
  // behind auth_is_admin() instead of the super-admin gate, so the Settings >
  // System importer is a normal ministry-admin capability. Same text-channel
  // reasoning applies.
  admin_bulk_import_people: { p_rows: Array<Record<string, unknown>> };
};
