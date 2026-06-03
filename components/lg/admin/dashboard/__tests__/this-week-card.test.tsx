import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ThisWeekCard } from "../ThisWeekCard";
import { ADMIN_FALLBACK } from "@/lib/dashboard/fallback-data";
import type {
  AdminDashboardData,
  LaunchPlanningDashboardSnapshot,
} from "@/lib/dashboard/types";

// Render the metadata-only Home "This week" card to static markup (node env, no
// jsdom needed — the card is pure presentational) and assert the round-3 gating
// behaviour: a single SHARED church-local week-ahead horizon for the launch
// milestone, and a launch-unavailable partial state instead of "nothing
// scheduled" when the launch read failed.

function makeData(
  overrides: {
    dueFollowUpsThisWeekCount?: number;
    weekAheadCutoffIso?: string;
    launchPlanning?: Partial<LaunchPlanningDashboardSnapshot>;
  } = {}
): AdminDashboardData {
  return {
    ...ADMIN_FALLBACK,
    dueFollowUpsThisWeekCount: overrides.dueFollowUpsThisWeekCount ?? 0,
    weekAheadCutoffIso: overrides.weekAheadCutoffIso ?? "2026-05-25",
    launchPlanning: {
      ...ADMIN_FALLBACK.launchPlanning,
      available: true,
      suggestedLaunchByDate: null,
      recommendedNewGroups: 0,
      ...overrides.launchPlanning,
    },
  };
}

describe("ThisWeekCard", () => {
  it("shows the launch milestone when it falls on or before the shared cutoff", () => {
    const html = renderToStaticMarkup(
      <ThisWeekCard
        data={makeData({
          weekAheadCutoffIso: "2026-05-25",
          launchPlanning: {
            suggestedLaunchByDate: "2026-05-25",
            recommendedNewGroups: 2,
          },
        })}
      />
    );
    expect(html).toContain("Suggested launch by");
    expect(html).toContain("Recommended new groups");
    expect(html).not.toContain("Nothing scheduled");
  });

  it("drops the launch milestone (and the new-groups row tied to it) when it is one day past the shared cutoff", () => {
    // The day just past the church-local horizon: the card must NOT treat it as
    // this-week work, matching the follow-up window. With no other rows this
    // renders the empty state rather than a launch milestone the count read
    // would have excluded (Codex round 3 — one shared horizon, not two).
    const html = renderToStaticMarkup(
      <ThisWeekCard
        data={makeData({
          weekAheadCutoffIso: "2026-05-25",
          launchPlanning: {
            suggestedLaunchByDate: "2026-05-26",
            recommendedNewGroups: 2,
          },
        })}
      />
    );
    expect(html).not.toContain("Suggested launch by");
    expect(html).not.toContain("Recommended new groups");
    expect(html).toContain("Nothing scheduled");
  });

  it("surfaces a launch-unavailable note instead of 'nothing scheduled' when the launch read failed", () => {
    const html = renderToStaticMarkup(
      <ThisWeekCard
        data={makeData({
          launchPlanning: { available: false, error: "boom" },
        })}
      />
    );
    expect(html).toContain("Launch outlook");
    expect(html).toContain("Unavailable right now");
    expect(html).not.toContain("Nothing scheduled");
  });

  it("keeps follow-up rows working when the launch read failed", () => {
    const html = renderToStaticMarkup(
      <ThisWeekCard
        data={makeData({
          dueFollowUpsThisWeekCount: 3,
          launchPlanning: { available: false, error: "boom" },
        })}
      />
    );
    expect(html).toContain("Follow-ups due");
    expect(html).toContain("3 due in the next 7 days");
    expect(html).toContain("Launch outlook");
  });

  it("suppresses all week-ahead data (including the launch-unavailable note) when the whole dashboard degraded", () => {
    const html = renderToStaticMarkup(
      <ThisWeekCard
        data={makeData({
          dueFollowUpsThisWeekCount: 3,
          launchPlanning: { available: false, error: "boom" },
        })}
        degraded
      />
    );
    expect(html).toContain("The week ahead is unavailable right now.");
    expect(html).not.toContain("Launch outlook");
    expect(html).not.toContain("Follow-ups due");
  });
});
