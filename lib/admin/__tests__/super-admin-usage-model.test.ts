import { describe, expect, it } from "vitest";
import {
  buildUsagePanelModel,
  labelForArea,
} from "@/lib/admin/super-admin-usage-model";
import { formatStatusTime } from "@/lib/admin/super-admin-console-model";
import type { UsageEventsRow } from "@/types/database";

const TRACKING_ON = { usage_tracking: { enabled: true } };

let nextId = 0;
function usageEvent(overrides: Partial<UsageEventsRow>): UsageEventsRow {
  nextId += 1;
  return {
    id: `event-${nextId}`,
    actor_profile_id: null,
    event_type: "area_view",
    area: null,
    created_at: "2026-01-05T12:30:00Z",
    ...overrides,
  };
}

function login(actorId: string | null): UsageEventsRow {
  return usageEvent({ event_type: "login", actor_profile_id: actorId });
}

function areaView(area: string | null, actorId?: string): UsageEventsRow {
  return usageEvent({ area, actor_profile_id: actorId ?? null });
}

const NO_PROFILES = new Map<string, { full_name: string }>();

describe("buildUsagePanelModel — empty states", () => {
  it("tells tracking-off apart from on-but-quiet", () => {
    const off = buildUsagePanelModel({
      events: [],
      profilesById: NO_PROFILES,
      featureFlags: {},
    });
    expect(off.trackingOn).toBe(false);
    expect(off.emptyState).toBe("tracking-off");

    const on = buildUsagePanelModel({
      events: [],
      profilesById: NO_PROFILES,
      featureFlags: TRACKING_ON,
    });
    expect(on.trackingOn).toBe(true);
    expect(on.emptyState).toBe("tracking-on");
  });

  it("keeps already-recorded events visible after tracking turns off", () => {
    const model = buildUsagePanelModel({
      events: [login("p1")],
      profilesById: NO_PROFILES,
      featureFlags: {},
    });
    expect(model.trackingOn).toBe(false);
    expect(model.emptyState).toBeNull();
    expect(model.loginCount).toBe(1);
  });
});

describe("buildUsagePanelModel — tallies", () => {
  it("splits logins from area views and dedupes people seen", () => {
    const model = buildUsagePanelModel({
      events: [
        login("p1"),
        login(null),
        areaView("care", "p1"),
        areaView("plan", "p2"),
      ],
      profilesById: NO_PROFILES,
      featureFlags: TRACKING_ON,
    });
    expect(model.loginCount).toBe(2);
    expect(model.areaViewCount).toBe(2);
    // p1 twice + an anonymous login counts as two distinct people.
    expect(model.peopleSeenCount).toBe(2);
  });

  it("orders areas busiest first, ties by first appearance", () => {
    const model = buildUsagePanelModel({
      events: [
        areaView("plan"),
        areaView("care"),
        areaView("care"),
        areaView(null),
      ],
      profilesById: NO_PROFILES,
      featureFlags: TRACKING_ON,
    });
    expect(model.areaRows).toEqual([
      { area: "care", label: "Care", count: 2, barPercent: 100 },
      { area: "plan", label: "Plan", count: 1, barPercent: 50 },
      // A null area folds into "unknown" rather than vanishing from the tally.
      { area: "unknown", label: "Unknown", count: 1, barPercent: 50 },
    ]);
  });
});

describe("buildUsagePanelModel — recent sign-ins", () => {
  it("caps the list at ten, newest-first input order preserved", () => {
    const events = Array.from({ length: 12 }, (_, i) => login(`p${i}`));
    const model = buildUsagePanelModel({
      events,
      profilesById: NO_PROFILES,
      featureFlags: TRACKING_ON,
    });
    expect(model.recentLogins).toHaveLength(10);
    expect(model.recentLogins[0].id).toBe(events[0].id);
    expect(model.recentLogins[9].id).toBe(events[9].id);
  });

  it("names the actor from the profile map and falls back to Unknown", () => {
    const model = buildUsagePanelModel({
      events: [login("p1"), login("p-missing"), login(null)],
      profilesById: new Map([["p1", { full_name: "Julian Reyes" }]]),
      featureFlags: TRACKING_ON,
    });
    expect(model.recentLogins.map((l) => l.name)).toEqual([
      "Julian Reyes",
      "Unknown",
      "Unknown",
    ]);
    // Pre-formatted with the hydration-safe status-time format (the panel
    // appends " UTC").
    expect(model.recentLogins[0].at).toBe(
      formatStatusTime("2026-01-05T12:30:00Z")
    );
  });
});

describe("labelForArea", () => {
  it("capitalises the first segment and spaces the hyphens", () => {
    expect(labelForArea("super-admin")).toBe("Super admin");
    expect(labelForArea("shepherd-care")).toBe("Shepherd care");
    expect(labelForArea("care")).toBe("Care");
  });
});
