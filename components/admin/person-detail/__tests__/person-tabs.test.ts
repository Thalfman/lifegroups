import { describe, expect, it } from "vitest";
import {
  personTabsFor,
  resolvePersonTab,
} from "@/components/admin/person-detail/person-tabs";

describe("personTabsFor", () => {
  it("gives an active leader the full ladder including Care and Access", () => {
    const tabs = personTabsFor({
      isLeader: true,
      isActive: true,
      isLoginBacked: true,
    });
    expect(tabs.map((t) => t.key)).toEqual([
      "overview",
      "group",
      "care",
      "activity",
      "access",
    ]);
  });

  it("hides Care for an inactive leader (their cadence isn't tracked)", () => {
    const tabs = personTabsFor({
      isLeader: true,
      isActive: false,
      isLoginBacked: true,
    });
    expect(tabs.map((t) => t.key)).toEqual([
      "overview",
      "group",
      "activity",
      "access",
    ]);
  });

  it("hides Care and Access for a member (no care model, no login)", () => {
    const tabs = personTabsFor({
      isLeader: false,
      isActive: true,
      isLoginBacked: false,
    });
    expect(tabs.map((t) => t.key)).toEqual(["overview", "group", "activity"]);
  });
});

describe("resolvePersonTab", () => {
  const leaderTabs = personTabsFor({
    isLeader: true,
    isActive: true,
    isLoginBacked: true,
  });
  const memberTabs = personTabsFor({
    isLeader: false,
    isActive: true,
    isLoginBacked: false,
  });

  it("resolves a visible tab", () => {
    expect(resolvePersonTab("group", leaderTabs)).toBe("group");
    expect(resolvePersonTab("care", leaderTabs)).toBe("care");
  });

  it("degrades a hidden tab to Overview — a leader's ?tab=care link opened on a member", () => {
    expect(resolvePersonTab("care", memberTabs)).toBe("overview");
    expect(resolvePersonTab("access", memberTabs)).toBe("overview");
  });

  it("falls back to Overview for unknown or missing values", () => {
    expect(resolvePersonTab("bogus", leaderTabs)).toBe("overview");
    expect(resolvePersonTab(null, leaderTabs)).toBe("overview");
    expect(resolvePersonTab(undefined, leaderTabs)).toBe("overview");
  });
});
