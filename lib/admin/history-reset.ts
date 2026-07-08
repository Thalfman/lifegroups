// PRD-SAC6 follow-up: the per-category history-reset registry.
//
// The single source of truth for which history categories can be reset, which
// tables each one covers, and how they read in the UI. Pure data — no I/O — so
// the reads layer (impact counts), the action layer (category validation), the
// UI card, and the migration test can all share one definition and never drift.
//
// The table arrays are the children → parents DELETE order. The SQL RPC
// (super_admin_reset_history_category) is the authoritative deleter; these arrays
// drive the read-only impact preview (the count shown per category) and must stay
// in step with the RPC's allow-list. Only `attendance` has a real intra-category
// FK that requires order (attendance_records → attendance_sessions, CASCADE); the
// rest are siblings, ordered to match the full Clean Slate wipe for consistency.

export const HISTORY_RESET_CATEGORIES = {
  health_checks: ["group_health_updates", "group_health_assessments"],
  follow_ups: ["follow_ups"],
  attendance: ["attendance_records", "attendance_sessions"],
  guests: ["guests"],
  church_attendance: ["church_attendance_snapshots"],
  shepherd_care: ["shepherd_care_follow_ups", "shepherd_care_interactions"],
  group_status_history: ["group_status_history"],
} as const;

export type HistoryResetCategory = keyof typeof HISTORY_RESET_CATEGORIES;

// Operator-facing label + one-line description per category, shown on the card.
export const HISTORY_RESET_CATEGORY_META: Record<
  HistoryResetCategory,
  { label: string; description: string }
> = {
  health_checks: {
    label: "Health checks",
    description: "Group-health assessments and monthly health updates.",
  },
  follow_ups: {
    label: "Follow-ups",
    // Covers the pre-pivot `follow_ups` table (dashboard/guest follow-up
    // tasks), NOT shepherd-care follow-ups — those live in the separate
    // "Shepherd care" category below. Mislabeling this destructive control
    // risks an operator wiping the wrong history.
    description: "Dashboard and guest follow-up tasks (pre-pivot).",
  },
  attendance: {
    label: "Attendance",
    description:
      "Weekly attendance sessions and per-member attendance records.",
  },
  guests: {
    label: "Guests",
    description: "Guest records captured for groups.",
  },
  church_attendance: {
    label: "Church attendance",
    description: "Weekend church-attendance snapshots.",
  },
  shepherd_care: {
    label: "Shepherd care",
    description: "Shepherd-care interactions and shepherd-care follow-ups.",
  },
  group_status_history: {
    label: "Group status history",
    description: "Recorded group lifecycle status changes.",
  },
};

// The category keys, in display order (matches the registry insertion order).
export const HISTORY_RESET_CATEGORY_KEYS = Object.keys(
  HISTORY_RESET_CATEGORIES
) as HistoryResetCategory[];

// All tables touched by any category, deduped — used by the reads layer to count
// per-category impact.
export const HISTORY_RESET_TABLES = Array.from(
  new Set(Object.values(HISTORY_RESET_CATEGORIES).flat())
);

// Narrow an arbitrary string to a known category key.
export function isHistoryResetCategory(
  value: unknown
): value is HistoryResetCategory {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(HISTORY_RESET_CATEGORIES, value)
  );
}
