import { beforeAll, describe, expect, it } from "vitest";

import {
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// PRD-SAC6 follow-up: the wipe must lock the history tables before it
// counts/snapshots, so a concurrent history write can't be deleted without being
// captured in the snapshot (which would make recovery impossible). Static
// assertions over the CREATE OR REPLACE migration.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration(
    "20260603160000_phase_sac6_clean_slate_wipe_table_lock.sql"
  );
});

describe("SAC6 wipe table lock — super_admin_clean_slate_wipe", () => {
  it("is still SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "super_admin_clean_slate_wipe");
  });

  it("locks the history tables exclusive after the advisory lock", () => {
    const body = functionBody(sql, "super_admin_clean_slate_wipe");
    expect(body).toContain("pg_advisory_xact_lock(hashtext('clean_slate'))");
    expect(body).toContain("lock table");
    expect(body).toContain("in exclusive mode");
    const advisory = body.indexOf("pg_advisory_xact_lock");
    const lock = body.indexOf("lock table");
    expect(advisory).toBeLessThan(lock);
  });

  it("acquires the table lock BEFORE counting and snapshotting", () => {
    const body = functionBody(sql, "super_admin_clean_slate_wipe");
    const lock = body.indexOf("lock table");
    const firstCount = body.indexOf(
      "select count(*) into c_attendance_records"
    );
    const snapshotInsert = body.indexOf(
      "insert into public.clean_slate_snapshots"
    );
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(firstCount);
    expect(lock).toBeLessThan(snapshotInsert);
  });

  it("locks parent before child to match writer order (no deadlock)", () => {
    const body = functionBody(sql, "super_admin_clean_slate_wipe");
    const lockBlock = body.slice(
      body.indexOf("lock table"),
      body.indexOf("in exclusive mode")
    );
    expect(lockBlock.indexOf("public.attendance_sessions")).toBeLessThan(
      lockBlock.indexOf("public.attendance_records")
    );
    expect(lockBlock.indexOf("public.guests")).toBeLessThan(
      lockBlock.indexOf("public.follow_ups")
    );
  });
});
