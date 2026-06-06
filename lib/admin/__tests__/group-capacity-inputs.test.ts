import { describe, expect, it } from "vitest";

import {
  countActiveMembersByGroup,
  indexOverridesByGroup,
} from "@/lib/admin/group-capacity-inputs";

describe("countActiveMembersByGroup", () => {
  it("counts only active memberships, per group", () => {
    const counts = countActiveMembersByGroup([
      { group_id: "a", status: "active" },
      { group_id: "a", status: "active" },
      { group_id: "a", status: "inactive" },
      { group_id: "b", status: "active" },
      { group_id: "b", status: "removed" },
    ]);
    expect(counts.get("a")).toBe(2);
    expect(counts.get("b")).toBe(1);
  });

  it("omits groups with no active members rather than seeding 0", () => {
    const counts = countActiveMembersByGroup([
      { group_id: "a", status: "inactive" },
    ]);
    expect(counts.has("a")).toBe(false);
    expect(counts.get("a") ?? 0).toBe(0);
  });

  it("returns an empty map for no memberships", () => {
    expect(countActiveMembersByGroup([]).size).toBe(0);
  });
});

describe("indexOverridesByGroup", () => {
  it("keys overrides by group id", () => {
    const a = { group_id: "a", capacity_override: 10 };
    const b = { group_id: "b", capacity_override: null };
    const byGroup = indexOverridesByGroup([a, b]);
    expect(byGroup.get("a")).toBe(a);
    expect(byGroup.get("b")).toBe(b);
  });

  it("last write wins on a duplicate group id", () => {
    const first = { group_id: "a", capacity_override: 10 };
    const second = { group_id: "a", capacity_override: 20 };
    const byGroup = indexOverridesByGroup([first, second]);
    expect(byGroup.get("a")).toBe(second);
  });
});
