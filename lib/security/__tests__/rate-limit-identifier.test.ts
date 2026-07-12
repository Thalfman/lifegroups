import { describe, expect, it } from "vitest";

import {
  createIpRateLimitIdentifier,
  normalizeClientIp,
} from "@/lib/security/rate-limit-identifier";
import { createIpRateLimitIdentifier as createEdgeIdentifier } from "../../../supabase/functions/_shared/rate-limit-identifier";

const SECRET = "test-rate-limit-secret-that-is-not-production";

describe("IP rate-limit identifier", () => {
  it("normalizes equivalent IPv6 spellings before hashing", () => {
    expect(normalizeClientIp("  [2001:DB8::1]  ")).toBe("2001:db8::1");
  });

  it("produces a deterministic versioned HMAC without the source IP", () => {
    const ip = "203.0.113.42";
    const identifier = createIpRateLimitIdentifier(ip, SECRET);

    expect(identifier).toMatch(/^ip:v1:[a-f0-9]{64}$/);
    expect(identifier).toBe(createIpRateLimitIdentifier(ip, SECRET));
    expect(identifier).not.toContain(ip);
    expect(createIpRateLimitIdentifier("203.0.113.43", SECRET)).not.toBe(
      identifier
    );
  });

  it("keeps the Node and Edge contracts byte-for-byte compatible", async () => {
    const ip = "2001:DB8::5";
    await expect(createEdgeIdentifier(ip, SECRET)).resolves.toBe(
      createIpRateLimitIdentifier(ip, SECRET)
    );
  });

  it("rejects an absent or blank secret instead of falling back to raw IP", async () => {
    expect(() => createIpRateLimitIdentifier("203.0.113.42", "")).toThrow(
      "rate_limit_hmac_secret_required"
    );
    await expect(createEdgeIdentifier("203.0.113.42", "   ")).rejects.toThrow(
      "rate_limit_hmac_secret_required"
    );
  });

  it("rejects an empty IP instead of creating a shared accidental bucket", async () => {
    expect(() => createIpRateLimitIdentifier("   ", SECRET)).toThrow(
      "rate_limit_ip_required"
    );
    await expect(createEdgeIdentifier("", SECRET)).rejects.toThrow(
      "rate_limit_ip_required"
    );
  });

  it("changes identifiers when the secret rotates", () => {
    expect(createIpRateLimitIdentifier("203.0.113.42", SECRET)).not.toBe(
      createIpRateLimitIdentifier("203.0.113.42", `${SECRET}-rotated`)
    );
  });
});
