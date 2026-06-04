import { describe, expect, it } from "vitest";

import {
  buildGuestsData,
  type GuestsReads,
} from "@/components/admin/guests/guests-data";
import type { ReadResult } from "@/lib/supabase/read-core";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

function emptyReads(overrides: Partial<GuestsReads> = {}): GuestsReads {
  return {
    fetchGuests: async () => ok([]),
    fetchAllGroups: async () => ok([]),
    fetchProfilesForAdmin: async () => ok([]),
    fetchGuestFollowUpCounts: async () => ok(new Map()),
    ...overrides,
  };
}

describe("buildGuestsData", () => {
  it("reads follow-up counts for the guest ids the first batch returned", async () => {
    let askedIds: string[] | undefined;
    const data = await buildGuestsData(
      emptyReads({
        fetchGuests: async () => ok([{ id: "a" }, { id: "b" }] as never),
        fetchGuestFollowUpCounts: async (ids) => {
          askedIds = ids;
          return ok(
            new Map([
              ["a", 2],
              ["b", 0],
            ])
          );
        },
      })
    );

    expect(askedIds).toEqual(["a", "b"]);
    expect(data.openFollowUpsByGuest).toEqual({ a: 2, b: 0 });
  });

  it("surfaces a follow-up counts read error and degrades to no counts", async () => {
    const data = await buildGuestsData(
      emptyReads({
        fetchGuests: async () => ok([{ id: "a" }] as never),
        fetchGuestFollowUpCounts: async () => fail("counts boom"),
      })
    );

    expect(data.errors.followUps).toBe("counts boom");
    expect(data.openFollowUpsByGuest).toEqual({});
  });
});
