import { beforeAll, describe, expect, it } from "vitest";

import {
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";
import {
  PERMANENT_DELETION_ENTITIES,
  findPermanentDeletionEntity,
} from "@/lib/admin/permanent-deletion";

// ADR 0014 (#316 follow-up): the remaining operational record types are
// registered (so a Super Admin can clear test records bottom-up via the UI), the
// curated CASE keeps every earlier slice, and the off-limits boundary still
// holds — including the id-less group_metric_settings, which can never be a
// target.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration(
    "20260611000000_phase_sad8_permanent_deletion_operational_records.sql"
  );
});

const REGISTERED: Array<[string, string]> = [
  ["member", "members"],
  ["group_membership", "group_memberships"],
  ["group_leader", "group_leaders"],
  ["attendance_session", "attendance_sessions"],
  ["attendance_record", "attendance_records"],
  ["guest", "guests"],
  ["follow_up", "follow_ups"],
  ["group_health_update", "group_health_updates"],
  ["group_health_assessment", "group_health_assessments"],
  ["group_category", "group_categories"],
  ["invitation", "invitations"],
  ["shepherd_coverage_assignment", "shepherd_coverage_assignments"],
  ["church_attendance_snapshot", "church_attendance_snapshots"],
];

describe("SAD8 — operational record types registered", () => {
  it.each(REGISTERED)("registers %s -> %s in the allowlist", (token, table) => {
    const body = functionBody(sql, "super_admin_deletable_table");
    expect(body).toContain(`'${token}'`);
    expect(body).toContain(`'${table}'`);
  });

  it("re-states the foundation + earlier slices (create-or-replace)", () => {
    const body = functionBody(sql, "super_admin_deletable_table");
    for (const token of [
      "launch_scenario",
      "group",
      "profile",
      "calendar_event",
      "multiplication_candidate",
      "apprentice",
      "over_shepherd",
      "clean_slate_snapshot",
    ]) {
      expect(body).toContain(`'${token}'`);
    }
  });
});

describe("SAD8 — off-limits boundary (never registered)", () => {
  it.each([
    "shepherd_care_private_notes",
    "care_notes",
    "prayer_requests",
    "audit_events",
    "audit_events_archive",
    "tombstones",
    // No `id` column (PK is group_id) — can never be an `id`-keyed delete target.
    "group_metric_settings",
  ])("does not map any entity_type to %s", (table) => {
    const body = functionBody(sql, "super_admin_deletable_table");
    expect(body).not.toContain(`'${table}'`);
  });

  it("only touches the allowlist resolver — no engine functions", () => {
    for (const fn of [
      "super_admin_permanent_delete",
      "super_admin_permanent_delete_preflight",
      "super_admin_collect_dependents",
      "super_admin_confidential_block",
      "super_admin_restore_tombstone",
    ]) {
      expect(sql.lower).not.toContain(`function public.${fn}`);
    }
  });
});

describe("SAD8 — client registry matches the SQL allowlist", () => {
  it("registers every operational entity in the TS registry", () => {
    for (const [token] of REGISTERED) {
      expect(findPermanentDeletionEntity(token)).toBeDefined();
    }
  });

  it("never offers private notes, audit rows, or tombstones in the UI registry", () => {
    const tokens = new Set(
      PERMANENT_DELETION_ENTITIES.map((e) => e.entityType)
    );
    for (const forbidden of [
      "private_note",
      "shepherd_care_private_notes",
      "audit_event",
      "audit_events",
      "tombstone",
      "tombstones",
      "group_metric_settings",
    ]) {
      expect(tokens.has(forbidden)).toBe(false);
    }
  });

  it("has the full curated set (8 prior + 13 operational = 21)", () => {
    expect(PERMANENT_DELETION_ENTITIES).toHaveLength(21);
  });

  it("keeps SQL allowlist and TS registry in lockstep", () => {
    const body = functionBody(sql, "super_admin_deletable_table");
    for (const entity of PERMANENT_DELETION_ENTITIES) {
      expect(body).toContain(`'${entity.entityType}'`);
    }
  });
});
