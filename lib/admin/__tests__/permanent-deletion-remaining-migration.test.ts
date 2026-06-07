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

// ADR 0014 (#316): the remaining curated entities are registered, and the
// off-limits boundary (private care notes, audit rows, tombstones) holds.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration(
    "20260604050000_phase_sad5_permanent_deletion_remaining.sql"
  );
});

const REGISTERED: Array<[string, string]> = [
  ["calendar_event", "group_calendar_events"],
  ["multiplication_candidate", "multiplication_candidates"],
  ["apprentice", "leader_pipeline"],
  ["over_shepherd", "over_shepherds"],
  ["clean_slate_snapshot", "clean_slate_snapshots"],
];

describe("SAD5 — remaining curated entities registered", () => {
  it.each(REGISTERED)("registers %s -> %s in the allowlist", (token, table) => {
    const body = functionBody(sql, "super_admin_deletable_table");
    expect(body).toContain(`'${token}'`);
    expect(body).toContain(`'${table}'`);
  });

  it("keeps the foundation + earlier slices registered", () => {
    const body = functionBody(sql, "super_admin_deletable_table");
    for (const token of ["launch_scenario", "group", "profile"]) {
      expect(body).toContain(`'${token}'`);
    }
  });
});

describe("SAD5 — off-limits boundary (never registered)", () => {
  it.each([
    "shepherd_care_private_notes",
    "audit_events",
    "audit_events_archive",
    "tombstones",
  ])("does not register %s as a deletable table", (table) => {
    const body = functionBody(sql, "super_admin_deletable_table");
    expect(body).not.toContain(`'${table}'`);
  });
});

describe("SAD5 — client registry matches the SQL allowlist", () => {
  it("registers every remaining entity in the TS registry", () => {
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
    ]) {
      expect(tokens.has(forbidden)).toBe(false);
    }
  });

  it("keeps the eight SAD1–SAD5 curated entity types registered", () => {
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
      expect(findPermanentDeletionEntity(token)).toBeDefined();
    }
  });
});
