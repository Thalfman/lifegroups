import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockInfo } = vi.hoisted(() => ({
  mockInfo: vi.fn(),
}));

vi.mock("../logger", () => ({
  log: { info: mockInfo, warn: vi.fn(), error: vi.fn() },
}));

import {
  logWebVital,
  normalizeVitalRoute,
  parseWebVitalReport,
} from "../web-vitals";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("normalizeVitalRoute", () => {
  it("leaves static routes untouched", () => {
    expect(normalizeVitalRoute("/admin/care")).toBe("/admin/care");
  });

  it("collapses a base64url invite token so the secret never reaches logs", () => {
    // 43-char base64url token (randomBytes(32)) — a bearer secret.
    const token = "dGhpc0lzQTQzQ2hhckJhc2U2NHVybFRva2VuRXhhbXBsZQ";
    expect(normalizeVitalRoute(`/invite/${token}`)).toBe("/invite/:id");
  });

  it("collapses a UUID path segment", () => {
    expect(
      normalizeVitalRoute("/admin/groups/123e4567-e89b-42d3-a456-426614174000")
    ).toBe("/admin/groups/:id");
  });

  it("collapses an all-numeric segment", () => {
    expect(normalizeVitalRoute("/admin/groups/42")).toBe("/admin/groups/:id");
  });

  it("spares multi-word static slugs", () => {
    expect(normalizeVitalRoute("/admin/settings/people-import-template")).toBe(
      "/admin/settings/people-import-template"
    );
  });

  it("strips query/hash and falls back to 'unknown' on bad input", () => {
    expect(normalizeVitalRoute("/admin?x=1#frag")).toBe("/admin");
    expect(normalizeVitalRoute(undefined)).toBe("unknown");
    expect(normalizeVitalRoute("")).toBe("unknown");
  });
});

describe("parseWebVitalReport", () => {
  it("normalizes a valid Core Web Vital report", () => {
    const report = parseWebVitalReport(
      JSON.stringify({
        name: "LCP",
        value: 2345.678,
        rating: "good",
        id: "v3-123",
        pathname: "/admin",
      })
    );

    expect(report).toEqual({
      metric: "LCP",
      value_ms: 2345.68,
      rating: "good",
      route: "/admin",
    });
  });

  it("returns null on invalid JSON", () => {
    expect(parseWebVitalReport("not json")).toBeNull();
  });

  it("returns null when name is missing", () => {
    expect(parseWebVitalReport(JSON.stringify({ value: 100 }))).toBeNull();
  });

  it("returns null when value is non-finite", () => {
    expect(
      parseWebVitalReport(JSON.stringify({ name: "INP", value: "fast" }))
    ).toBeNull();
  });

  it("drops an unknown/absent rating to null (Next custom metrics)", () => {
    const report = parseWebVitalReport(
      JSON.stringify({
        name: "Next.js-hydration",
        value: 42,
        pathname: "/admin/care",
      })
    );

    expect(report?.rating).toBeNull();
  });

  it("preserves sub-unit precision for CLS", () => {
    const report = parseWebVitalReport(
      JSON.stringify({ name: "CLS", value: 0.0512, rating: "good" })
    );

    expect(report?.value_ms).toBe(0.05);
  });

  it("defaults a missing pathname to 'unknown'", () => {
    const report = parseWebVitalReport(
      JSON.stringify({ name: "TTFB", value: 120 })
    );

    expect(report?.route).toBe("unknown");
  });

  it("normalizes a secret-bearing pathname server-side (defense in depth)", () => {
    const report = parseWebVitalReport(
      JSON.stringify({
        name: "LCP",
        value: 1200,
        pathname: "/invite/dGhpc0lzQTQzQ2hhckJhc2U2NHVybFRva2VuRXhhbXBsZQ",
      })
    );

    expect(report?.route).toBe("/invite/:id");
  });
});

describe("logWebVital", () => {
  it("emits exactly one web_vital info line for a valid report", () => {
    logWebVital(
      JSON.stringify({
        name: "INP",
        value: 256,
        rating: "needs-improvement",
        id: "v3-9",
        pathname: "/admin/groups",
      })
    );

    expect(mockInfo).toHaveBeenCalledTimes(1);
    const ctx = mockInfo.mock.calls[0][0];
    expect(ctx).toEqual({
      event: "web_vital",
      metric: "INP",
      value_ms: 256,
      rating: "needs-improvement",
      route: "/admin/groups",
    });
  });

  it("logs nothing on a malformed body", () => {
    logWebVital("{ broken");

    expect(mockInfo).not.toHaveBeenCalled();
  });
});
