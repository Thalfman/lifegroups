import { describe, expect, it } from "vitest";
import { resolvePeopleTab } from "@/components/admin/people/people-tabs";

describe("resolvePeopleTab", () => {
  it("resolves the canonical keys", () => {
    expect(resolvePeopleTab("directory")).toBe("directory");
    expect(resolvePeopleTab("apprentices")).toBe("apprentices");
  });

  it("falls back to the Directory for unknown, legacy, or missing values", () => {
    // The pre-consolidation view keys (leaders / members / add) are no longer
    // destinations — they fall back to the Directory, whose scope filter now
    // carries the narrowing.
    expect(resolvePeopleTab("leaders")).toBe("directory");
    expect(resolvePeopleTab("members")).toBe("directory");
    expect(resolvePeopleTab("add")).toBe("directory");
    expect(resolvePeopleTab("")).toBe("directory");
    expect(resolvePeopleTab(null)).toBe("directory");
    expect(resolvePeopleTab(undefined)).toBe("directory");
  });
});
