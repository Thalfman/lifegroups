import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ThisWeekCard } from "../ThisWeekCard";
import { ADMIN_FALLBACK } from "@/lib/dashboard/fallback-data";
import type {
  AdminDashboardData,
  LaunchPlanningDashboardSnapshot,
} from "@/lib/dashboard/types";

// Render the metadata-only Home "This week" card to static markup (node env, no
// jsdom needed — the card is pure presentational) and assert the post-pivot
// behaviour (ADR 0016): the card is follow-ups only. The launch-planning
// milestone/capacity rows and the "View planning" action were removed, so the
// card must NOT surface launch data or link to the hidden Planning shell even
// when launch-planning data is present in the dashboard read.

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
  it("shows due follow-ups and links to the follow-up workflow", () => {
    const html = renderToStaticMarkup(
      <ThisWeekCard data={makeData({ dueFollowUpsThisWeekCount: 3 })} />
    );
    expect(html).toContain("Follow-ups due");
    expect(html).toContain("3 due in the next 7 days");
    expect(html).toContain("Work follow-ups");
    expect(html).toContain("/admin/follow-ups");
  });

  it("renders the empty state with no action when nothing is due", () => {
    const html = renderToStaticMarkup(
      <ThisWeekCard data={makeData({ dueFollowUpsThisWeekCount: 0 })} />
    );
    expect(html).toContain("The week ahead is clear");
    expect(html).not.toContain("Work follow-ups");
    expect(html).not.toContain("/admin/follow-ups");
  });

  it("never surfaces launch-planning rows or links, even when launch data is present", () => {
    // The launch milestone/capacity rows were removed in the pivot (ADR 0016);
    // launch planning is a hidden surface tracked elsewhere. Even with a launch
    // date inside the window and an unavailable read, the card stays follow-ups
    // only and never links to the hidden Planning shell.
    const html = renderToStaticMarkup(
      <ThisWeekCard
        data={makeData({
          dueFollowUpsThisWeekCount: 2,
          weekAheadCutoffIso: "2026-05-25",
          launchPlanning: {
            suggestedLaunchByDate: "2026-05-25",
            recommendedNewGroups: 4,
          },
        })}
      />
    );
    expect(html).not.toContain("Suggested launch by");
    expect(html).not.toContain("Recommended new groups");
    expect(html).not.toContain("Launch outlook");
    expect(html).not.toContain("View planning");
    expect(html).not.toContain("/admin/launch-planning");
  });

  it("does not surface a launch-unavailable note when the launch read failed", () => {
    const html = renderToStaticMarkup(
      <ThisWeekCard
        data={makeData({
          dueFollowUpsThisWeekCount: 1,
          launchPlanning: { available: false, error: "boom" },
        })}
      />
    );
    expect(html).toContain("Follow-ups due");
    expect(html).not.toContain("Launch outlook");
    expect(html).not.toContain("/admin/launch-planning");
  });

  it("suppresses the week-ahead rows when the whole dashboard degraded", () => {
    const html = renderToStaticMarkup(
      <ThisWeekCard
        data={makeData({ dueFollowUpsThisWeekCount: 3 })}
        degraded
      />
    );
    expect(html).toContain("The week ahead is unavailable right now.");
    expect(html).not.toContain("Follow-ups due");
    // The launch milestone is gone for good, degraded or not.
    expect(html).not.toContain("/admin/launch-planning");
  });
});
