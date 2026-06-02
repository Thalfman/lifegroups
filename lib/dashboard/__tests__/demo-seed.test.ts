import { describe, expect, it } from "vitest";
import { buildAdminGroupModel } from "@/lib/dashboard/admin-group-model";
import { ADMIN_FALLBACK } from "@/lib/dashboard/fallback-data";
import {
  DEMO_METRIC_DEFAULTS,
  demoCapacityModelInput,
} from "@/lib/dashboard/demo-seed";

// ADR-0011 follow-on: the demo capacity rows are no longer hand-built. They are
// the live assembler's output for the demo seed, so the demo and the live
// dashboard derive the capacity-row shape and rules from one place.

describe("demo capacity seed", () => {
  it("buckets each demo group into the capacity state it models", () => {
    // Independently pin the assembler's bucketing + sort for the demo seed, so a
    // regression in the shared capacity rules surfaces as a group moving here.
    const cs = ADMIN_FALLBACK.capacitySummary;
    expect(cs.full.map((r) => r.groupId)).toEqual(["fb-cap-full-1"]);
    expect(cs.warning.map((r) => r.groupId)).toEqual([
      "fb-cap-warn-1",
      "fb-cap-warn-2",
    ]);
    expect(cs.ok.map((r) => r.groupId)).toEqual(["fb-cap-ok-1", "fb-cap-ok-2"]);
    expect(cs.unknown.map((r) => r.groupId)).toEqual(["fb-cap-unknown-1"]);
    expect(cs.excluded.map((r) => r.groupId)).toEqual(["fb-cap-excluded-1"]);
  });

  it("carries no hand-set thresholds — every row's warning/full pct is the shared default", () => {
    const cs = ADMIN_FALLBACK.capacitySummary;
    const rows = [
      ...cs.full,
      ...cs.warning,
      ...cs.ok,
      ...cs.unknown,
      ...cs.excluded,
    ];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.warningPct).toBe(
        DEMO_METRIC_DEFAULTS.capacity_warning_threshold_pct
      );
      expect(row.fullPct).toBe(
        DEMO_METRIC_DEFAULTS.capacity_full_threshold_pct
      );
    }
  });

  it("reflects a shared capacity-rule change without editing the fallback module", () => {
    // Lower the warning threshold to 40%: groups previously "ok" now read
    // "warning" purely because the shared metrics rule changed — the demo rows
    // follow the rule, and nothing in lib/dashboard/fallback-data.ts is touched.
    const strict = {
      ...DEMO_METRIC_DEFAULTS,
      capacity_warning_threshold_pct: 40,
    };
    const model = buildAdminGroupModel(demoCapacityModelInput(strict));
    const warningIds = model.capacitySummary.warning.map((r) => r.groupId);
    // Hillside Couples (5/10 = 50%) and Eastside Community (7/12 ≈ 58%) cross
    // the lowered 40% line that the default 80% left them under.
    expect(warningIds).toContain("fb-cap-ok-2");
    expect(warningIds).toContain("fb-cap-ok-1");
    expect(model.capacitySummary.counts.ok).toBe(0);
  });
});
