import { describe, expect, it } from "vitest";
import {
  buildOverrideRows,
  overrideSummaryChips,
} from "@/lib/admin/group-metric-overrides";
import { group, settings } from "@/lib/dashboard/group-fixtures";

describe("buildOverrideRows", () => {
  it("keeps only settings rows with at least one active override", () => {
    const rows = buildOverrideRows(
      [group({ id: "g-1", name: "Anderson" })],
      [
        settings({ group_id: "g-1", capacity_override: 14 }),
        // A row with every override cleared is treated as "no row" — the
        // hasActiveOverrides predicate (lib/admin/metrics) filters it out.
        settings({ group_id: "g-1" }),
      ]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.settings.capacity_override).toBe(14);
  });

  it("drops a settings row whose group is missing from the loaded set", () => {
    const rows = buildOverrideRows(
      [group({ id: "g-1", name: "Anderson" })],
      [settings({ group_id: "g-gone", capacity_override: 10 })]
    );
    expect(rows).toHaveLength(0);
  });

  it("sorts by group name and joins each row to its group", () => {
    const rows = buildOverrideRows(
      [
        group({ id: "g-z", name: "Zion" }),
        group({ id: "g-a", name: "Anderson" }),
      ],
      [
        settings({ group_id: "g-z", exclude_from_capacity_metrics: true }),
        settings({ group_id: "g-a", capacity_override: 8 }),
      ]
    );
    expect(rows.map((r) => r.group.name)).toEqual(["Anderson", "Zion"]);
  });
});

describe("overrideSummaryChips", () => {
  it("is empty for a settings row with no active overrides", () => {
    expect(overrideSummaryChips(settings({ group_id: "g-1" }))).toEqual([]);
  });

  it("emits one chip per override, in display order", () => {
    const chips = overrideSummaryChips(
      settings({
        group_id: "g-1",
        capacity_override: 14,
        capacity_warning_threshold_pct_override: 80,
        healthy_attendance_pct_override: 60,
        manual_health_status_override: "watch",
        exclude_from_capacity_metrics: true,
        admin_metric_notes: "Watching this one.",
      })
    );
    expect(chips.map((c) => c.key)).toEqual([
      "cap",
      "warn",
      "att",
      "health",
      "ex",
      "note",
    ]);
    expect(chips.map((c) => c.label)).toEqual([
      "Capacity 14",
      "Warning 80%",
      "Healthy ≥ 60%",
      "Health: Watch",
      "Excluded from capacity",
      "Has notes",
    ]);
  });

  it("echoes the CANONICAL health-status label, never de-underscored enum text (#478)", () => {
    const chips = overrideSummaryChips(
      settings({
        group_id: "g-1",
        manual_health_status_override: "needs_follow_up",
      })
    );
    expect(chips).toEqual([
      { key: "health", label: "Health: Needs follow-up", tone: "watch" },
    ]);
  });

  it("carries the warning tones for manual health and capacity exclusion", () => {
    const chips = overrideSummaryChips(
      settings({
        group_id: "g-1",
        manual_health_status_override: "watch",
        exclude_from_capacity_metrics: true,
      })
    );
    expect(chips.map((c) => c.tone)).toEqual(["watch", "followup"]);
  });

  it("a whitespace-only note earns no chip", () => {
    expect(
      overrideSummaryChips(
        settings({ group_id: "g-1", admin_metric_notes: "   " })
      )
    ).toEqual([]);
  });

  it("a zero threshold still counts as an override (null-vs-0 guard)", () => {
    const chips = overrideSummaryChips(
      settings({ group_id: "g-1", healthy_attendance_pct_override: 0 })
    );
    expect(chips.map((c) => c.label)).toEqual(["Healthy ≥ 0%"]);
  });
});
