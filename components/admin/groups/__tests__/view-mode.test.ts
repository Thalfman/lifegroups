import { describe, expect, it } from "vitest";

import { effectiveGroupsViewMode } from "@/components/admin/groups/view-mode";

describe("effectiveGroupsViewMode (#650)", () => {
  it("defaults the task tabs to the card layout", () => {
    for (const tab of ["needs_setup", "needs_health_check"] as const) {
      expect(
        effectiveGroupsViewMode({
          tab,
          browsingMode: "table",
          taskOverride: null,
        })
      ).toBe("cards");
    }
  });

  it("honors a per-visit override on a task tab", () => {
    expect(
      effectiveGroupsViewMode({
        tab: "needs_setup",
        browsingMode: "table",
        taskOverride: "table",
      })
    ).toBe("table");
  });

  it("follows the persisted browsing preference on non-task tabs", () => {
    expect(
      effectiveGroupsViewMode({
        tab: "all",
        browsingMode: "table",
        taskOverride: null,
      })
    ).toBe("table");
    expect(
      effectiveGroupsViewMode({
        tab: "archived",
        browsingMode: "cards",
        taskOverride: null,
      })
    ).toBe("cards");
  });

  it("ignores a stray task override when browsing a non-task tab", () => {
    // The directory resets the override on tab change, but the helper must not
    // leak a task-tab override into the global default regardless.
    expect(
      effectiveGroupsViewMode({
        tab: "all",
        browsingMode: "table",
        taskOverride: "cards",
      })
    ).toBe("table");
  });
});
