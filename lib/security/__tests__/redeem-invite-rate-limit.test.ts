import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOURCE_PATH = fileURLToPath(
  new URL("../../../supabase/functions/redeem-invite/index.ts", import.meta.url)
);

function source(): string {
  return readFileSync(SOURCE_PATH, "utf8");
}

describe("redeem-invite IP throttle privacy", () => {
  it("uses the shared HMAC identifier before calling the SQL throttle", () => {
    const text = source();
    expect(text).toContain('from "../_shared/rate-limit-identifier.ts"');
    expect(text).toContain("createIpRateLimitIdentifier(");
    expect(text).toMatch(
      /p_key:\s*(?:rateLimitIdentifier|rateLimitKey|throttleKey)/
    );
    expect(text).not.toMatch(/p_key:\s*peerIp/);
  });

  it("fails closed when RATE_LIMIT_HMAC_SECRET is absent", () => {
    const text = source();
    expect(text).toContain('Deno.env.get("RATE_LIMIT_HMAC_SECRET")');
    expect(text).toContain('fail("missing_rate_limit_hmac_secret", 500)');

    const secretCheck = text.indexOf("missing_rate_limit_hmac_secret");
    const throttleCall = text.indexOf('"check_invite_redeem_rate"');
    expect(secretCheck).toBeGreaterThan(-1);
    expect(throttleCall).toBeGreaterThan(secretCheck);
  });

  it("does not log the source IP or HMAC input", () => {
    const text = source();
    expect(text).not.toMatch(/console\.(?:log|warn|error)\([^)]*peerIp/);
    expect(text).not.toMatch(
      /console\.(?:log|warn|error)\([^)]*rateLimitIdentifier/
    );
  });

  it("logs orphan cleanup structurally without Auth UUIDs or backend text", () => {
    const text = source();
    const logger = text.match(/function logOrphanedAuthUser[\s\S]*?\n}/)?.[0];
    expect(logger).toBeTruthy();
    expect(logger).toContain("invitation_id");
    expect(logger).toContain('"auth_cleanup_failed"');
    expect(logger).not.toContain("auth_user_id");
    expect(logger).not.toContain("authUserId");
    expect(logger).not.toContain("cleanupError");
    expect(logger).not.toContain("error_message");
    expect(text).not.toContain("logOrphanedAuthUser(authUserId");
  });
});
