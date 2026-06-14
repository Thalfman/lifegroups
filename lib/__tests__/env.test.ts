import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getSupabaseEnv,
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
