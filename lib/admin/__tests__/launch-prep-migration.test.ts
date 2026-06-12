import { beforeAll, describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";
import { LAUNCH_MUTE_FLAG_KEYS } from "@/lib/admin/feature-flags";

// PRD-SAC6 follow-up: the one-click launch-prep RPC must do its three mutations
// (mute flags, history wipe, category-snapshot purge) atomically. Static
// assertions over the CREATE migration so the all-or-nothing + drift guarantees
// can't silently regress.

let creationSql: MigrationSql;
let finalSql: MigrationSql;

beforeAll(() => {
  creationSql = loadMigration(
    "20260604100000_phase_sac6_launch_prep_atomic.sql"
  );
  finalSql = loadMigration(
    "20260627000000_fix_safeupdate_unqualified_deletes.sql"
  );
});

describe("SAC6 launch prep — super_admin_launch_prep", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(finalSql, "super_admin_launch_prep");
  });

  it("gates on super_admin and a resolvable actor", () => {
    const body = functionBody(finalSql, "super_admin_launch_prep");
    expect(body).toContain("public.auth_role() <> 'super_admin'");
    expect(body).toContain("raise exception 'insufficient_privilege'");
    expect(body).toContain("public.auth_profile_id()");
  });

  it("deep-merges every launch mute flag onto the existing feature_flags", () => {
    const body = functionBody(finalSql, "super_admin_launch_prep");
    // Merge onto the existing object (|| coalesce(...)) so unrelated flags survive.
    expect(body).toContain(
      "coalesce(v_cfg -> 'feature_flags', '{}'::jsonb) ||"
    );
    // The SQL hard-codes the flag keys; guard them against the TS source of truth.
    for (const key of LAUNCH_MUTE_FLAG_KEYS) {
      expect(body, `SQL is missing launch mute flag ${key}`).toContain(key);
    }
  });

  it("holds the clean_slate advisory lock across the whole step", () => {
    const body = functionBody(finalSql, "super_admin_launch_prep");
    expect(body).toContain("pg_advisory_xact_lock(hashtext('clean_slate'))");
    // Taken in THIS function before the wipe, so it survives the nothing_to_wipe
    // subtransaction rollback (which releases the wipe's own re-entrant grab) and
    // keeps the snapshot purges serialized against a concurrent revert/wipe.
    const lock = body.indexOf("pg_advisory_xact_lock(hashtext('clean_slate'))");
    const wipe = body.indexOf("public.super_admin_clean_slate_wipe()");
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(wipe);
  });

  it("retires stale clean_slate_snapshots on the nothing_to_wipe path", () => {
    const body = functionBody(finalSql, "super_admin_launch_prep");
    // On the no-op path the wipe raised before clearing its own snapshot store,
    // so launch prep must retire it here — between swallowing the error and the
    // else/raise — or a stale full snapshot's revert could re-inject pre-launch rows.
    const noop = body.indexOf("if sqlerrm = 'nothing_to_wipe' then");
    const purgeCss = body.indexOf(
      "delete from public.clean_slate_snapshots where true"
    );
    const elseRaise = body.indexOf("else\n        raise;");
    expect(noop).toBeGreaterThan(-1);
    expect(purgeCss).toBeGreaterThan(noop);
    expect(purgeCss).toBeLessThan(elseRaise);
  });

  it("reuses the audited Clean Slate wipe and swallows nothing_to_wipe", () => {
    const body = functionBody(finalSql, "super_admin_launch_prep");
    expect(body).toContain("public.super_admin_clean_slate_wipe()");
    // nothing_to_wipe (already-clean history) must not abort launch prep.
    expect(body).toContain("if sqlerrm = 'nothing_to_wipe' then");
    expect(body).toContain("v_snapshot_id := null");
    // Any OTHER error must propagate (rolling the whole step back — atomicity).
    expect(body).toContain("else\n        raise;");
  });

  it("purges every per-category history-reset snapshot", () => {
    const body = functionBody(finalSql, "super_admin_launch_prep");
    expect(body).toContain(
      "delete from public.history_reset_snapshots where true"
    );
  });

  it("does the wipe and the snapshot purge AFTER the mute write (one txn)", () => {
    const body = functionBody(finalSql, "super_admin_launch_prep");
    const muteWrite = body.indexOf("update public.platform_config");
    const wipe = body.indexOf("public.super_admin_clean_slate_wipe()");
    const purge = body.indexOf(
      "delete from public.history_reset_snapshots where true"
    );
    expect(muteWrite).toBeGreaterThan(-1);
    expect(muteWrite).toBeLessThan(wipe);
    expect(wipe).toBeLessThan(purge);
  });

  it("writes a paired super_admin.launch_prep audit row", () => {
    const body = functionBody(finalSql, "super_admin_launch_prep");
    expect(body).toContain("insert into public.audit_events");
    expect(body).toContain("'super_admin.launch_prep'");
  });

  it("grants execute to authenticated and revokes from public/anon", () => {
    assertExecuteLockdown(creationSql, "super_admin_launch_prep");
  });
});
