import { beforeAll, describe, expect, it } from "vitest";

import {
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

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260604100000_phase_sac6_launch_prep_atomic.sql");
});

describe("SAC6 launch prep — super_admin_launch_prep", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "super_admin_launch_prep");
  });

  it("gates on super_admin and a resolvable actor", () => {
    const body = functionBody(sql, "super_admin_launch_prep");
    expect(body).toContain("public.auth_role() <> 'super_admin'");
    expect(body).toContain("raise exception 'insufficient_privilege'");
    expect(body).toContain("public.auth_profile_id()");
  });

  it("deep-merges every launch mute flag onto the existing feature_flags", () => {
    const body = functionBody(sql, "super_admin_launch_prep");
    // Merge onto the existing object (|| coalesce(...)) so unrelated flags survive.
    expect(body).toContain(
      "coalesce(v_cfg -> 'feature_flags', '{}'::jsonb) ||"
    );
    // The SQL hard-codes the flag keys; guard them against the TS source of truth.
    for (const key of LAUNCH_MUTE_FLAG_KEYS) {
      expect(body, `SQL is missing launch mute flag ${key}`).toContain(key);
    }
  });

  it("reuses the audited Clean Slate wipe and swallows nothing_to_wipe", () => {
    const body = functionBody(sql, "super_admin_launch_prep");
    expect(body).toContain("public.super_admin_clean_slate_wipe()");
    // nothing_to_wipe (already-clean history) must not abort launch prep.
    expect(body).toContain("if sqlerrm = 'nothing_to_wipe' then");
    expect(body).toContain("v_snapshot_id := null");
    // Any OTHER error must propagate (rolling the whole step back — atomicity).
    expect(body).toContain("else\n        raise;");
  });

  it("purges every per-category history-reset snapshot", () => {
    const body = functionBody(sql, "super_admin_launch_prep");
    expect(body).toContain("delete from public.history_reset_snapshots");
  });

  it("does the wipe and the snapshot purge AFTER the mute write (one txn)", () => {
    const body = functionBody(sql, "super_admin_launch_prep");
    const muteWrite = body.indexOf("update public.platform_config");
    const wipe = body.indexOf("public.super_admin_clean_slate_wipe()");
    const purge = body.indexOf("delete from public.history_reset_snapshots");
    expect(muteWrite).toBeGreaterThan(-1);
    expect(muteWrite).toBeLessThan(wipe);
    expect(wipe).toBeLessThan(purge);
  });

  it("writes a paired super_admin.launch_prep audit row", () => {
    const body = functionBody(sql, "super_admin_launch_prep");
    expect(body).toContain("insert into public.audit_events");
    expect(body).toContain("'super_admin.launch_prep'");
  });

  it("grants execute to authenticated and revokes from public/anon", () => {
    expect(sql.raw).toContain(
      "grant  execute on function public.super_admin_launch_prep() to authenticated"
    );
    expect(sql.raw).toContain(
      "revoke all     on function public.super_admin_launch_prep() from public"
    );
    expect(sql.raw).toContain(
      "revoke all     on function public.super_admin_launch_prep() from anon"
    );
  });
});
