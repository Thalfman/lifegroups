import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bindReads, SLOW_READ_UNIT_MS } from "@/lib/supabase/reads-seam";
import { log } from "@/lib/observability/logger";
import type { ReadClient } from "@/lib/supabase/read-core";

vi.mock("@/lib/observability/logger", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// A stand-in for the Supabase client; bindReads only ever forwards it as the
// first argument, so its substance is irrelevant to the seam.
const CLIENT = { tag: "live" } as unknown as ReadClient;

describe("bindReads", () => {
  it("curries the client into every fetcher", async () => {
    const seen: unknown[] = [];
    const fetchGroups = async (client: ReadClient, limit: number) => {
      seen.push(client);
      return { data: limit, error: null };
    };

    const reads = bindReads(CLIENT, { fetchGroups });
    const result = await reads.fetchGroups(5);

    expect(seen[0]).toBe(CLIENT);
    expect(result.data).toBe(5);
  });

  it("drops the client from each method's interface", async () => {
    const fetchCount = async (_client: ReadClient) => ({
      data: 1,
      error: null,
    });
    const reads = bindReads(CLIENT, { fetchCount });

    // The bound method takes no client argument — calling with none type-checks
    // and resolves.
    await expect(reads.fetchCount()).resolves.toEqual({ data: 1, error: null });
  });

  it("binds every entry in the fetcher map", () => {
    const reads = bindReads(CLIENT, {
      a: async (_c: ReadClient) => ({ data: "a", error: null }),
      b: async (_c: ReadClient) => ({ data: "b", error: null }),
    });

    expect(Object.keys(reads).sort()).toEqual(["a", "b"]);
  });
});

describe("bindReads per-read timing (surface label)", () => {
  let now: number;

  beforeEach(() => {
    vi.clearAllMocks();
    now = 0;
    // Deterministic clock: each call to performance.now() returns the value
    // the test has advanced `now` to.
    vi.spyOn(performance, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits nothing for a fast successful read", async () => {
    const fetchFast = async (_c: ReadClient) => {
      now += SLOW_READ_UNIT_MS - 1;
      return { data: 1, error: null };
    };
    const reads = bindReads(CLIENT, { fetchFast }, "test_surface");

    await expect(reads.fetchFast()).resolves.toEqual({ data: 1, error: null });

    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it("emits a read_unit warn for a slow successful read", async () => {
    const fetchSlow = async (_c: ReadClient) => {
      now += SLOW_READ_UNIT_MS;
      return { data: "rows", error: null };
    };
    const reads = bindReads(CLIENT, { fetchSlow }, "test_surface");

    await expect(reads.fetchSlow()).resolves.toEqual({
      data: "rows",
      error: null,
    });

    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith({
      event: "read_unit",
      surface: "test_surface",
      read: "fetchSlow",
      outcome: "ok",
      latency_ms: SLOW_READ_UNIT_MS,
    });
    expect(log.error).not.toHaveBeenCalled();
  });

  it("emits a read_unit warn when a read resolves the error arm", async () => {
    const fetchBroken = async (_c: ReadClient) => {
      now += 10;
      return { data: null, error: new Error("boom") };
    };
    const reads = bindReads(CLIENT, { fetchBroken }, "test_surface");

    // The resolved value passes through unchanged (degrade-gracefully intact).
    const result = await reads.fetchBroken();
    expect(result.error).toBeInstanceOf(Error);

    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith({
      event: "read_unit",
      surface: "test_surface",
      read: "fetchBroken",
      outcome: "fail",
      latency_ms: 10,
      error_code: "read_failed",
    });
    // The line never carries the error message or any row contents.
    expect(JSON.stringify(vi.mocked(log.warn).mock.calls)).not.toContain(
      "boom"
    );
  });

  it("emits a read_unit error and rethrows when a read throws", async () => {
    const fetchThrows = async (_c: ReadClient) => {
      now += 25;
      throw new Error("network down");
    };
    const reads = bindReads(CLIENT, { fetchThrows }, "test_surface");

    await expect(reads.fetchThrows()).rejects.toThrow("network down");

    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith({
      event: "read_unit",
      surface: "test_surface",
      read: "fetchThrows",
      outcome: "fail",
      latency_ms: 25,
      error_code: "read_threw",
    });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("never logs when the surface label is omitted", async () => {
    const fetchSlow = async (_c: ReadClient) => {
      now += SLOW_READ_UNIT_MS * 10;
      return { data: 1, error: null };
    };
    const fetchThrows = async (_c: ReadClient) => {
      throw new Error("still silent");
    };
    const reads = bindReads(CLIENT, { fetchSlow, fetchThrows });

    await reads.fetchSlow();
    await expect(reads.fetchThrows()).rejects.toThrow("still silent");

    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });
});
