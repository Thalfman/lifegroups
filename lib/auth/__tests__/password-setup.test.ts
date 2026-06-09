import { describe, expect, it } from "vitest";

import {
  isPasswordSetupAllowedPath,
  shouldRedirectToPasswordSetup,
} from "../password-setup";

describe("isPasswordSetupAllowedPath", () => {
  it("allows the set-password screen and its verification endpoint", () => {
    expect(isPasswordSetupAllowedPath("/reset-password")).toBe(true);
    expect(isPasswordSetupAllowedPath("/auth/confirm")).toBe(true);
  });

  it("allows the escape-hatch paths", () => {
    expect(isPasswordSetupAllowedPath("/forgot-password")).toBe(true);
    expect(isPasswordSetupAllowedPath("/login")).toBe(true);
  });

  it("matches nested sub-paths of an allowed prefix", () => {
    expect(isPasswordSetupAllowedPath("/reset-password/anything")).toBe(true);
  });

  it("does not allow look-alike prefixes", () => {
    // "/loginx" must not be treated as under "/login".
    expect(isPasswordSetupAllowedPath("/loginx")).toBe(false);
    expect(isPasswordSetupAllowedPath("/reset-password-other")).toBe(false);
  });

  it("blocks the app surface", () => {
    expect(isPasswordSetupAllowedPath("/")).toBe(false);
    expect(isPasswordSetupAllowedPath("/admin/super-admin")).toBe(false);
    expect(isPasswordSetupAllowedPath("/leader/abc/care")).toBe(false);
  });
});

describe("shouldRedirectToPasswordSetup", () => {
  it("never gates an anonymous request, even on a blocked path", () => {
    expect(
      shouldRedirectToPasswordSetup({
        authenticated: false,
        hasSetupCookie: true,
        pathname: "/admin/super-admin",
      })
    ).toBe(false);
  });

  it("never gates an ordinary session without the marker", () => {
    expect(
      shouldRedirectToPasswordSetup({
        authenticated: true,
        hasSetupCookie: false,
        pathname: "/",
      })
    ).toBe(false);
  });

  it("gates a marker-carrying session trying to reach the app", () => {
    expect(
      shouldRedirectToPasswordSetup({
        authenticated: true,
        hasSetupCookie: true,
        pathname: "/",
      })
    ).toBe(true);
    expect(
      shouldRedirectToPasswordSetup({
        authenticated: true,
        hasSetupCookie: true,
        pathname: "/admin/super-admin",
      })
    ).toBe(true);
  });

  it("lets a marker-carrying session stay on the set-password flow", () => {
    for (const pathname of [
      "/reset-password",
      "/auth/confirm",
      "/forgot-password",
      "/login",
    ]) {
      expect(
        shouldRedirectToPasswordSetup({
          authenticated: true,
          hasSetupCookie: true,
          pathname,
        })
      ).toBe(false);
    }
  });
});
