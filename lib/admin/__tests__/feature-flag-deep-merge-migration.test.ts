import { describe, expect, it } from "vitest";

import {
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Regression guard for the frozen-surface toggle bug: super_admin_set_platform_config
// merged submitted feature flags with a single one-level `|| v_flags`, which
// replaced the whole toggled-flag object and dropped a sibling sub-key such as a
// frozen surface's `verified` marker. The fix deep-merges each submitted flag
// into its existing object so a toggle sending only `{ enabled }` preserves
// `verified`. These static checks pin the corrected merge shape.

const sql: MigrationSql = loadMigration(
  "20260627010000_fix_feature_flag_deep_merge.sql"
);

const FN = "super_admin_set_platform_config";

describe("feature-flag deep merge — super_admin_set_platform_config", () => {
  it("stays SECURITY DEFINER + locked-down + audited", () => {
    assertSecurityDefiner(sql, FN);
    assertExecuteLockdown(sql, FN, "jsonb");
    assertPairedAuditInsert(sql, FN, "'super_admin.set_platform_config'");
  });

  it("no longer uses the one-level `|| v_flags` shallow merge", () => {
    // The bug: the whole feature_flags object merged in one step, replacing each
    // toggled flag object wholesale.
    expect(functionBody(sql, FN)).not.toContain("'{}'::jsonb) || v_flags");
  });

  it("deep-merges each submitted flag into its existing object", () => {
    const body = functionBody(sql, FN);
    // Iterate the submitted flags and merge each INTO the stored sub-object, so
    // a sibling sub-key (verified) survives a { enabled }-only toggle.
    expect(body).toContain(
      "for v_key, v_val in select * from jsonb_each(v_flags)"
    );
    expect(body).toContain("coalesce(v_ff -> v_key, '{}'::jsonb) || v_val");
  });

  it("keeps editable_copy as a one-level merge (its values are scalars)", () => {
    expect(functionBody(sql, FN)).toContain(
      "coalesce(v_merged -> 'editable_copy', '{}'::jsonb) || v_copy"
    );
  });
});
