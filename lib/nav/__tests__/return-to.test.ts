import { describe, expect, it } from "vitest";

import {
  RETURN_PARAM,
  decorateReturn,
  isReturning,
  returnOriginConfig,
} from "@/lib/nav/return-to";

// #776 Phase 0 — the generalized redirect-and-return convention. These pin the
// `setup` origin's round-trip (the byte-for-byte behavior ADR 0027 shipped) so
// the `lib/dashboard/setup-recovery` + `back-to-setup-link` aliases that now
// delegate here stay equivalent, and the encode/decode helpers round-trip.
describe("returnTo convention", () => {
  it("exposes the shared marker param", () => {
    expect(RETURN_PARAM).toBe("from");
  });

  it("describes the setup origin's return target and label", () => {
    expect(returnOriginConfig("setup")).toEqual({
      value: "setup",
      returnHref: "/admin?from=setup",
      label: "← Back to setup",
    });
  });

  describe("isReturning", () => {
    it("is true only for the origin marker, across string and array params", () => {
      expect(isReturning("setup", "setup")).toBe(true);
      expect(isReturning("setup", ["setup", "other"])).toBe(true);
      expect(isReturning("setup", "nope")).toBe(false);
      expect(isReturning("setup", undefined)).toBe(false);
      expect(isReturning("setup", [])).toBe(false);
    });
  });

  describe("decorateReturn", () => {
    it("appends the marker, preserving an existing query string and fragment", () => {
      expect(
        decorateReturn("/admin/settings?tab=system#people-import", "setup")
      ).toBe("/admin/settings?tab=system&from=setup#people-import");
    });

    it("opens a fresh query string when the href has none", () => {
      expect(decorateReturn("/admin/groups", "setup")).toBe(
        "/admin/groups?from=setup"
      );
    });

    it("round-trips: a decorated href reads back as returning", () => {
      const href = decorateReturn("/admin/groups?tab=needs_setup", "setup");
      const value = new URL(href, "https://x").searchParams.get(RETURN_PARAM);
      expect(isReturning("setup", value ?? undefined)).toBe(true);
    });
  });
});
