import { afterEach, describe, expect, it, vi } from "vitest";

import { replaceTabParam } from "@/lib/nav/tab-url";

describe("replaceTabParam", () => {
  const replaceState = vi.fn();

  afterEach(() => {
    replaceState.mockClear();
    vi.unstubAllGlobals();
  });

  function stubWindow() {
    vi.stubGlobal("window", { history: { replaceState } });
  }

  it("writes the tab into the query without a history entry", () => {
    stubWindow();
    replaceTabParam("/admin/people", "", "apprentices");
    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/admin/people?tab=apprentices"
    );
  });

  it("preserves unrelated params and replaces an existing tab", () => {
    stubWindow();
    replaceTabParam("/admin/multiply", "?tab=readiness&year=2026", "pipeline");
    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/admin/multiply?tab=pipeline&year=2026"
    );
  });
});
