import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getSupabaseEnv,
  getSupabaseEnvSafe,
  getSupabaseUrlRaw,
  isSupabaseConfigured,
} from "@/lib/env";

// Every var the Supabase resolver consults — cleared before each case so tests
// start from a known no-env baseline and restored afterwards.
const SUPABASE_VARS = [
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

describe("getSupabaseEnv", () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of SUPABASE_VARS) {
      original[name] = process.env[name];
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const name of SUPABASE_VARS) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  });

  it("returns null when nothing is configured (no-env demo path)", () => {
    expect(getSupabaseEnv()).toBeNull();
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("resolves a fully-configured pair", () => {
    process.env.SUPABASE_URL = "https://proj.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "pk-123";
    expect(getSupabaseEnv()).toEqual({
      url: "https://proj.supabase.co",
      key: "pk-123",
    });
    expect(isSupabaseConfigured()).toBe(true);
  });

  it("prefers server-only names and publishable keys over the aliases", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://public.supabase.co";
    process.env.SUPABASE_URL = "https://server.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-legacy";
    process.env.SUPABASE_PUBLISHABLE_KEY = "pk-new";
    expect(getSupabaseEnv()).toEqual({
      url: "https://server.supabase.co",
      key: "pk-new",
    });
  });

  it("trims surrounding whitespace and ignores blank values", () => {
    process.env.SUPABASE_URL = "   ";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "  https://proj.supabase.co  ";
    process.env.SUPABASE_ANON_KEY = "  anon-key  ";
    expect(getSupabaseEnv()).toEqual({
      url: "https://proj.supabase.co",
      key: "anon-key",
    });
  });

  it("fast-fails naming the URL vars when only a key is set", () => {
    process.env.SUPABASE_ANON_KEY = "anon-key";
    expect(() => getSupabaseEnv()).toThrow(/no URL/i);
    expect(() => getSupabaseEnv()).toThrow(/SUPABASE_URL/);
  });

  it("fast-fails naming the key vars when only a URL is set", () => {
    process.env.SUPABASE_URL = "https://proj.supabase.co";
    expect(() => getSupabaseEnv()).toThrow(/no key/i);
    expect(() => getSupabaseEnv()).toThrow(/PUBLISHABLE_KEY/);
  });

  it("fast-fails on a malformed URL", () => {
    process.env.SUPABASE_URL = "not-a-url";
    process.env.SUPABASE_PUBLISHABLE_KEY = "pk-123";
    expect(() => getSupabaseEnv()).toThrow(/not a valid URL/i);
  });
});

describe("getSupabaseUrlRaw", () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of SUPABASE_VARS) {
      original[name] = process.env[name];
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const name of SUPABASE_VARS) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  });

  it("returns undefined when no URL is set (tolerant, never throws)", () => {
    process.env.SUPABASE_ANON_KEY = "anon-key";
    expect(getSupabaseUrlRaw()).toBeUndefined();
  });

  it("returns the trimmed URL, server-only name preferred", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://public.supabase.co";
    process.env.SUPABASE_URL = "  https://server.supabase.co  ";
    expect(getSupabaseUrlRaw()).toBe("https://server.supabase.co");
  });
});

describe("getSupabaseEnvSafe", () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of SUPABASE_VARS) {
      original[name] = process.env[name];
      delete process.env[name];
    }
    // The resolver logs misconfigs; silence the expected noise in test output.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const name of SUPABASE_VARS) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
    vi.restoreAllMocks();
  });

  it("returns null (never throws) on the no-env demo path", () => {
    expect(getSupabaseEnvSafe()).toBeNull();
  });

  it("resolves a fully-configured pair like getSupabaseEnv", () => {
    process.env.SUPABASE_URL = "https://proj.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "pk-123";
    expect(getSupabaseEnvSafe()).toEqual({
      url: "https://proj.supabase.co",
      key: "pk-123",
    });
  });

  it("degrades to null and logs when only a key is set (no site-wide throw)", () => {
    process.env.SUPABASE_ANON_KEY = "anon-key";
    expect(getSupabaseEnvSafe()).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringMatching(/misconfigured environment/i)
    );
  });

  it("degrades to null and logs on a malformed URL", () => {
    process.env.SUPABASE_URL = "not-a-url";
    process.env.SUPABASE_PUBLISHABLE_KEY = "pk-123";
    expect(getSupabaseEnvSafe()).toBeNull();
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("isSupabaseConfigured stays a safe boolean on a half-config", () => {
    process.env.SUPABASE_URL = "https://proj.supabase.co";
    expect(() => isSupabaseConfigured()).not.toThrow();
    expect(isSupabaseConfigured()).toBe(false);
  });
});
