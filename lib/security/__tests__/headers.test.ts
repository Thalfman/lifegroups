import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
} from "@/lib/security/headers";

describe("buildSecurityHeaders", () => {
  it("includes the standard hardening headers", () => {
    const headers = buildSecurityHeaders("https://proj.supabase.co");
    const byKey = Object.fromEntries(headers.map((h) => [h.key, h.value]));

    expect(byKey["Strict-Transport-Security"]).toContain("max-age=");
    expect(byKey["X-Frame-Options"]).toBe("DENY");
    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(byKey["Permissions-Policy"]).toContain("geolocation=()");
  });

  it("emits CSP as report-only, never enforcing", () => {
    const headers = buildSecurityHeaders("https://proj.supabase.co");
    const keys = headers.map((h) => h.key);

    expect(keys).toContain("Content-Security-Policy-Report-Only");
    expect(keys).not.toContain("Content-Security-Policy");
  });
});

describe("buildContentSecurityPolicy", () => {
  it("allowlists the Supabase REST and Realtime origins", () => {
    const csp = buildContentSecurityPolicy("https://proj.supabase.co");

    expect(csp).toContain("connect-src");
    expect(csp).toContain("https://proj.supabase.co");
    expect(csp).toContain("wss://proj.supabase.co");
  });

  it("allowlists the Vercel analytics + vitals origins", () => {
    const csp = buildContentSecurityPolicy("https://proj.supabase.co");

    expect(csp).toContain("https://va.vercel-scripts.com");
    expect(csp).toContain("https://vitals.vercel-insights.com");
  });

  it("permits Next inline styles/runtime", () => {
    const csp = buildContentSecurityPolicy(null);

    expect(csp).toContain("style-src");
    expect(csp).toContain("'unsafe-inline'");
    expect(csp).toContain("script-src");
  });

  it("denies framing and clamps base-uri/object-src", () => {
    const csp = buildContentSecurityPolicy(null);

    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("omits Supabase entries when the project origin is unknown", () => {
    const csp = buildContentSecurityPolicy(null);

    expect(csp).not.toContain("supabase");
    expect(csp).not.toContain("wss://");
  });
});
