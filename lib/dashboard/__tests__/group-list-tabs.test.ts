import { describe, expect, it } from "vitest";

import {
  GROUP_LIST_TAB_KEYS,
  isTaskListTab,
  resolveGroupListTab,
  TASK_LIST_TABS,
} from "@/lib/dashboard/group-list-tabs";

describe("resolveGroupListTab", () => {
  it("accepts the supported Groups tab route values", () => {
    expect(GROUP_LIST_TAB_KEYS).toEqual([
      "all",
      "needs_setup",
      "needs_health_check",
      "needs_attention",
      "archived",
    ]);

    for (const tab of GROUP_LIST_TAB_KEYS) {
      expect(resolveGroupListTab(tab)).toBe(tab);
    }
  });

  it("uses the first value when the query param is repeated", () => {
    expect(resolveGroupListTab(["needs_health_check", "archived"])).toBe(
      "needs_health_check"
    );
  });

  it("falls back to all for omitted or invalid values", () => {
    expect(resolveGroupListTab(undefined)).toBe("all");
    expect(resolveGroupListTab("")).toBe("all");
    expect(resolveGroupListTab("needs-care")).toBe("all");
  });
});

describe("isTaskListTab (#650)", () => {
  it("treats only the setup / health-check task tabs as task-shaped", () => {
    expect(TASK_LIST_TABS).toEqual(["needs_setup", "needs_health_check"]);
    expect(isTaskListTab("needs_setup")).toBe(true);
    expect(isTaskListTab("needs_health_check")).toBe(true);
  });

  it("leaves the global default and browsing tabs untouched", () => {
    expect(isTaskListTab("all")).toBe(false);
    expect(isTaskListTab("needs_attention")).toBe(false);
    expect(isTaskListTab("archived")).toBe(false);
  });
});
