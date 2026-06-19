import { describe, expect, it } from "vitest";
import {
  buildUsagePanelModel,
  labelForArea,
  listUsagePeople,
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

describe("buildUsagePanelModel — by person", () => {
  it("groups each actor's logins and area views, excluding null actors", () => {
    const model = buildUsagePanelModel({
      events: [
        login("p1"),
        areaView("care", "p1"),
        areaView("plan", "p1"),
        login("p2"),
        areaView(null), // anonymous — not attributable, so it drops out
      ],
      profilesById: new Map([
        ["p1", { full_name: "Julian Reyes" }],
        ["p2", { full_name: "Tom Halfman" }],
      ]),
      featureFlags: TRACKING_ON,
    });
    expect(model.byPerson).toHaveLength(2);
    const julian = model.byPerson.find((p) => p.id === "p1");
    expect(julian).toMatchObject({
      name: "Julian Reyes",
      loginCount: 1,
      areaViewCount: 2,
    });
    const tom = model.byPerson.find((p) => p.id === "p2");
    expect(tom).toMatchObject({
      name: "Tom Halfman",
      loginCount: 1,
      areaViewCount: 0,
    });
  });

  it("falls back to Unknown when the actor isn't in the profile map", () => {
    const model = buildUsagePanelModel({
      events: [login("p-missing")],
      profilesById: NO_PROFILES,
      featureFlags: TRACKING_ON,
    });
    expect(model.byPerson).toHaveLength(1);
    expect(model.byPerson[0].name).toBe("Unknown");
  });

  it("orders by total activity, then by name for ties", () => {
    const model = buildUsagePanelModel({
      events: [
        // p2: 1 event; p1: 3 events; p3: 1 event (ties p2 by total).
        login("p2"),
        login("p1"),
        areaView("care", "p1"),
        areaView("plan", "p1"),
        login("p3"),
      ],
      profilesById: new Map([
        ["p1", { full_name: "Alice" }],
        ["p2", { full_name: "Zoe" }],
        ["p3", { full_name: "Amir" }],
      ]),
      featureFlags: TRACKING_ON,
    });
    // Alice (3) leads; Amir before Zoe on the 1-event tie (name order).
    expect(model.byPerson.map((p) => p.name)).toEqual(["Alice", "Amir", "Zoe"]);
  });

  it("reports the newest event time as lastSeenAt, ignoring input order", () => {
    const model = buildUsagePanelModel({
      events: [
        usageEvent({
          event_type: "login",
          actor_profile_id: "p1",
          created_at: "2026-01-05T09:00:00Z",
        }),
        usageEvent({
          event_type: "area_view",
          area: "care",
          actor_profile_id: "p1",
          created_at: "2026-01-05T15:00:00Z",
        }),
      ],
      profilesById: new Map([["p1", { full_name: "Julian Reyes" }]]),
      featureFlags: TRACKING_ON,
    });
    expect(model.byPerson[0].lastSeenAt).toBe(
      formatStatusTime("2026-01-05T15:00:00Z")
    );
  });
});

describe("buildUsagePanelModel — person filter (selectedActorIds)", () => {
  const profiles = new Map([
    ["p1", { full_name: "Julian Reyes" }],
    ["p2", { full_name: "Tom Halfman" }],
  ]);

  it("narrows every tally to the selected actors", () => {
    const events = [
      login("p1"),
      areaView("care", "p1"),
      login("p2"),
      areaView("plan", "p2"),
      login(null), // anonymous — outside any person selection
    ];
    const model = buildUsagePanelModel({
      events,
      profilesById: profiles,
      featureFlags: TRACKING_ON,
      selectedActorIds: ["p1"],
    });
    expect(model.loginCount).toBe(1);
    expect(model.areaViewCount).toBe(1);
    expect(model.peopleSeenCount).toBe(1);
    expect(model.areaRows).toEqual([
      { area: "care", label: "Care", count: 1, barPercent: 100 },
    ]);
    expect(model.recentLogins).toHaveLength(1);
    expect(model.recentLogins[0].name).toBe("Julian Reyes");
    expect(model.byPerson).toHaveLength(1);
    expect(model.byPerson[0].id).toBe("p1");
  });

  it("treats null selectedActorIds as no filter, matching the omitted case", () => {
    const events = [login("p1"), areaView("plan", "p2"), login(null)];
    const unfiltered = buildUsagePanelModel({
      events,
      profilesById: profiles,
      featureFlags: TRACKING_ON,
    });
    const explicitNull = buildUsagePanelModel({
      events,
      profilesById: profiles,
      featureFlags: TRACKING_ON,
      selectedActorIds: null,
    });
    expect(explicitNull).toEqual(unfiltered);
    // The anonymous login is kept in the login tally when there's no person
    // filter, but only the two attributable actors count as people seen.
    expect(explicitNull.loginCount).toBe(2);
    expect(explicitNull.peopleSeenCount).toBe(2);
  });

  it("keeps emptyState null on a selection that matches no events", () => {
    const model = buildUsagePanelModel({
      events: [login("p1"), login("p2")],
      profilesById: profiles,
      featureFlags: TRACKING_ON,
      selectedActorIds: ["nobody"],
    });
    // There IS recorded activity, so the panel must not flip to a tracking
    // empty-state — the sub-sections just render their own empty lines.
    expect(model.emptyState).toBeNull();
    expect(model.loginCount).toBe(0);
    expect(model.recentLogins).toHaveLength(0);
    expect(model.byPerson).toHaveLength(0);
  });
});

describe("listUsagePeople", () => {
  it("lists distinct attributable actors, name-resolved and sorted by name", () => {
    const people = listUsagePeople({
      events: [
        login("p2"),
        areaView("care", "p1"),
        login("p1"), // p1 again — deduped
        login("p3"), // not in the profile map
        areaView(null), // anonymous — excluded
      ],
      profilesById: new Map([
        ["p1", { full_name: "Alice" }],
        ["p2", { full_name: "Zoe" }],
      ]),
    });
    expect(people).toEqual([
      { id: "p1", name: "Alice" },
      { id: "p3", name: "Unknown" },
      { id: "p2", name: "Zoe" },
    ]);
  });

  it("returns an empty list when there are no attributable events", () => {
    expect(
      listUsagePeople({
        events: [login(null), areaView("care")],
        profilesById: NO_PROFILES,
      })
    ).toEqual([]);
  });
});

describe("labelForArea", () => {
  it("capitalises the first segment and spaces the hyphens", () => {
    expect(labelForArea("super-admin")).toBe("Super admin");
    expect(labelForArea("shepherd-care")).toBe("Shepherd care");
    expect(labelForArea("care")).toBe("Care");
  });
});
