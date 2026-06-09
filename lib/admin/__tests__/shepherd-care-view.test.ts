import { describe, expect, it } from "vitest";
import {
  buildShepherdCareTriageLink,
  buildShepherdCareViewHref,
  normalizeCareTabKey,
  resolveCareInitialTabFromParams,
  resolveCoverageFilter,
  resolveDirectoryFilter,
  resolveShepherdCareView,
  resolveShepherdCareViewState,
} from "@/lib/admin/shepherd-care-view";

const UUID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const UUID_UPPER = "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA";

describe("resolveShepherdCareView", () => {
  it("defaults to dashboard when the param is absent", () => {
    expect(resolveShepherdCareView(undefined)).toBe("dashboard");
  });

  it("resolves directory when set", () => {
    expect(resolveShepherdCareView("directory")).toBe("directory");
  });

  it("falls back to dashboard for an unrecognised value", () => {
    expect(resolveShepherdCareView("nonsense")).toBe("dashboard");
    expect(resolveShepherdCareView("")).toBe("dashboard");
  });

  it("reads the first value of a repeated param", () => {
    expect(resolveShepherdCareView(["directory", "dashboard"])).toBe(
      "directory"
    );
    expect(resolveShepherdCareView(["bogus"])).toBe("dashboard");
  });
});

describe("resolveDirectoryFilter", () => {
  it("defaults to all", () => {
    expect(resolveDirectoryFilter(undefined)).toBe("all");
    expect(resolveDirectoryFilter("whatever")).toBe("all");
  });

  it("resolves needs_attention", () => {
    expect(resolveDirectoryFilter("needs_attention")).toBe("needs_attention");
    expect(resolveDirectoryFilter(["needs_attention"])).toBe("needs_attention");
  });
});

describe("resolveCoverageFilter", () => {
  it("returns undefined for absent / empty", () => {
    expect(resolveCoverageFilter(undefined)).toBeUndefined();
    expect(resolveCoverageFilter("")).toBeUndefined();
  });

  it("resolves the unassigned sentinel", () => {
    expect(resolveCoverageFilter("unassigned")).toBe("unassigned");
  });

  it("lowercases a valid over-shepherd uuid", () => {
    expect(resolveCoverageFilter(UUID_UPPER)).toBe(UUID);
  });

  it("rejects a non-uuid, non-sentinel value", () => {
    expect(resolveCoverageFilter("not-a-uuid")).toBeUndefined();
  });
});

describe("resolveShepherdCareViewState", () => {
  it("defaults to the dashboard view with all/any filters", () => {
    expect(resolveShepherdCareViewState({})).toEqual({
      view: "dashboard",
      filter: "all",
      coverage: undefined,
    });
  });

  it("resolves the directory view with filter + coverage params", () => {
    expect(
      resolveShepherdCareViewState({
        view: "directory",
        filter: "needs_attention",
        coverage: "unassigned",
      })
    ).toEqual({
      view: "directory",
      filter: "needs_attention",
      coverage: "unassigned",
    });
  });

  it("renders dashboard for an unrecognised view while still reading filters", () => {
    expect(
      resolveShepherdCareViewState({ view: "weird", coverage: UUID })
    ).toEqual({
      view: "dashboard",
      filter: "all",
      coverage: UUID,
    });
  });
});

describe("buildShepherdCareViewHref", () => {
  // #468: every emitted URL targets the canonical Care page, never the legacy
  // /admin/shepherd-care alias (which still alias-renders for old bookmarks).
  it("targets the canonical /admin/care base path", () => {
    expect(buildShepherdCareViewHref({ view: "dashboard" })).toMatch(
      /^\/admin\/care(\?|$)/
    );
    expect(buildShepherdCareViewHref({ view: "directory" })).toMatch(
      /^\/admin\/care\?/
    );
  });

  it("omits the view param for the default dashboard view", () => {
    expect(buildShepherdCareViewHref({ view: "dashboard" })).toBe(
      "/admin/care"
    );
  });

  it("sets view=directory and carries filter + coverage", () => {
    expect(
      buildShepherdCareViewHref({
        view: "directory",
        filter: "needs_attention",
        coverage: "unassigned",
      })
    ).toBe(
      "/admin/care?view=directory&filter=needs_attention&coverage=unassigned"
    );
  });

  it("omits the all filter and an absent/null coverage", () => {
    expect(
      buildShepherdCareViewHref({
        view: "directory",
        filter: "all",
        coverage: undefined,
      })
    ).toBe("/admin/care?view=directory");
    expect(
      buildShepherdCareViewHref({ view: "directory", coverage: null })
    ).toBe("/admin/care?view=directory");
  });

  it("carries a coverage uuid on a dashboard-rooted URL", () => {
    expect(
      buildShepherdCareViewHref({ view: "dashboard", coverage: UUID })
    ).toBe(`/admin/care?coverage=${UUID}`);
  });
});

// #477 — the six-tab IA collapsed to four canonical tabs, but every legacy
// tab key stays an accepted input forever: a bookmarked key must land on the
// canonical tab that absorbed its surface, never 404 or select a tab that no
// longer renders.
describe("normalizeCareTabKey", () => {
  it("passes the canonical four through unchanged", () => {
    expect(normalizeCareTabKey("over-shepherds")).toBe("over-shepherds");
    expect(normalizeCareTabKey("all-leaders")).toBe("all-leaders");
    expect(normalizeCareTabKey("follow-ups")).toBe("follow-ups");
    expect(normalizeCareTabKey("recent-interactions")).toBe(
      "recent-interactions"
    );
  });

  it("maps the legacy dashboard and directory keys onto All leaders", () => {
    expect(normalizeCareTabKey("dashboard")).toBe("all-leaders");
    expect(normalizeCareTabKey("directory")).toBe("all-leaders");
  });

  it("maps the legacy coverage key onto Over-Shepherds", () => {
    expect(normalizeCareTabKey("coverage")).toBe("over-shepherds");
  });
});

// #334 / #468 / #477 — the embedded widgets and Home's Needs Attention actions
// drill down via the `view` / `filter` / `coverage` params (against /admin/care
// itself, while the /admin/shepherd-care and /admin/follow-ups aliases keep
// resolving the same params for old bookmarks). The landing must map those
// params onto the matching canonical tab, or every drill-down would reopen the
// default tab. Pin the full legacy param→tab matrix (and that the builders
// above produce params this resolver actually understands — i.e. the
// drill-down round-trips).
describe("resolveCareInitialTabFromParams", () => {
  it("falls back to the route default when no drill-down params are present", () => {
    expect(resolveCareInitialTabFromParams({}, "follow-ups")).toBe(
      "follow-ups"
    );
    expect(resolveCareInitialTabFromParams({}, "over-shepherds")).toBe(
      "over-shepherds"
    );
    expect(resolveCareInitialTabFromParams({}, "recent-interactions")).toBe(
      "recent-interactions"
    );
  });

  it("normalizes a legacy fallback key onto its canonical tab", () => {
    expect(resolveCareInitialTabFromParams({}, "dashboard")).toBe(
      "all-leaders"
    );
    expect(resolveCareInitialTabFromParams({}, "directory")).toBe(
      "all-leaders"
    );
    expect(resolveCareInitialTabFromParams({}, "coverage")).toBe(
      "over-shepherds"
    );
  });

  it("maps view=directory onto the All-leaders tab (#477)", () => {
    expect(
      resolveCareInitialTabFromParams({ view: "directory" }, "over-shepherds")
    ).toBe("all-leaders");
  });

  it("maps view=dashboard onto the All-leaders tab (#477)", () => {
    // The Dashboard's summary tiles + attention queue now lead the All-leaders
    // tab, so the legacy param lands where that content lives — overriding the
    // canonical default (the Over-Shepherd accordion).
    expect(
      resolveCareInitialTabFromParams({ view: "dashboard" }, "over-shepherds")
    ).toBe("all-leaders");
  });

  it("maps view=follow-ups onto the Follow-ups tab (#468)", () => {
    expect(
      resolveCareInitialTabFromParams({ view: "follow-ups" }, "over-shepherds")
    ).toBe("follow-ups");
    expect(
      resolveCareInitialTabFromParams({ view: ["follow-ups"] }, "dashboard")
    ).toBe("follow-ups");
  });

  it("leaves an unrecognised view on the route default", () => {
    expect(
      resolveCareInitialTabFromParams({ view: "nonsense" }, "over-shepherds")
    ).toBe("over-shepherds");
  });

  it("maps any coverage filter onto the Over-Shepherds tab (#477)", () => {
    // The accordion absorbed the Coverage tab: the Unassigned pane and the
    // coverage-management link live in the accordion region.
    expect(
      resolveCareInitialTabFromParams(
        { coverage: "unassigned" },
        "recent-interactions"
      )
    ).toBe("over-shepherds");
    expect(
      resolveCareInitialTabFromParams({ coverage: UUID }, "recent-interactions")
    ).toBe("over-shepherds");
  });

  it("prefers coverage over view for a coverage-rooted directory link", () => {
    // The legacy coverage drill-downs are directory-rooted (view stays
    // "directory") but carry a coverage param; coverage triage lives in the
    // accordion, so the coverage param wins.
    expect(
      resolveCareInitialTabFromParams(
        { view: "directory", coverage: UUID },
        "recent-interactions"
      )
    ).toBe("over-shepherds");
  });

  it("ignores an unrecognised coverage value (no false coverage landing)", () => {
    expect(
      resolveCareInitialTabFromParams(
        { coverage: "not-a-uuid" },
        "over-shepherds"
      )
    ).toBe("over-shepherds");
  });

  it("maps a bare filter=needs_attention onto the All-leaders tab (#477)", () => {
    // The filter pre-applies to the roster, so it must land where the roster
    // is — even without an accompanying view param.
    expect(
      resolveCareInitialTabFromParams(
        { filter: "needs_attention" },
        "over-shepherds"
      )
    ).toBe("all-leaders");
    // An unrecognised filter value selects nothing.
    expect(
      resolveCareInitialTabFromParams({ filter: "bogus" }, "over-shepherds")
    ).toBe("over-shepherds");
  });

  it("round-trips the builders' drill-down URLs to the intended tab", () => {
    // The roster's "All" filter chip.
    const directory = buildShepherdCareViewHref({ view: "directory" });
    expect(directory).toBe("/admin/care?view=directory");
    expect(
      resolveCareInitialTabFromParams({ view: "directory" }, "over-shepherds")
    ).toBe("all-leaders");

    // Needs-attention summary tile / filter chip / Home action: lands on the
    // All-leaders tab, where the page pre-applies the roster filter.
    const needsAttention = buildShepherdCareTriageLink({
      kind: "needs_attention",
    });
    expect(needsAttention).toBe(
      "/admin/care?view=directory&filter=needs_attention"
    );
    expect(
      resolveCareInitialTabFromParams(
        { view: "directory", filter: "needs_attention" },
        "over-shepherds"
      )
    ).toBe("all-leaders");

    // Unassigned-coverage tile + over-shepherd bucket: land on the accordion.
    const unassigned = buildShepherdCareTriageLink({ kind: "unassigned" });
    expect(unassigned).toBe("/admin/care?view=directory&coverage=unassigned");
    expect(
      resolveCareInitialTabFromParams(
        { view: "directory", coverage: "unassigned" },
        "recent-interactions"
      )
    ).toBe("over-shepherds");

    const overShepherd = buildShepherdCareTriageLink({
      kind: "over_shepherd",
      overShepherdId: UUID,
    });
    expect(overShepherd).toBe(`/admin/care?view=directory&coverage=${UUID}`);
    expect(
      resolveCareInitialTabFromParams(
        { view: "directory", coverage: UUID },
        "recent-interactions"
      )
    ).toBe("over-shepherds");
  });
});

describe("buildShepherdCareTriageLink", () => {
  it("maps needs_attention to the attention-filtered Directory URL", () => {
    expect(buildShepherdCareTriageLink({ kind: "needs_attention" })).toBe(
      "/admin/care?view=directory&filter=needs_attention"
    );
  });

  it("maps a specific over-shepherd id to its coverage param on the Directory", () => {
    expect(
      buildShepherdCareTriageLink({
        kind: "over_shepherd",
        overShepherdId: UUID,
      })
    ).toBe(`/admin/care?view=directory&coverage=${UUID}`);
  });

  it("maps unassigned to the unassigned coverage param on the Directory", () => {
    expect(buildShepherdCareTriageLink({ kind: "unassigned" })).toBe(
      "/admin/care?view=directory&coverage=unassigned"
    );
  });

  it("only ever emits canonical /admin/care URLs (#468)", () => {
    const links = [
      buildShepherdCareTriageLink({ kind: "needs_attention" }),
      buildShepherdCareTriageLink({ kind: "unassigned" }),
      buildShepherdCareTriageLink({
        kind: "over_shepherd",
        overShepherdId: UUID,
      }),
    ];
    for (const link of links) {
      expect(link).toMatch(/^\/admin\/care\?/);
      expect(link).not.toContain("/admin/shepherd-care");
      expect(link).not.toContain("/admin/follow-ups");
    }
  });
});
