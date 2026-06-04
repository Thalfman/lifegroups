import { describe, expect, it } from "vitest";

import { bindReads } from "@/lib/supabase/reads-seam";
import type { ReadClient } from "@/lib/supabase/read-core";

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
