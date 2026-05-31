import { describe, expect, it } from "vitest";
import {
  buildShepherdCareViewHref,
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
