import { describe, expect, it } from "vitest";
import {
  BUILT_IN_METRIC_DEFAULTS,
  capacityStatus,
  decodeMetricDefaults,
  effectiveCapacity,
} from "@/lib/admin/metrics";

describe("decodeMetricDefaults (Julian P1/P2/Q5 baselines)", () => {
  it("defaults group capacity to 12 and the per-tier stale windows to 30 / 60 when unset", () => {
    const d = decodeMetricDefaults(null);
    expect(d.default_group_capacity).toBe(12);
    expect(d.shepherd_care_stale_days_direct).toBe(30);
    expect(d.shepherd_care_stale_days_delegated).toBe(60);
  });

  it("keeps the documented baseline in sync", () => {
    expect(BUILT_IN_METRIC_DEFAULTS.default_group_capacity).toBe(12);
    expect(BUILT_IN_METRIC_DEFAULTS.shepherd_care_stale_days_direct).toBe(30);
    expect(BUILT_IN_METRIC_DEFAULTS.shepherd_care_stale_days_delegated).toBe(60);
  });
});

describe("effectiveCapacity", () => {
  it("falls back to the ministry default when group + override are unset", () => {
    const cap = effectiveCapacity({ capacity: null }, null, BUILT_IN_METRIC_DEFAULTS);
    expect(cap).toBe(12);
  });

  it("prefers a per-group override over the group capacity and default", () => {
    const cap = effectiveCapacity(
      { capacity: 20 },
      {
        capacity_override: 8,
        capacity_warning_threshold_pct_override: null,
        healthy_attendance_pct_override: null,
        manual_health_status_override: null,
        exclude_from_capacity_metrics: false,
        admin_metric_notes: null,
        check_in_due_offset_hours_override: null,
        allow_over_capacity: false,
      },
      BUILT_IN_METRIC_DEFAULTS,
    );
    expect(cap).toBe(8);
  });
});

describe("capacityStatus — Julian P2 kept-open-past-12", () => {
  const base = { warningPct: 80, fullPct: 100, excluded: false };

  it("reports a group at/over capacity as full by default", () => {
    expect(
      capacityStatus({ ...base, activeMemberCount: 12, effectiveCapacity: 12 }),
    ).toBe("full");
    expect(
      capacityStatus({ ...base, activeMemberCount: 14, effectiveCapacity: 12 }),
    ).toBe("full");
  });

  it("reports open_by_choice when allow_over_capacity is set", () => {
    expect(
      capacityStatus({
        ...base,
        activeMemberCount: 14,
        effectiveCapacity: 12,
        allowOverCapacity: true,
      }),
    ).toBe("open_by_choice");
  });

  it("does not soften warning/ok groups even when allow_over_capacity is set", () => {
    // 10/12 = 83% -> warning band; the flag only matters at/above full.
    expect(
      capacityStatus({
        ...base,
        activeMemberCount: 10,
        effectiveCapacity: 12,
        allowOverCapacity: true,
      }),
    ).toBe("warning");
    expect(
      capacityStatus({
        ...base,
        activeMemberCount: 5,
        effectiveCapacity: 12,
        allowOverCapacity: true,
      }),
    ).toBe("ok");
  });
});
