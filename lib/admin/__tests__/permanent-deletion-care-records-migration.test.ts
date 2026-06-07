import { beforeAll, describe, expect, it } from "vitest";

import {
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";
import {
  INLINE_DELETABLE_ENTITY_TYPES,
  PERMANENT_DELETION_ENTITIES,
  findPermanentDeletionEntity,
} from "@/lib/admin/permanent-deletion";

// ADR 0014 (SAD9): the two Care leaf record types — care follow-ups and the
// interaction log — are registered as permanent-deletion targets so the
// super-admin-only inline Delete control can remove everything under the Care
// tab EXCEPT the confidential care notes & prayer requests. This migration is a
// create-or-replace of the allowlist resolver, so its body is the authoritative
// current allowlist: this suite owns the live-registry total + the full SQL↔TS
// lockstep, and re-asserts the off-limits boundary still holds.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration(
    "20260621000000_phase_sad9_permanent_deletion_care_records.sql"
  );
});

const NEW_CARE_TYPES: Array<[string, string]> = [
  ["shepherd_care_follow_up", "shepherd_care_follow_ups"],
  ["shepherd_care_interaction", "shepherd_care_interactions"],
];

const PRIOR_TOKENS = [
  "launch_scenario",
  "group",
  "profile",
  "calendar_event",
  "multiplication_candidate",
  "apprentice",
  "over_shepherd",
  "clean_slate_snapshot",
  "member",
  "group_membership",
  "group_leader",
  "attendance_session",
  "attendance_record",
  "guest",
  "follow_up",
  "group_health_update",
  "group_health_assessment",
  "invitation",
  "shepherd_coverage_assignment",
  "church_attendance_snapshot",
];

describe("SAD9 — Care leaf record types registered", () => {
  it.each(NEW_CARE_TYPES)(
    "registers %s -> %s in the allowlist",
    (token, table) => {
      const body = functionBody(sql, "super_admin_deletable_table");
      expect(body).toContain(`'${token}'`);
      expect(body).toContain(`'${table}'`);
    }
  );

  it("re-states every prior slice (create-or-replace mirror)", () => {
    const body = functionBody(sql, "super_admin_deletable_table");
    for (const token of PRIOR_TOKENS) {
      expect(body).toContain(`'${token}'`);
    }
  });
});

describe("SAD9 — off-limits boundary still holds", () => {
  it.each([
    "shepherd_care_private_notes",
    "care_notes",
    "prayer_requests",
    "audit_events",
    "audit_events_archive",
    "tombstones",
    "group_metric_settings",
    "group_categories",
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

describe("SAD9 — client registry matches the SQL allowlist", () => {
  it("resolves both new Care tokens in the TS registry", () => {
    for (const [token] of NEW_CARE_TYPES) {
      expect(findPermanentDeletionEntity(token)).toBeDefined();
    }
  });

  it("has the full curated set (20 prior + 2 Care = 22)", () => {
    expect(PERMANENT_DELETION_ENTITIES).toHaveLength(22);
  });

  it("keeps the SQL allowlist and TS registry in lockstep", () => {
    const body = functionBody(sql, "super_admin_deletable_table");
    for (const entity of PERMANENT_DELETION_ENTITIES) {
      expect(body).toContain(`'${entity.entityType}'`);
    }
  });

  it("still never offers notes / prayer requests in the UI registry", () => {
    const tokens = new Set(
      PERMANENT_DELETION_ENTITIES.map((e) => e.entityType)
    );
    for (const forbidden of [
      "care_note",
      "care_notes",
      "prayer_request",
      "prayer_requests",
      "shepherd_care_private_notes",
    ]) {
      expect(tokens.has(forbidden)).toBe(false);
    }
  });
});

describe("SAD9 — inline-deletable subset (no-phrase action scope)", () => {
  it("every inline-deletable token is a registered permanent-deletion entity", () => {
    for (const token of INLINE_DELETABLE_ENTITY_TYPES) {
      expect(findPermanentDeletionEntity(token)).toBeDefined();
    }
  });

  it("never includes the confidential / audit / tombstone tokens", () => {
    for (const forbidden of [
      "care_notes",
      "prayer_requests",
      "shepherd_care_private_notes",
      "audit_events",
      "tombstones",
    ]) {
      expect(INLINE_DELETABLE_ENTITY_TYPES.has(forbidden)).toBe(false);
    }
  });
});
