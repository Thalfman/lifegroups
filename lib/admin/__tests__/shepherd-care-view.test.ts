import { describe, expect, it } from "vitest";
import {
  buildShepherdCareTriageLink,
  buildShepherdCareViewHref,
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
  it("omits the view param for the default dashboard view", () => {
    expect(buildShepherdCareViewHref({ view: "dashboard" })).toBe(
      "/admin/shepherd-care"
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
      "/admin/shepherd-care?view=directory&filter=needs_attention&coverage=unassigned"
    );
  });

  it("omits the all filter and an absent/null coverage", () => {
    expect(
      buildShepherdCareViewHref({
        view: "directory",
        filter: "all",
        coverage: undefined,
      })
    ).toBe("/admin/shepherd-care?view=directory");
    expect(
      buildShepherdCareViewHref({ view: "directory", coverage: null })
    ).toBe("/admin/shepherd-care?view=directory");
  });

  it("carries a coverage uuid on a dashboard-rooted URL", () => {
    expect(
      buildShepherdCareViewHref({ view: "dashboard", coverage: UUID })
    ).toBe(`/admin/shepherd-care?coverage=${UUID}`);
  });
});

// #334 — the canonical Care shell keys tabs by the PRD IA names, but the
// embedded Dashboard widgets still drill down via the legacy `view` / `coverage`
// params against the /admin/shepherd-care alias. The alias landing must map those
// params onto the matching initial tab, or every drill-down would reopen the
// default tab. Pin that mapping (and that the builders above produce params this
// resolver actually understands — i.e. the drill-down round-trips).
describe("resolveCareInitialTabFromParams", () => {
  it("falls back to the route default when no drill-down params are present", () => {
    expect(resolveCareInitialTabFromParams({}, "dashboard")).toBe("dashboard");
    expect(resolveCareInitialTabFromParams({}, "follow-ups")).toBe(
      "follow-ups"
    );
  });

  it("maps view=directory onto the Directory tab", () => {
    expect(
      resolveCareInitialTabFromParams({ view: "directory" }, "dashboard")
    ).toBe("directory");
  });

  it("maps any coverage filter onto the Coverage tab", () => {
    expect(
      resolveCareInitialTabFromParams({ coverage: "unassigned" }, "dashboard")
    ).toBe("coverage");
    expect(
      resolveCareInitialTabFromParams({ coverage: UUID }, "dashboard")
    ).toBe("coverage");
  });

  it("prefers Coverage over Directory for a coverage-rooted directory link", () => {
    // The coverage drill-downs are dashboard-rooted (view stays "dashboard")
    // but carry a coverage param; even an explicit view=directory + coverage
    // resolves to the coverage triage surface.
    expect(
      resolveCareInitialTabFromParams(
        { view: "directory", coverage: UUID },
        "dashboard"
      )
    ).toBe("coverage");
  });

  it("ignores an unrecognised coverage value (no false coverage tab)", () => {
    expect(
      resolveCareInitialTabFromParams({ coverage: "not-a-uuid" }, "dashboard")
    ).toBe("dashboard");
  });

  it("round-trips the builders' drill-down URLs to the intended tab", () => {
    // "View in Directory" / attention-queue link.
    const directory = buildShepherdCareViewHref({ view: "directory" });
    expect(directory).toBe("/admin/shepherd-care?view=directory");
    expect(
      resolveCareInitialTabFromParams({ view: "directory" }, "dashboard")
    ).toBe("directory");

    // Needs-attention summary tile.
    const needsAttention = buildShepherdCareTriageLink({
      kind: "needs_attention",
    });
    expect(needsAttention).toBe(
      "/admin/shepherd-care?view=directory&filter=needs_attention"
    );
    expect(
      resolveCareInitialTabFromParams(
        { view: "directory", filter: "needs_attention" },
        "dashboard"
      )
    ).toBe("directory");

    // Unassigned-coverage tile + over-shepherd bucket.
    const unassigned = buildShepherdCareTriageLink({ kind: "unassigned" });
    expect(unassigned).toBe(
      "/admin/shepherd-care?view=directory&coverage=unassigned"
    );
    expect(
      resolveCareInitialTabFromParams(
        { view: "directory", coverage: "unassigned" },
        "dashboard"
      )
    ).toBe("coverage");

    const overShepherd = buildShepherdCareTriageLink({
      kind: "over_shepherd",
      overShepherdId: UUID,
    });
    expect(overShepherd).toBe(
      `/admin/shepherd-care?view=directory&coverage=${UUID}`
    );
    expect(
      resolveCareInitialTabFromParams(
        { view: "directory", coverage: UUID },
        "dashboard"
      )
    ).toBe("coverage");
  });
});

describe("buildShepherdCareTriageLink", () => {
  it("maps needs_attention to the attention-filtered Directory URL", () => {
    expect(buildShepherdCareTriageLink({ kind: "needs_attention" })).toBe(
      "/admin/shepherd-care?view=directory&filter=needs_attention"
    );
  });

  it("maps a specific over-shepherd id to its coverage param on the Directory", () => {
    expect(
      buildShepherdCareTriageLink({
        kind: "over_shepherd",
        overShepherdId: UUID,
      })
    ).toBe(`/admin/shepherd-care?view=directory&coverage=${UUID}`);
  });

  it("maps unassigned to the unassigned coverage param on the Directory", () => {
    expect(buildShepherdCareTriageLink({ kind: "unassigned" })).toBe(
      "/admin/shepherd-care?view=directory&coverage=unassigned"
    );
  });
});
