import { describe, expect, it } from "vitest";
import {
  BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS,
  buildLaunchPlanningInputs,
  buildScenarioComparison,
  computeLaunchPlan,
  buildStaffingForecast,
  computeStaffingForecast,
  countStaffingSupply,
  decodeLaunchPlanningAssumptions,
  decodeLaunchPlanningScenario,
  filterActiveScenarios,
  findCurrentScenario,
  nextSeasonAnchorIso,
  participationPct,
  redactNotesForAudit,
  scenarioTargetDateIso,
  type LaunchPlanningAssumptions,
  type LaunchPlanningScenario,
  type StaffingApprentice,
} from "@/lib/admin/launch-planning";
import {
  BUILT_IN_METRIC_DEFAULTS,
  type MetricDefaults,
} from "@/lib/admin/metrics";
import type {
  AppSettingsRow,
  GroupMembershipsRow,
  GroupMetricSettingsRow,
  GroupsRow,
  LaunchPlanningScenariosRow,
} from "@/types/database";

const ROW_ID = "00000000-0000-0000-0000-000000000001";

function appSettingsRow(value: Record<string, unknown>): AppSettingsRow {
  return {
    id: ROW_ID,
    setting_key: "launch_planning_assumptions",
    setting_value: value,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function group(overrides: Partial<GroupsRow>): GroupsRow {
  return {
    id: overrides.id ?? "00000000-0000-0000-0000-000000000100",
    name: overrides.name ?? "Group",
    description: null,
    meeting_day: null,
    meeting_time: null,
    meeting_frequency: "weekly",
    meeting_week_parity: null,
    location_area: null,
    address_optional: null,
    capacity: overrides.capacity ?? null,
    lifecycle_status: overrides.lifecycle_status ?? "active",
    health_status: "healthy",
    audience_category: overrides.audience_category ?? null,
    life_stage: overrides.life_stage ?? null,
    launched_on: overrides.launched_on ?? null,
    pause_reason: null,
    pause_start_date: null,
    expected_return_date: null,
    restart_reminder_date: null,
    admin_notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    closed_at: null,
  };
}

function override(
  groupId: string,
  fields: Partial<GroupMetricSettingsRow> = {}
): GroupMetricSettingsRow {
  return {
    group_id: groupId,
    capacity_override: fields.capacity_override ?? null,
    capacity_warning_threshold_pct_override: null,
    healthy_attendance_pct_override: null,
    manual_health_status_override: null,
    exclude_from_capacity_metrics:
      fields.exclude_from_capacity_metrics ?? false,
    admin_metric_notes: null,
    check_in_due_offset_hours_override: null,
    allow_over_capacity: fields.allow_over_capacity ?? false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function membership(
  groupId: string,
  status: GroupMembershipsRow["status"] = "active"
): GroupMembershipsRow {
  return {
    id: `${groupId}-m-${status}-${Math.random()}`,
    group_id: groupId,
    member_id: "00000000-0000-0000-0000-00000000beef",
    role: "member",
    status,
    joined_at: "2026-01-01",
    ended_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// decodeLaunchPlanningAssumptions
// ---------------------------------------------------------------------------

describe("decodeLaunchPlanningAssumptions", () => {
  it("returns built-in defaults when the row is null", () => {
    expect(decodeLaunchPlanningAssumptions(null)).toEqual(
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS
    );
  });

  it("returns built-in defaults when the row's setting_value is empty", () => {
    expect(decodeLaunchPlanningAssumptions(appSettingsRow({}))).toEqual(
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS
    );
  });

  it("falls back to built-in defaults for fields with the wrong JSON type", () => {
    const row = appSettingsRow({
      current_church_attendance: "150",
      expected_growth: null,
      target_group_participation_pct: "not-a-number",
      average_group_size: 12.5, // non-integer -> rejected
      launch_buffer_pct: 0.2,
      leaders_per_new_group: true, // bool -> rejected
      notes: 123, // number -> rejected
      expected_growth_date: 5, // number -> rejected
    });
    const decoded = decodeLaunchPlanningAssumptions(row);
    expect(decoded.current_church_attendance).toBe(
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.current_church_attendance
    );
    expect(decoded.expected_growth).toBe(
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.expected_growth
    );
    expect(decoded.target_group_participation_pct).toBe(
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.target_group_participation_pct
    );
    expect(decoded.average_group_size).toBe(
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.average_group_size
    );
    expect(decoded.launch_buffer_pct).toBe(0.2);
    expect(decoded.leaders_per_new_group).toBe(
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.leaders_per_new_group
    );
    expect(decoded.notes).toBeNull();
    expect(decoded.expected_growth_date).toBeNull();
  });

  it("reads valid values out of the stored row", () => {
    const row = appSettingsRow({
      current_church_attendance: 250,
      expected_growth: 40,
      expected_growth_date: "2026-08-01",
      target_group_participation_pct: 0.7,
      average_group_size: 12,
      launch_buffer_pct: 0.1,
      leaders_per_new_group: 1,
      notes: "Watch the August influx.",
    });
    expect(decodeLaunchPlanningAssumptions(row)).toEqual({
      current_church_attendance: 250,
      expected_growth: 40,
      expected_growth_date: "2026-08-01",
      target_group_participation_pct: 0.7,
      average_group_size: 12,
      launch_buffer_pct: 0.1,
      leaders_per_new_group: 1,
      notes: "Watch the August influx.",
      planned_launch_count: 0,
      target_launch_month: null,
      target_launch_year: null,
    });
  });

  it("falls back to metric_defaults.default_group_capacity for missing average_group_size", () => {
    const row = appSettingsRow({ current_church_attendance: 200 });
    const defaults: Pick<MetricDefaults, "default_group_capacity"> = {
      default_group_capacity: 14,
    };
    expect(
      decodeLaunchPlanningAssumptions(row, defaults).average_group_size
    ).toBe(14);
  });

  it("falls back to built-in 10 when metric_defaults has no capacity", () => {
    const row = appSettingsRow({ current_church_attendance: 200 });
    expect(
      decodeLaunchPlanningAssumptions(row, { default_group_capacity: null })
        .average_group_size
    ).toBe(BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS.average_group_size);
  });
});

// ---------------------------------------------------------------------------
// buildLaunchPlanningInputs
// ---------------------------------------------------------------------------

describe("buildLaunchPlanningInputs", () => {
  it("counts only active groups toward active_group_count", () => {
    const inputs = buildLaunchPlanningInputs({
      groups: [
        group({ id: "g1", lifecycle_status: "active", capacity: 10 }),
        group({ id: "g2", lifecycle_status: "closed", capacity: 10 }),
        group({ id: "g3", lifecycle_status: "at_risk", capacity: 10 }),
      ],
      overrides: [],
      memberships: [],
      metricDefaults: BUILT_IN_METRIC_DEFAULTS,
    });
    expect(inputs.active_group_count).toBe(1);
    expect(inputs.effective_total_capacity).toBe(10);
  });

  it("excludes capacity-excluded groups from capacity and participant totals", () => {
    const inputs = buildLaunchPlanningInputs({
      groups: [
        group({ id: "g1", lifecycle_status: "active", capacity: 10 }),
        group({ id: "g2", lifecycle_status: "active", capacity: 20 }),
      ],
      overrides: [override("g2", { exclude_from_capacity_metrics: true })],
      memberships: [
        membership("g1"),
        membership("g1"),
        membership("g2"),
        membership("g2"),
        membership("g2"),
      ],
      metricDefaults: BUILT_IN_METRIC_DEFAULTS,
    });
    expect(inputs.active_group_count).toBe(2);
    expect(inputs.excluded_active_group_count).toBe(1);
    expect(inputs.effective_total_capacity).toBe(10);
    expect(inputs.current_participants).toBe(2);
    expect(inputs.available_seats).toBe(8);
  });

  it("counts unknown-capacity groups separately and contributes zero seats", () => {
    const inputs = buildLaunchPlanningInputs({
      groups: [
        group({ id: "g1", lifecycle_status: "active", capacity: null }),
        group({ id: "g2", lifecycle_status: "active", capacity: 12 }),
      ],
      overrides: [],
      memberships: [membership("g1"), membership("g2")],
      metricDefaults: {
        ...BUILT_IN_METRIC_DEFAULTS,
        default_group_capacity: null,
      },
    });
    expect(inputs.unknown_capacity_group_count).toBe(1);
    expect(inputs.effective_total_capacity).toBe(12);
    expect(inputs.current_participants).toBe(2);
  });

  it("ignores non-active memberships when counting participants", () => {
    const inputs = buildLaunchPlanningInputs({
      groups: [group({ id: "g1", lifecycle_status: "active", capacity: 10 })],
      overrides: [],
      memberships: [
        membership("g1", "active"),
        membership("g1", "inactive"),
        membership("g1", "paused"),
      ],
      metricDefaults: BUILT_IN_METRIC_DEFAULTS,
    });
    expect(inputs.current_participants).toBe(1);
  });

  it("uses per-group capacity overrides", () => {
    const inputs = buildLaunchPlanningInputs({
      groups: [group({ id: "g1", lifecycle_status: "active", capacity: 10 })],
      overrides: [override("g1", { capacity_override: 25 })],
      memberships: [],
      metricDefaults: BUILT_IN_METRIC_DEFAULTS,
    });
    expect(inputs.effective_total_capacity).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// computeLaunchPlan
// ---------------------------------------------------------------------------

function makeAssumptions(
  overrides: Partial<LaunchPlanningAssumptions> = {}
): LaunchPlanningAssumptions {
  return { ...BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS, ...overrides };
}

describe("computeLaunchPlan — projected demand math", () => {
  it("projects total attendance and demand from manual inputs", () => {
    const out = computeLaunchPlan(
      makeAssumptions({
        current_church_attendance: 100,
        expected_growth: 20,
        target_group_participation_pct: 0.6,
        launch_buffer_pct: 0.15,
      }),
      { effective_total_capacity: 80 }
    );
    expect(out.projected_total_attendance).toBe(120);
    expect(out.projected_group_demand).toBeCloseTo(72, 6);
  });

  it("clamps projected attendance and demand at zero when growth would make them negative", () => {
    const out = computeLaunchPlan(
      makeAssumptions({
        current_church_attendance: 100,
        expected_growth: -500, // attendance + growth = -400
        target_group_participation_pct: 0.6,
        launch_buffer_pct: 0.15,
      }),
      { effective_total_capacity: 80 }
    );
    expect(out.projected_total_attendance).toBe(0);
    expect(out.projected_group_demand).toBe(0);
    expect(out.target_capacity_with_buffer).toBe(0);
    expect(out.capacity_gap).toBe(-80);
    expect(out.recommended_new_groups).toBe(0);
    expect(out.risk_level).toBe("ok");
  });

  it("respects launch_buffer_pct = 0 (no buffer)", () => {
    const out = computeLaunchPlan(
      makeAssumptions({
        current_church_attendance: 100,
        expected_growth: 0,
        target_group_participation_pct: 0.5,
        launch_buffer_pct: 0,
      }),
      { effective_total_capacity: 60 }
    );
    expect(out.projected_group_demand).toBeCloseTo(50, 6);
    expect(out.target_capacity_with_buffer).toBeCloseTo(50, 6);
    expect(out.capacity_gap).toBeCloseTo(-10, 6);
    expect(out.recommended_new_groups).toBe(0);
    expect(out.risk_level).toBe("ok");
  });
});

describe("computeLaunchPlan — capacity gap and recommendations", () => {
  it("returns zero new groups when current capacity covers projected demand + buffer", () => {
    const out = computeLaunchPlan(
      makeAssumptions({
        current_church_attendance: 100,
        expected_growth: 20,
        target_group_participation_pct: 0.6, // demand 72
        launch_buffer_pct: 0.15, // target = 72 / 0.85 ≈ 84.7
      }),
      { effective_total_capacity: 100 } // over capacity
    );
    expect(out.recommended_new_groups).toBe(0);
    expect(out.capacity_gap).toBeLessThan(0);
    expect(out.risk_level).toBe("ok");
  });

  it("rounds recommended_new_groups up with ceil", () => {
    const out = computeLaunchPlan(
      makeAssumptions({
        current_church_attendance: 200,
        expected_growth: 50,
        target_group_participation_pct: 0.6, // demand 150
        launch_buffer_pct: 0.15, // target ≈ 176.5
        average_group_size: 10,
      }),
      { effective_total_capacity: 100 } // gap ≈ 76.5 -> ceil(76.5/10) = 8
    );
    expect(out.recommended_new_groups).toBe(8);
  });

  it("multiplies leaders_per_new_group to compute estimated_new_leaders_needed", () => {
    const out = computeLaunchPlan(
      makeAssumptions({
        current_church_attendance: 200,
        expected_growth: 50,
        target_group_participation_pct: 0.6,
        launch_buffer_pct: 0.15,
        average_group_size: 10,
        leaders_per_new_group: 2,
      }),
      { effective_total_capacity: 100 }
    );
    expect(out.estimated_new_leaders_needed).toBe(16); // 8 groups * 2
  });

  it("clamps average_group_size = 0 to avoid divide-by-zero", () => {
    const out = computeLaunchPlan(
      makeAssumptions({
        current_church_attendance: 100,
        expected_growth: 0,
        target_group_participation_pct: 0.6,
        launch_buffer_pct: 0,
        average_group_size: 0,
      }),
      { effective_total_capacity: 10 }
    );
    expect(Number.isFinite(out.recommended_new_groups)).toBe(true);
    expect(out.recommended_new_groups).toBe(50);
  });

  it("clamps launch_buffer_pct >= 1 to avoid divide-by-zero", () => {
    const out = computeLaunchPlan(
      makeAssumptions({
        current_church_attendance: 100,
        expected_growth: 0,
        target_group_participation_pct: 0.6,
        launch_buffer_pct: 1.5,
      }),
      { effective_total_capacity: 10 }
    );
    expect(Number.isFinite(out.target_capacity_with_buffer)).toBe(true);
  });
});

describe("computeLaunchPlan — risk level transitions", () => {
  it("OK when no new groups are needed", () => {
    const out = computeLaunchPlan(
      makeAssumptions({
        current_church_attendance: 50,
        expected_growth: 0,
        target_group_participation_pct: 0.6,
        launch_buffer_pct: 0.15,
      }),
      { effective_total_capacity: 100 }
    );
    expect(out.risk_level).toBe("ok");
  });

  it("Watch when the gap fits inside the configured buffer headroom", () => {
    // demand = 60, buffer = 20% -> target = 75, buffer headroom = 12.
    // capacity = 70 -> gap = 5 (positive, but <= 12).
    const out = computeLaunchPlan(
      makeAssumptions({
        current_church_attendance: 100,
        expected_growth: 0,
        target_group_participation_pct: 0.6,
        launch_buffer_pct: 0.2,
        average_group_size: 10,
      }),
      { effective_total_capacity: 70 }
    );
    expect(out.recommended_new_groups).toBeGreaterThan(0);
    expect(out.risk_level).toBe("watch");
  });

  it("Launch Needed when the gap exceeds the buffer headroom", () => {
    // demand = 60, buffer = 10% -> target ≈ 66.67, headroom = 6.
    // capacity = 30 -> gap ≈ 36.67, well over 6.
    const out = computeLaunchPlan(
      makeAssumptions({
        current_church_attendance: 100,
        expected_growth: 0,
        target_group_participation_pct: 0.6,
        launch_buffer_pct: 0.1,
        average_group_size: 10,
      }),
      { effective_total_capacity: 30 }
    );
    expect(out.risk_level).toBe("launch_needed");
  });
});

describe("computeLaunchPlan — suggested launch date", () => {
  it("returns null when no expected_growth_date is set", () => {
    const out = computeLaunchPlan(
      makeAssumptions({
        current_church_attendance: 200,
        expected_growth: 50,
        target_group_participation_pct: 0.6,
        launch_buffer_pct: 0.15,
        expected_growth_date: null,
      }),
      { effective_total_capacity: 50 }
    );
    expect(out.suggested_launch_by_date).toBeNull();
  });

  it("returns null when no new groups are recommended even with a date set", () => {
    const out = computeLaunchPlan(
      makeAssumptions({
        current_church_attendance: 50,
        expected_growth: 0,
        expected_growth_date: "2026-08-01",
      }),
      { effective_total_capacity: 200 }
    );
    expect(out.suggested_launch_by_date).toBeNull();
  });

  it("returns a date 30 days before expected_growth_date when groups are needed", () => {
    const out = computeLaunchPlan(
      makeAssumptions({
        current_church_attendance: 200,
        expected_growth: 50,
        target_group_participation_pct: 0.6,
        launch_buffer_pct: 0.15,
        expected_growth_date: "2026-08-01",
      }),
      { effective_total_capacity: 50 }
    );
    expect(out.suggested_launch_by_date).toBe("2026-07-02");
  });

  it("returns null when the date is malformed", () => {
    const out = computeLaunchPlan(
      makeAssumptions({
        current_church_attendance: 200,
        expected_growth: 50,
        target_group_participation_pct: 0.6,
        launch_buffer_pct: 0.15,
        expected_growth_date: "next August",
      }),
      { effective_total_capacity: 50 }
    );
    expect(out.suggested_launch_by_date).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// redactNotesForAudit
// ---------------------------------------------------------------------------

describe("redactNotesForAudit", () => {
  it("never includes the notes string in the audit snapshot", () => {
    const audit = redactNotesForAudit(
      makeAssumptions({ notes: "This is sensitive planning context." })
    );
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain("sensitive");
    expect(serialized).not.toContain("planning context");
    expect(audit).not.toHaveProperty("notes");
    expect(audit.has_notes).toBe(true);
  });

  it("reports has_notes=false for null or whitespace notes", () => {
    expect(
      redactNotesForAudit(makeAssumptions({ notes: null })).has_notes
    ).toBe(false);
    expect(
      redactNotesForAudit(makeAssumptions({ notes: "   " })).has_notes
    ).toBe(false);
    expect(redactNotesForAudit(makeAssumptions({ notes: "" })).has_notes).toBe(
      false
    );
  });

  it("includes all numeric assumption values in the audit snapshot", () => {
    const a = makeAssumptions({
      current_church_attendance: 250,
      expected_growth: 40,
      expected_growth_date: "2026-08-01",
      target_group_participation_pct: 0.7,
      average_group_size: 12,
      launch_buffer_pct: 0.1,
      leaders_per_new_group: 1,
      notes: "x",
    });
    expect(redactNotesForAudit(a)).toEqual({
      current_church_attendance: 250,
      expected_growth: 40,
      expected_growth_date: "2026-08-01",
      target_group_participation_pct: 0.7,
      average_group_size: 12,
      launch_buffer_pct: 0.1,
      leaders_per_new_group: 1,
      has_notes: true,
      planned_launch_count: 0,
      target_launch_month: null,
      target_launch_year: null,
    });
  });
});

// ---------------------------------------------------------------------------
// LP.2 — scenario helpers
// ---------------------------------------------------------------------------

function scenarioRow(
  overrides: Partial<LaunchPlanningScenariosRow> = {}
): LaunchPlanningScenariosRow {
  return {
    id: overrides.id ?? "00000000-0000-0000-0000-000000000900",
    name: overrides.name ?? "Expected",
    description: overrides.description ?? null,
    assumptions: overrides.assumptions ?? {
      current_church_attendance: 150,
      expected_growth: 30,
      expected_growth_date: null,
      target_group_participation_pct: 0.6,
      average_group_size: 10,
      launch_buffer_pct: 0.15,
      leaders_per_new_group: 2,
      notes: null,
    },
    is_current: overrides.is_current ?? false,
    archived_at: overrides.archived_at ?? null,
    created_by: overrides.created_by ?? null,
    updated_by: overrides.updated_by ?? null,
    created_at: overrides.created_at ?? "2026-01-01T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-01-01T00:00:00.000Z",
  };
}

describe("decodeLaunchPlanningScenario", () => {
  it("decodes the stored row's assumptions via the LP.1 decoder", () => {
    const row = scenarioRow({
      name: "Conservative",
      description: "Tight forecast",
      assumptions: {
        current_church_attendance: 100,
        expected_growth: 10,
        expected_growth_date: "2026-08-01",
        target_group_participation_pct: 0.5,
        average_group_size: 8,
        launch_buffer_pct: 0.1,
        leaders_per_new_group: 2,
        notes: "Soft estimate",
      },
    });
    const decoded = decodeLaunchPlanningScenario(row);
    expect(decoded.name).toBe("Conservative");
    expect(decoded.description).toBe("Tight forecast");
    expect(decoded.status).toBe("active");
    expect(decoded.assumptions.target_group_participation_pct).toBeCloseTo(
      0.5,
      6
    );
    expect(decoded.assumptions.notes).toBe("Soft estimate");
  });

  it("uses metric defaults as the average_group_size fallback for missing keys", () => {
    const row = scenarioRow({
      assumptions: { current_church_attendance: 200 },
    });
    const decoded = decodeLaunchPlanningScenario(row, {
      default_group_capacity: 14,
    });
    expect(decoded.assumptions.average_group_size).toBe(14);
  });

  it("flags archived scenarios as status='archived'", () => {
    const decoded = decodeLaunchPlanningScenario(
      scenarioRow({ archived_at: "2026-02-01T00:00:00.000Z" })
    );
    expect(decoded.status).toBe("archived");
  });
});

describe("filterActiveScenarios", () => {
  it("excludes archived scenarios", () => {
    const rows = [
      scenarioRow({
        id: "00000000-0000-0000-0000-000000000a01",
        archived_at: null,
      }),
      scenarioRow({
        id: "00000000-0000-0000-0000-000000000a02",
        archived_at: "2026-02-01T00:00:00.000Z",
      }),
      scenarioRow({
        id: "00000000-0000-0000-0000-000000000a03",
        archived_at: null,
      }),
    ];
    const active = filterActiveScenarios(rows);
    expect(active.map((r) => r.id)).toEqual([
      "00000000-0000-0000-0000-000000000a01",
      "00000000-0000-0000-0000-000000000a03",
    ]);
  });
});

describe("findCurrentScenario", () => {
  function decode(row: LaunchPlanningScenariosRow): LaunchPlanningScenario {
    return decodeLaunchPlanningScenario(row);
  }

  it("returns the current scenario when present", () => {
    const scenarios = [
      decode(
        scenarioRow({
          id: "00000000-0000-0000-0000-000000000b01",
          is_current: false,
        })
      ),
      decode(
        scenarioRow({
          id: "00000000-0000-0000-0000-000000000b02",
          is_current: true,
        })
      ),
    ];
    expect(findCurrentScenario(scenarios)?.id).toBe(
      "00000000-0000-0000-0000-000000000b02"
    );
  });

  it("returns null when no scenario is current", () => {
    const scenarios = [
      decode(
        scenarioRow({
          id: "00000000-0000-0000-0000-000000000c01",
          is_current: false,
        })
      ),
    ];
    expect(findCurrentScenario(scenarios)).toBeNull();
  });

  it("ignores is_current on archived scenarios (defense-in-depth)", () => {
    // The DB partial unique index prevents this in production, but the
    // helper should still be defensive against a stale row.
    const scenarios = [
      decode(
        scenarioRow({
          id: "00000000-0000-0000-0000-000000000d01",
          is_current: true,
          archived_at: "2026-02-01T00:00:00.000Z",
        })
      ),
    ];
    expect(findCurrentScenario(scenarios)).toBeNull();
  });
});

describe("buildScenarioComparison", () => {
  it("computes outputs for each scenario against the shared capacity inputs", () => {
    const conservative = decodeLaunchPlanningScenario(
      scenarioRow({
        id: "00000000-0000-0000-0000-000000000e01",
        name: "Conservative",
        assumptions: {
          current_church_attendance: 100,
          expected_growth: 0,
          target_group_participation_pct: 0.5,
          launch_buffer_pct: 0.1,
          average_group_size: 10,
          leaders_per_new_group: 2,
        },
      })
    );
    const stretch = decodeLaunchPlanningScenario(
      scenarioRow({
        id: "00000000-0000-0000-0000-000000000e02",
        name: "Stretch",
        assumptions: {
          current_church_attendance: 200,
          expected_growth: 50,
          target_group_participation_pct: 0.8,
          launch_buffer_pct: 0.2,
          average_group_size: 10,
          leaders_per_new_group: 2,
        },
      })
    );
    const comparison = buildScenarioComparison([conservative, stretch], {
      effective_total_capacity: 80,
    });
    expect(comparison).toHaveLength(2);
    expect(comparison[0].scenario.name).toBe("Conservative");
    expect(comparison[1].scenario.name).toBe("Stretch");
    // Stretch's recommended_new_groups must exceed Conservative's because
    // demand is materially higher and capacity is the same.
    expect(comparison[1].outputs.recommended_new_groups).toBeGreaterThan(
      comparison[0].outputs.recommended_new_groups
    );
    // Risk level should escalate for Stretch given the much higher demand
    // and the same capacity.
    expect(comparison[1].outputs.risk_level).toBe("launch_needed");
  });

  it("returns an empty list when no scenarios are passed", () => {
    expect(
      buildScenarioComparison([], { effective_total_capacity: 100 })
    ).toEqual([]);
  });
});

describe("participationPct (Julian P2 answer 9)", () => {
  it("computes percent of the church in a group", () => {
    expect(participationPct(80, 100)).toBe(80);
    expect(participationPct(60, 100)).toBe(60);
  });

  it("rounds to the nearest whole percent", () => {
    expect(participationPct(1, 3)).toBe(33);
    expect(participationPct(2, 3)).toBe(67);
  });

  it("returns null when there is no usable denominator", () => {
    expect(participationPct(80, null)).toBeNull();
    expect(participationPct(80, 0)).toBeNull();
    expect(participationPct(80, -5)).toBeNull();
  });
});

describe("nextSeasonAnchorIso (Julian P3 answer 11)", () => {
  it("returns this year's August when today is before August", () => {
    expect(nextSeasonAnchorIso(8, new Date("2026-05-28T00:00:00Z"))).toBe(
      "2026-08-01"
    );
  });

  it("rolls August to next year once it has passed", () => {
    expect(nextSeasonAnchorIso(8, new Date("2026-09-15T00:00:00Z"))).toBe(
      "2027-08-01"
    );
  });

  it("returns the upcoming January", () => {
    expect(nextSeasonAnchorIso(1, new Date("2026-05-28T00:00:00Z"))).toBe(
      "2027-01-01"
    );
  });

  it("treats the anchor day itself as still upcoming", () => {
    expect(nextSeasonAnchorIso(8, new Date("2026-08-01T00:00:00Z"))).toBe(
      "2026-08-01"
    );
  });
});

// ---------------------------------------------------------------------------
// #186 — staffing supply vs demand (the leader gap)
// ---------------------------------------------------------------------------

describe("scenarioTargetDateIso", () => {
  const today = new Date("2026-05-28T00:00:00Z");

  it("uses an explicit month + year", () => {
    expect(
      scenarioTargetDateIso(
        { target_launch_month: 8, target_launch_year: 2026 },
        today
      )
    ).toBe("2026-08-01");
  });

  it("falls back to the next season anchor when only the month is set", () => {
    expect(
      scenarioTargetDateIso(
        { target_launch_month: 8, target_launch_year: null },
        today
      )
    ).toBe("2026-08-01");
    // January is already past in May → next January is 2027.
    expect(
      scenarioTargetDateIso(
        { target_launch_month: 1, target_launch_year: null },
        today
      )
    ).toBe("2027-01-01");
  });

  it("returns null when no season is chosen", () => {
    expect(
      scenarioTargetDateIso(
        { target_launch_month: null, target_launch_year: 2026 },
        today
      )
    ).toBeNull();
  });
});

describe("countStaffingSupply", () => {
  const apprentices: StaffingApprentice[] = [
    { stage: "ready_to_lead", expectedReadyOn: null },
    { stage: "in_training", expectedReadyOn: "2026-07-01" },
    { stage: "in_training", expectedReadyOn: "2026-09-01" },
    { stage: "identified", expectedReadyOn: null },
    { stage: "launched", expectedReadyOn: "2025-01-01" },
  ];

  it("counts Ready + projected-ready by the target date", () => {
    // Ready now + the July in-training one ready by August = 2.
    expect(countStaffingSupply(apprentices, "2026-08-01")).toBe(2);
  });

  it("counts only currently-Ready when there is no target date", () => {
    expect(countStaffingSupply(apprentices, null)).toBe(1);
  });
});

describe("computeStaffingForecast", () => {
  it("demand = launches × leaders/group; gap = demand − supply", () => {
    const f = computeStaffingForecast({
      plannedLaunchCount: 3,
      leadersPerNewGroup: 2,
      staffingSupply: 2,
    });
    // 3 groups × 2 = need 6 leaders; 2 Ready → short 4.
    expect(f.demand).toBe(6);
    expect(f.supply).toBe(2);
    expect(f.gap).toBe(4);
    expect(f.shortfall).toBe(4);
  });

  it("reports a surplus as a negative gap with zero shortfall", () => {
    const f = computeStaffingForecast({
      plannedLaunchCount: 1,
      leadersPerNewGroup: 2,
      staffingSupply: 5,
    });
    expect(f.gap).toBe(-3);
    expect(f.shortfall).toBe(0);
  });
});

describe("buildStaffingForecast (the walkthrough number)", () => {
  it("ties the launch plan to the pipeline: 3 by August, 1 Ready → short 5", () => {
    const apprentices: StaffingApprentice[] = [
      { stage: "ready_to_lead", expectedReadyOn: null },
      { stage: "identified", expectedReadyOn: null },
    ];
    const f = buildStaffingForecast(
      {
        planned_launch_count: 3,
        leaders_per_new_group: 2,
        target_launch_month: 8,
        target_launch_year: 2026,
      },
      apprentices,
      new Date("2026-06-01T00:00:00Z")
    );
    expect(f.targetDateIso).toBe("2026-08-01");
    expect(f.demand).toBe(6);
    expect(f.supply).toBe(1);
    expect(f.shortfall).toBe(5);
  });
});
