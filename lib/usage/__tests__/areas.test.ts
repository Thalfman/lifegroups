import { describe, it, expect } from "vitest";

import { usageAreaForPathname, isUsageAreaSlug } from "@/lib/usage/areas";

describe("usageAreaForPathname", () => {
  it("maps bare /admin to the admin Home area", () => {
    expect(usageAreaForPathname("/admin")).toBe("home");
    expect(usageAreaForPathname("/admin/")).toBe("home");
  });

  it("maps each admin sub-area to its slug", () => {
    expect(usageAreaForPathname("/admin/care")).toBe("care");
    expect(usageAreaForPathname("/admin/plan")).toBe("plan");
    expect(usageAreaForPathname("/admin/multiply")).toBe("multiply");
    expect(usageAreaForPathname("/admin/settings")).toBe("settings");
    expect(usageAreaForPathname("/admin/super-admin")).toBe("super-admin");
    expect(usageAreaForPathname("/admin/shepherd-care")).toBe("shepherd-care");
  });

  it("collapses deeper admin paths to their top-level area", () => {
    // Sub-navigation within an area resolves to the same slug, so the beacon
    // dedupes it rather than re-logging on every drill-down.
    expect(usageAreaForPathname("/admin/care/123")).toBe("care");
    expect(usageAreaForPathname("/admin/plan/funnel/abc")).toBe("plan");
  });

  it("drops a non-slug admin segment rather than recording free text", () => {
    // A segment that isn't a clean slug (digits, mixed case, too long) is not a
    // surface name — record nothing instead of leaking it.
    expect(usageAreaForPathname("/admin/AB123")).toBeNull();
    expect(usageAreaForPathname("/admin/a".padEnd(40, "z"))).toBeNull();
  });

  it("maps the leader and over-shepherd surfaces", () => {
    expect(usageAreaForPathname("/leader")).toBe("leader");
    expect(usageAreaForPathname("/leader/care")).toBe("leader");
    expect(usageAreaForPathname("/over-shepherd")).toBe("over-shepherd");
    expect(usageAreaForPathname("/over-shepherd/anything")).toBe(
      "over-shepherd"
    );
  });

  it("does not track auth, the public landing, or unknown roots", () => {
    expect(usageAreaForPathname("/")).toBeNull();
    expect(usageAreaForPathname("/login")).toBeNull();
    expect(usageAreaForPathname("/auth/confirm")).toBeNull();
    expect(usageAreaForPathname("/unauthorized")).toBeNull();
  });
});

describe("isUsageAreaSlug", () => {
  it("accepts the slugs the path mapper produces", () => {
    for (const slug of [
      "home",
      "care",
      "super-admin",
      "shepherd-care",
      "over-shepherd",
    ]) {
      expect(isUsageAreaSlug(slug)).toBe(true);
    }
  });

  it("rejects free text, uppercase, leading hyphens, and over-long values", () => {
    expect(isUsageAreaSlug("Care")).toBe(false);
    expect(isUsageAreaSlug("care/123")).toBe(false);
    expect(isUsageAreaSlug("-care")).toBe(false);
    expect(isUsageAreaSlug("care note")).toBe(false);
    expect(isUsageAreaSlug("a".repeat(33))).toBe(false);
    expect(isUsageAreaSlug(null)).toBe(false);
    expect(isUsageAreaSlug(42)).toBe(false);
  });
});
