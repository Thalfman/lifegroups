import { describe, expect, it } from "vitest";

import {
  IDLE_LIMIT_MS,
  idleCookieClearOptions,
  idleCookieSetOptions,
  isIdleExpired,
} from "../idle-timeout";

const NOW = 1_700_000_000_000;

describe("isIdleExpired", () => {
  it("treats an absent or empty value as a fresh window (not idle)", () => {
    expect(isIdleExpired(undefined, NOW)).toBe(false);
    expect(isIdleExpired("", NOW)).toBe(false);
  });

  it("treats an unparseable value as a fresh window (not idle)", () => {
    expect(isIdleExpired("not-a-number", NOW)).toBe(false);
    expect(isIdleExpired("NaN", NOW)).toBe(false);
  });

  it("is not idle just under the limit", () => {
    const lastActive = NOW - (IDLE_LIMIT_MS - 1);
    expect(isIdleExpired(String(lastActive), NOW)).toBe(false);
  });

  it("is not idle exactly at the limit (boundary is exclusive)", () => {
    const lastActive = NOW - IDLE_LIMIT_MS;
    expect(isIdleExpired(String(lastActive), NOW)).toBe(false);
  });

  it("is idle once past the limit", () => {
    const lastActive = NOW - (IDLE_LIMIT_MS + 1);
    expect(isIdleExpired(String(lastActive), NOW)).toBe(true);
  });

  it("is not idle for a future timestamp (clock skew)", () => {
    const lastActive = NOW + 60_000;
    expect(isIdleExpired(String(lastActive), NOW)).toBe(false);
  });
});

describe("idle cookie options", () => {
  it("sets an httpOnly, lax, root-path cookie that FAR outlives the idle window", () => {
    const opts = idleCookieSetOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
    // The marker must still be present (just stale) when a long-idle request
    // arrives — otherwise it lapses, isIdleExpired sees no marker, fails open to
    // "fresh", and an overnight session is never signed out. So its lifetime must
    // dwarf the idle window: assert at least a full day (it actually matches the
    // 400-day Supabase session cookie).
    expect(opts.maxAge).toBeGreaterThan((IDLE_LIMIT_MS / 1000) * 24);
  });

  it("clears the cookie with maxAge 0", () => {
    const opts = idleCookieClearOptions();
    expect(opts.maxAge).toBe(0);
    expect(opts.httpOnly).toBe(true);
    expect(opts.path).toBe("/");
  });
});
