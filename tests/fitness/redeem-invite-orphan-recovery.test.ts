import { describe, expect, it } from "vitest";

import { readSourceFiles } from "./support/source-globber";

const [redeemInviteFile] = readSourceFiles({
  roots: ["supabase/functions/redeem-invite/index.ts"],
  extensions: [".ts"],
});

if (!redeemInviteFile) {
  throw new Error("redeem-invite Edge Function source was not found");
}

const source = redeemInviteFile.text;

function sourceBetween(start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Could not find source range: ${start} -> ${end}`);
  }
  return source.slice(startIndex, endIndex);
}

describe("fitness: redeem-invite orphan Auth recovery trail", () => {
  it("logs a deterministic opaque handle on every failed cleanup path", () => {
    expect(source).toContain(
      "return sha256Hex(`redeem-invite-auth-user:v1:${authUserId}`);"
    );
    expect(source).toContain("await createAuthUserRecoveryHandle(authUserId)");

    const recoveryLogCalls = source.match(
      /logOrphanedAuthUser\(inv\.id, authUserRecoveryHandle\)/g
    );
    expect(recoveryLogCalls).toHaveLength(4);
  });

  it("keeps raw Auth identity data out of the recovery log", () => {
    const logger = sourceBetween(
      "function logOrphanedAuthUser(",
      "async function sha256Hex("
    );

    expect(logger).toContain(
      "auth_user_recovery_handle: authUserRecoveryHandle"
    );
    expect(logger).not.toMatch(/\bauthUserId\b/);
    expect(logger).not.toMatch(/\bemail\b/);
    expect(logger).not.toMatch(/\btoken\b/);
    expect(logger).not.toContain("auth_user_id:");
  });
});
