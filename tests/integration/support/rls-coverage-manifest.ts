// RLS coverage manifest for the live-stack harness (issue #693, PR2).
//
// Goal: make the RLS permission matrix verifiably EXHAUSTIVE rather than
// illustrative. The set of tables that *must* be exercised is not hand-written
// here — it is derived from the sensitive-data classification manifest
// (`sensitiveTables()`, issue #694), so the two can never drift. For each such
// table this file records whether the LIVE harness asserts its visibility
// (`asserted`) or defers to the static migration sweep with a documented reason
// (`deferred`). A completeness test (in `rls-visibility.test.ts`) fails if a
// sensitive table is missing here, and reports the asserted/deferred split so
// incompleteness is VISIBLE rather than implied-complete.
//
// "Deferred" never means "unprotected": every table below is already pinned by
// the static, migration-level matrix sweep
// (`lib/admin/__tests__/admin-rls-visibility-sweep.test.ts`, the source of truth
// in `docs/architecture/RLS_VISIBILITY.md`). Deferral only means this LIVE,
// per-tier-client harness has not yet provisioned a row fixture for it.

import { sensitiveTables } from "@/lib/security/data-classification";

/** The RLS visibility class a table falls under (see RLS_VISIBILITY.md). */
export type VisibilityClass =
  | "ADMIN_READ"
  | "SUPER_ADMIN_ONLY"
  | "LEADER_SCOPED"
  | "OVER_SHEPHERD_SCOPED"
  | "CARE_NOTE_EXCEPTION"
  | "PRIVATE_NOTE_EXCEPTION"
  | "NO_READ";

export type CoverageStatus =
  // Exercised by a live per-tier assertion in rls-visibility.test.ts.
  | { readonly kind: "asserted" }
  // Not yet live-asserted in this harness; covered by the static sweep. The
  // reason names what live fixture would be needed.
  | { readonly kind: "deferred"; readonly reason: string };

export interface CoverageEntry {
  readonly visibility: VisibilityClass;
  readonly status: CoverageStatus;
}

const asserted = (visibility: VisibilityClass): CoverageEntry => ({
  visibility,
  status: { kind: "asserted" },
});

const deferred = (
  visibility: VisibilityClass,
  reason: string
): CoverageEntry => ({ visibility, status: { kind: "deferred", reason } });

// The coverage map. Keys MUST equal `sensitiveTables()` (enforced by the
// completeness test). Group the deferral reasons by the fixture each would need.
const STATIC_SWEEP =
  "pinned by the static migration sweep (admin-rls-visibility-sweep)";

export const RLS_COVERAGE: Readonly<Record<string, CoverageEntry>> = {
  // --- Asserted live (per-tier clients, real RLS) -------------------------
  profiles: asserted("OVER_SHEPHERD_SCOPED"),
  over_shepherds: asserted("ADMIN_READ"),
  shepherd_care_profiles: asserted("OVER_SHEPHERD_SCOPED"),
  care_notes: asserted("CARE_NOTE_EXCEPTION"),
  prayer_requests: asserted("CARE_NOTE_EXCEPTION"),
  shepherd_care_private_notes: asserted("PRIVATE_NOTE_EXCEPTION"),
  shepherd_care_note_key_slots: asserted("PRIVATE_NOTE_EXCEPTION"),
  audit_events: asserted("SUPER_ADMIN_ONLY"),

  // --- Deferred: ADMIN_READ tables needing a seeded row -------------------
  shepherd_care_interactions: deferred(
    "OVER_SHEPHERD_SCOPED",
    `needs a seeded interaction row; ${STATIC_SWEEP}`
  ),
  shepherd_care_follow_ups: deferred(
    "ADMIN_READ",
    `needs a seeded care follow-up row; ${STATIC_SWEEP}`
  ),
  shepherd_care_admin_notes: deferred(
    "ADMIN_READ",
    `needs a seeded admin-summary row; ${STATIC_SWEEP}`
  ),
  group_health_assessments: deferred(
    "ADMIN_READ",
    `needs a seeded assessment row; ${STATIC_SWEEP}`
  ),
  group_metric_settings: deferred(
    "ADMIN_READ",
    `needs a seeded group + metric-settings row; ${STATIC_SWEEP}`
  ),
  prospects: deferred(
    "ADMIN_READ",
    `needs a seeded prospect row; ${STATIC_SWEEP}`
  ),

  // --- Deferred: LEADER_SCOPED tables needing a group + leader-of fixture --
  groups: deferred(
    "LEADER_SCOPED",
    `needs a group with the fixture Leader assigned; ${STATIC_SWEEP}`
  ),
  members: deferred(
    "LEADER_SCOPED",
    `needs a group + membership fixture; ${STATIC_SWEEP}`
  ),
  guests: deferred(
    "LEADER_SCOPED",
    `needs a group + guest fixture; ${STATIC_SWEEP}`
  ),
  follow_ups: deferred(
    "LEADER_SCOPED",
    `needs a group-scoped follow-up fixture; ${STATIC_SWEEP}`
  ),
  attendance_sessions: deferred(
    "LEADER_SCOPED",
    `needs a group + attendance-session fixture; ${STATIC_SWEEP}`
  ),
  group_health_updates: deferred(
    "LEADER_SCOPED",
    `needs a group + health-update fixture; ${STATIC_SWEEP}`
  ),
  group_status_history: deferred(
    "LEADER_SCOPED",
    `needs a group with a status-change fixture; ${STATIC_SWEEP}`
  ),

  // --- Deferred: SUPER_ADMIN_ONLY tables needing a seeded row -------------
  audit_events_archive: deferred(
    "SUPER_ADMIN_ONLY",
    `needs an archived audit row (history reset); ${STATIC_SWEEP}`
  ),
  invitations: deferred(
    "SUPER_ADMIN_ONLY",
    `needs a seeded invitation row; ${STATIC_SWEEP}`
  ),
  tombstones: deferred(
    "SUPER_ADMIN_ONLY",
    `needs a permanent-delete tombstone fixture; ${STATIC_SWEEP}`
  ),
  clean_slate_snapshots: deferred(
    "SUPER_ADMIN_ONLY",
    `needs a clean-slate snapshot fixture; ${STATIC_SWEEP}`
  ),
  history_reset_snapshots: deferred(
    "SUPER_ADMIN_ONLY",
    `needs a history-reset snapshot fixture; ${STATIC_SWEEP}`
  ),
  attention_reset_snapshots: deferred(
    "SUPER_ADMIN_ONLY",
    `needs an attention-reset snapshot fixture; ${STATIC_SWEEP}`
  ),

  // --- Deferred: special cases --------------------------------------------
  invite_redeem_throttle: deferred(
    "NO_READ",
    `RLS-on with no SELECT policy — unreadable by every tier; touched only ` +
      `inside SECURITY DEFINER RPCs. ${STATIC_SWEEP}`
  ),
  account_deletion_requests: deferred(
    "ADMIN_READ",
    `policy_tbd in the classification manifest; needs a seeded request row. ` +
      STATIC_SWEEP
  ),
};

export interface CoverageReconciliation {
  /** Sensitive tables (from #694) with no entry here — a coverage gap. */
  readonly missing: string[];
  /** Entries here that are not (or no longer) sensitive — stale. */
  readonly stale: string[];
  readonly asserted: string[];
  readonly deferred: string[];
}

/**
 * Reconcile the coverage map against the sensitive-table set. `missing` and
 * `stale` must both be empty; the asserted/deferred split is reported so the
 * extent of live coverage is visible.
 */
export function reconcileCoverage(): CoverageReconciliation {
  const sensitive = new Set(sensitiveTables());
  const keys = new Set(Object.keys(RLS_COVERAGE));

  const missing = [...sensitive].filter((t) => !keys.has(t)).sort();
  const stale = [...keys].filter((t) => !sensitive.has(t)).sort();
  const asserted = Object.entries(RLS_COVERAGE)
    .filter(([, e]) => e.status.kind === "asserted")
    .map(([t]) => t)
    .sort();
  const deferred = Object.entries(RLS_COVERAGE)
    .filter(([, e]) => e.status.kind === "deferred")
    .map(([t]) => t)
    .sort();

  return { missing, stale, asserted, deferred };
}
