import { describe, expect, it } from "vitest";

import {
  IDLE_LIMIT_MS,
  idleCookieClearOptions,
  idleCookieSetOptions,
  isIdleExpired,
} from "../idle-timeout";

const NOW = 1_700_000_000_000;

describe("isIdleExpired", () => {
  // Fail closed: the predicate is only called for authenticated sessions, and
  // login always seeds the marker — so a missing/garbled marker means the
  // cookie was deleted or tampered with, never a legitimate first visit.
  it("treats an absent or empty value as idle-expired (fail closed)", () => {
    expect(isIdleExpired(undefined, NOW)).toBe(true);
    expect(isIdleExpired("", NOW)).toBe(true);
  });

  it("treats an unparseable value as idle-expired (fail closed)", () => {
    expect(isIdleExpired("not-a-number", NOW)).toBe(true);
    expect(isIdleExpired("NaN", NOW)).toBe(true);
    expect(isIdleExpired("Infinity", NOW)).toBe(true);
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

  // A parseable future timestamp is a server-written marker whatever its sign
  // (skew across instances, a corrected clock) — and the same request slides it
  // to "now", so skew self-heals in one hop. Not a fail-open path: only our
  // server writes parseable values.
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
    // The long lifetime keeps the marker present for the whole life of an
    // active session (a lapsed marker now fails CLOSED, so this is a stability
    // choice, not a correctness one): assert at least a full day (it actually
    // matches the 400-day Supabase session cookie).
    expect(opts.maxAge).toBeGreaterThan((IDLE_LIMIT_MS / 1000) * 24);
  });

  it("clears the cookie with maxAge 0", () => {
    const opts = idleCookieClearOptions();
    expect(opts.maxAge).toBe(0);
    expect(opts.httpOnly).toBe(true);
    expect(opts.path).toBe("/");
  });
});
