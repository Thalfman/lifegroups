import { describe, expect, it } from "vitest";

import {
  buildGroupHealthData,
  type GroupHealthReads,
} from "@/components/admin/group-health/group-health-data";
import type { GroupHealthOverviewRow } from "@/lib/admin/group-health-read";
import type { ReadResult } from "@/lib/supabase/read-core";
import type { AppSettingsRow } from "@/types/database";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });

function overviewRow(
  overrides: Partial<GroupHealthOverviewRow> = {}
): GroupHealthOverviewRow {
  return {
    group_id: "g-1",
    group_name: "Tuesday Night",
    attendance_pct: 80,
    attendance_weeks_counted: 4,
    spiritual_growth_score: 4,
    spiritual_growth_note: null,
    group_question_score: 3,
    group_question_leader_reported: false,
    computed_letter: "B",
    last_check_in_week: "2026-06-08",
    last_saved_at: null,
    stale: false,
    unassessed: false,
    needs_follow_up: false,
    attendance_declining: false,
    ...overrides,
  };
}

function metricDefaultsRow(value: Record<string, unknown>): AppSettingsRow {
  return {
    id: "settings-1",
    setting_key: "metric_defaults",
    setting_value: value,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

// Sibling to group-health-data.test.ts (error status / ranking / defaults
// fallback): this file pins the config plumbing — the period round-trip, the
// operator-editable question wordings, and the director's Watch grade — plus
// the ungraded-last ranking rule. Same in-memory adapter, same seam.
function emptyReads(
  overrides: Partial<GroupHealthReads> = {}
): GroupHealthReads {
  return {
    listGroupHealthOverview: async () => ok([]),
    fetchPlatformConfig: async () => ok(null),
    fetchMetricDefaults: async () => ok(null),
    ...overrides,
  };
}

describe("buildGroupHealthData — config resolution", () => {
  it("renders the documented placeholders and default Watch grade with no config rows", async () => {
    const view = await buildGroupHealthData(emptyReads(), {
      period: "2026-06-01",
    });

    expect(view.status).toBe("ok");
    if (view.status !== "ok") return;
    expect(view.rows).toEqual([]);
    // The code-level placeholders — the UI must never render blank labels.
    expect(view.spiritualGrowthLabel).toBe("Spiritual growth (1–5)");
    expect(view.groupQuestionLabel).toBe(
      "Group engagement — leader-reported (1–5)"
    );
    expect(view.watchGrade).toBe("C");
  });

  it("passes the requested period to the overview read and round-trips it into the view", async () => {
    let askedPeriod: string | undefined;
    const view = await buildGroupHealthData(
      emptyReads({
        listGroupHealthOverview: async (period) => {
          askedPeriod = period;
          return ok([]);
        },
      }),
      { period: "2026-05-01" }
    );

    expect(askedPeriod).toBe("2026-05-01");
    expect(view.status).toBe("ok");
    if (view.status !== "ok") return;
    expect(view.period).toBe("2026-05-01");
  });

  it("resolves operator-set copy from platform_config, falling back per key", async () => {
    const view = await buildGroupHealthData(
      emptyReads({
        fetchPlatformConfig: async () =>
          ok({
            setting_key: "platform_config",
            setting_value: {
              editable_copy: {
                "group_health.spiritual_growth_question":
                  "How is the group growing spiritually?",
              },
            },
          }),
      }),
      { period: "2026-06-01" }
    );

    expect(view.status).toBe("ok");
    if (view.status !== "ok") return;
    // The set key wins; the unset key falls back to its placeholder (the
    // graceful path a ministry_admin always takes — RLS hides the row).
    expect(view.spiritualGrowthLabel).toBe(
      "How is the group growing spiritually?"
    );
    expect(view.groupQuestionLabel).toBe(
      "Group engagement — leader-reported (1–5)"
    );
  });

  it("sources the director's Watch grade from the metric_defaults row", async () => {
    const view = await buildGroupHealthData(
      emptyReads({
        fetchMetricDefaults: async () =>
          ok(metricDefaultsRow({ group_health_watch_grade: "B" })),
      }),
      { period: "2026-06-01" }
    );

    expect(view.status).toBe("ok");
    if (view.status !== "ok") return;
    expect(view.watchGrade).toBe("B");
  });

  it("ranks best-to-worst with ungraded groups last, keeping the full overview rows", async () => {
    const view = await buildGroupHealthData(
      emptyReads({
        listGroupHealthOverview: async () =>
          ok([
            overviewRow({
              group_id: "g-b",
              group_name: "Beta",
              computed_letter: "D",
            }),
            overviewRow({
              group_id: "g-u",
              group_name: "Unrated",
              computed_letter: null,
              unassessed: true,
            }),
            overviewRow({
              group_id: "g-a",
              group_name: "Alpha",
              computed_letter: "A",
            }),
          ]),
      }),
      { period: "2026-06-01" }
    );

    expect(view.status).toBe("ok");
    if (view.status !== "ok") return;
    expect(view.rows.map((r) => r.group_id)).toEqual(["g-a", "g-b", "g-u"]);
    // The ranked rows are the overview rows themselves (not a projection), so
    // the triage table keeps every column.
    expect(view.rows[0].attendance_pct).toBe(80);
  });
});
