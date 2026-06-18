import { describe, expect, it } from "vitest";

import {
  RLS_COVERAGE,
  reconcileCoverage,
} from "@/tests/integration/support/rls-coverage-manifest";

// RLS coverage completeness (issue #693) — a PURE check (no database), so it
// belongs in the DEFAULT GATING lane (`npm run test:run`), not the opt-in
// integration lane. It reconciles the RLS coverage map against the
// sensitive-table set derived from the data-classification manifest (#694), so a
// newly-classified sensitive table that lacks a coverage entry fails a normal PR
// here — rather than waiting for the scheduled RLS integration workflow. The
// LIVE per-tier DB assertions stay in tests/integration/rls-visibility.test.ts.

describe("fitness: RLS coverage manifest is complete", () => {
  const report = reconcileCoverage();

  it("every sensitive table (from the classification manifest) has a coverage entry", () => {
    expect(
      report.missing,
      report.missing.length === 0
        ? ""
        : `Sensitive tables with no RLS coverage entry — add an asserted or ` +
            `deferred(reason) entry to rls-coverage-manifest.ts:\n  ${report.missing.join(
              "\n  "
            )}`
    ).toEqual([]);
  });

  it("the coverage map has no stale (non-sensitive) entries", () => {
    expect(
      report.stale,
      report.stale.length === 0
        ? ""
        : `Coverage entries for tables no longer classified sensitive:\n  ${report.stale.join(
            "\n  "
          )}`
    ).toEqual([]);
  });

  it("every deferred entry documents a reason (incompleteness is visible)", () => {
    const undocumented = Object.entries(RLS_COVERAGE)
      .filter(
        ([, e]) =>
          e.status.kind === "deferred" && e.status.reason.trim().length === 0
      )
      .map(([t]) => t);
    expect(undocumented).toEqual([]);
  });

  it("asserts a meaningful live core; asserted + deferred covers the whole map", () => {
    expect(report.asserted.length).toBeGreaterThanOrEqual(8);
    expect(report.asserted.length + report.deferred.length).toBe(
      Object.keys(RLS_COVERAGE).length
    );
  });
});
