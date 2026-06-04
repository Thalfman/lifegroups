import { describe, expect, it, vi } from "vitest";

import { readBatch } from "@/lib/supabase/read-batch";
import type { ReadResult } from "@/lib/supabase/read-core";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

describe("readBatch", () => {
  it("preserves each read's result under its key", async () => {
    const batch = await readBatch({
      groups: async () => ok([{ id: "g1" }]),
      count: async () => ok(3),
    });

    expect(batch.results.groups.data).toEqual([{ id: "g1" }]);
    expect(batch.results.count.data).toBe(3);
  });

  it("reports ok and null errors when every read succeeds", async () => {
    const batch = await readBatch({
      groups: async () => ok([]),
      members: async () => ok([]),
    });

    expect(batch.ok).toBe(true);
    expect(batch.firstError).toBeNull();
    expect(batch.errors).toEqual({ groups: null, members: null });
  });

  it("maps each failure to its key's message and is not ok", async () => {
    const batch = await readBatch({
      groups: async () => ok([]),
      members: async () => fail("members boom"),
    });

    expect(batch.ok).toBe(false);
    expect(batch.errors.groups).toBeNull();
    expect(batch.errors.members).toBe("members boom");
  });

  it("uses declaration order for firstError precedence", async () => {
    const batch = await readBatch({
      first: async () => fail("first boom"),
      second: async () => fail("second boom"),
    });

    expect(batch.firstError).toBe("first boom");
  });

  it("runs the reads concurrently rather than sequentially", async () => {
    const order: string[] = [];
    const slow = async (): Promise<ReadResult<number>> => {
      order.push("slow:start");
      await new Promise((r) => setTimeout(r, 10));
      order.push("slow:end");
      return ok(1);
    };
    const fast = async (): Promise<ReadResult<number>> => {
      order.push("fast:start");
      return ok(2);
    };

    await readBatch({ slow, fast });

    // Both reads start before the slow one finishes — proves Promise.all, not
    // an await-in-sequence loop.
    expect(order.slice(0, 2)).toEqual(["slow:start", "fast:start"]);
  });

  it("invokes each thunk exactly once", async () => {
    const groups = vi.fn(async () => ok([]));
    await readBatch({ groups });
    expect(groups).toHaveBeenCalledTimes(1);
  });
});
