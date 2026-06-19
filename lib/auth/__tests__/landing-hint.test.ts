import { describe, expect, it } from "vitest";
import {
  LANDING_HINT_COOKIE_MAX_AGE_SECONDS,
  isValidLandingHint,
  landingHintCookieString,
  landingHintForRole,
} from "@/lib/auth/landing-hint";
import type { UserRole } from "@/types/enums";

describe("isValidLandingHint", () => {
  it("accepts only the three fixed landing paths", () => {
    expect(isValidLandingHint("/admin")).toBe(true);
    expect(isValidLandingHint("/leader")).toBe(true);
    expect(isValidLandingHint("/over-shepherd")).toBe(true);
  });

  it("rejects anything else, including near-misses and non-strings", () => {
    expect(isValidLandingHint("/admin/groups")).toBe(false);
    expect(isValidLandingHint("/unauthorized")).toBe(false);
    expect(isValidLandingHint("/")).toBe(false);
    expect(isValidLandingHint("https://evil.test/admin")).toBe(false);
    expect(isValidLandingHint("")).toBe(false);
    expect(isValidLandingHint(undefined)).toBe(false);
    expect(isValidLandingHint(null)).toBe(false);
    expect(isValidLandingHint(42)).toBe(false);
  });
});

describe("landingHintForRole", () => {
  it("maps each role to its default landing surface", () => {
    const cases: [UserRole, string | null][] = [
      ["super_admin", "/admin"],
      ["ministry_admin", "/admin"],
      ["over_shepherd", "/over-shepherd"],
      ["leader", "/leader"],
      ["co_leader", "/leader"],
    ];
    for (const [role, expected] of cases) {
      expect(landingHintForRole(role)).toBe(expected);
    }
  });
});

describe("landingHintCookieString", () => {
  it("builds a Lax, path-/ cookie with the configured max-age", () => {
    const str = landingHintCookieString("/admin", { secure: false });
    expect(str).toContain("lg_landing_path=/admin");
    expect(str).toContain("Path=/");
    expect(str).toContain("SameSite=Lax");
    expect(str).toContain(`Max-Age=${LANDING_HINT_COOKIE_MAX_AGE_SECONDS}`);
    expect(str).not.toContain("Secure");
  });

  it("appends Secure when requested", () => {
    expect(landingHintCookieString("/leader", { secure: true })).toContain(
      "Secure"
    );
  });
});
