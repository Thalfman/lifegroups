import { describe, expect, it } from "vitest";

import {
  buildGuestsData,
  type GuestsReads,
} from "@/components/admin/guests/guests-data";
import type { ReadResult } from "@/lib/supabase/read-core";
import type { GuestDirectoryEntry } from "@/lib/supabase/read-models";
import type { ProfilesRow } from "@/types/database";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

function guest(overrides: Partial<GuestDirectoryEntry>): GuestDirectoryEntry {
  return {
    id: "guest-1",
    full_name: "Pat Prospect",
    email: null,
    phone: null,
    first_attended_group_id: null,
    first_attended_date: null,
    pipeline_stage: "new",
    assigned_group_id: null,
    follow_up_owner_id: null,
    notes: null,
    created_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

function profile(overrides: Partial<ProfilesRow>): ProfilesRow {
  return {
    id: "p-1",
    auth_user_id: null,
    full_name: "Avery Leader",
    full_name_pending: false,
    email: "avery@example.com",
    phone: null,
    role: "leader",
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// Sibling to guests-data.test.ts (the follow-up-count waterfall): this file
// pins the readBatch-shaped assembly the surface refactored onto — the empty
// baseline, the per-key error mapping, and the read options. Same in-memory
// adapter, same `GuestsReads` seam.
function emptyReads(overrides: Partial<GuestsReads> = {}): GuestsReads {
  return {
    fetchGuests: async () => ok([]),
    fetchAllGroups: async () => ok([]),
    fetchProfilesForAdmin: async () => ok([]),
    fetchGuestFollowUpCounts: async () => ok(new Map<string, number>()),
    ...overrides,
  };
}

describe("buildGuestsData — batch assembly", () => {
  it("returns the documented empty shape, asking the counts read for no ids", async () => {
    let askedIds: string[] | undefined;
    const data = await buildGuestsData(
      emptyReads({
        fetchGuestFollowUpCounts: async (ids) => {
          askedIds = ids;
          return ok(new Map<string, number>());
        },
      })
    );

    expect(data.guests).toEqual([]);
    expect(data.groups).toEqual([]);
    expect(data.ownerProfiles).toEqual([]);
    expect(data.openFollowUpsByGuest).toEqual({});
    expect(askedIds).toEqual([]);
    expect(data.errors).toEqual({
      guests: null,
      groups: null,
      profiles: null,
      followUps: null,
    });
  });

  it("degrades only the guests section when that batch read fails — no stale counts", async () => {
    let askedIds: string[] | undefined;
    const data = await buildGuestsData(
      emptyReads({
        fetchGuests: async () => fail("guests boom"),
        fetchGuestFollowUpCounts: async (ids) => {
          askedIds = ids;
          return ok(new Map([["ghost", 3]]));
        },
      })
    );

    expect(data.guests).toEqual([]);
    expect(data.errors.guests).toBe("guests boom");
    // With no trusted guest list there are no ids to count by, so the
    // dependent waterfall read is asked for nothing.
    expect(askedIds).toEqual([]);
    expect(data.errors.groups).toBeNull();
    expect(data.errors.profiles).toBeNull();
  });

  it("keys each batch failure independently while the surviving reads keep their data", async () => {
    const data = await buildGuestsData(
      emptyReads({
        fetchGuests: async () => ok([guest({})]),
        fetchAllGroups: async () => fail("groups boom"),
        fetchProfilesForAdmin: async () => fail("profiles boom"),
      })
    );

    expect(data.errors.groups).toBe("groups boom");
    expect(data.errors.profiles).toBe("profiles boom");
    expect(data.errors.guests).toBeNull();
    expect(data.errors.followUps).toBeNull();
    expect(data.groups).toEqual([]);
    expect(data.ownerProfiles).toEqual([]);
    // One failure never blanks a sibling section.
    expect(data.guests).toHaveLength(1);
  });

  it("requests the active assignee-role profiles and projects them as owner options", async () => {
    let askedOptions:
      | Parameters<GuestsReads["fetchProfilesForAdmin"]>[0]
      | undefined;
    const owner = profile({ id: "p-owner", full_name: "Olive Owner" });
    const data = await buildGuestsData(
      emptyReads({
        fetchProfilesForAdmin: async (options) => {
          askedOptions = options;
          return ok([owner]);
        },
      })
    );

    expect(askedOptions).toEqual({
      roles: ["super_admin", "ministry_admin", "leader", "co_leader"],
      statuses: ["active"],
    });
    expect(data.ownerProfiles).toEqual([owner]);
  });

  it("projects the counts Map into the per-guest record alongside the guest rows", async () => {
    const rows = [
      guest({ id: "guest-1" }),
      guest({ id: "guest-2", full_name: "Riley Returner" }),
    ];
    const data = await buildGuestsData(
      emptyReads({
        fetchGuests: async () => ok(rows),
        fetchGuestFollowUpCounts: async () => ok(new Map([["guest-2", 2]])),
      })
    );

    expect(data.guests).toEqual(rows);
    // A guest with no open follow-ups simply has no key — never a fabricated
    // zero entry.
    expect(data.openFollowUpsByGuest).toEqual({ "guest-2": 2 });
    expect(data.errors.followUps).toBeNull();
  });
});
