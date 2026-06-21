import { describe, expect, it } from "vitest";

import {
  buildPersonBody,
  resolvePersonSpine,
  type PersonDetailReads,
  type PersonSpine,
} from "@/components/admin/person-detail/person-detail-data";
import type { ReadResult } from "@/lib/supabase/read-core";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

const LEADER_ID = "00000000-0000-4000-8000-0000000000a1";
const ADMIN_ID = "00000000-0000-4000-8000-0000000000a2";
const MEMBER_ID = "00000000-0000-4000-8000-0000000000b1";
const GROUP_ID = "00000000-0000-4000-8000-000000000001";
const CLOSED_GROUP_ID = "00000000-0000-4000-8000-000000000002";

const TODAY = "2026-06-15";

// A successful baseline for every read; each test overrides only the reads it
// cares about. This fake satisfies the same `PersonDetailReads` the live
// `supabasePersonDetailReads` adapter does, so the spine/body split and the
// fail-closed `needsContact` are exercised with no database.
function personReads(
  overrides: Partial<PersonDetailReads> = {}
): PersonDetailReads {
  return {
    fetchProfilesForAdmin: async () =>
      ok([
        {
          id: LEADER_ID,
          full_name: "Dana Leader",
          email: "dana@example.org",
          phone: null,
          status: "active",
          role: "leader",
        },
        {
          id: ADMIN_ID,
          full_name: "Avery Admin",
          email: "avery@example.org",
          phone: null,
          status: "active",
          role: "ministry_admin",
        },
      ] as never),
    fetchMembersByIds: async (ids: string[]) =>
      ok(
        (ids.includes(MEMBER_ID)
          ? [
              {
                id: MEMBER_ID,
                full_name: "Morgan Member",
                email: null,
                phone: "555-0100",
                status: "active",
              },
            ]
          : []) as never
      ),
    fetchAllGroupLeaders: async () =>
      ok([
        {
          group_id: GROUP_ID,
          profile_id: LEADER_ID,
          role: "leader",
          active: true,
        },
      ] as never),
    fetchAllGroups: async () =>
      ok([
        { id: GROUP_ID, name: "Tuesday Group", lifecycle_status: "active" },
        {
          id: CLOSED_GROUP_ID,
          name: "Retired Group",
          lifecycle_status: "closed",
        },
      ] as never),
    fetchActiveMemberships: async () =>
      ok([
        { member_id: MEMBER_ID, group_id: GROUP_ID, role: "member" },
      ] as never),
    fetchActiveShepherdCoverageAssignments: async () => ok([] as never),
    fetchMetricDefaults: async () => ok(null),
    fetchAttentionBaselines: async () => ok([]),
    fetchShepherdCareDirectory: async () =>
      ok([{ profile: { id: LEADER_ID }, needs_attention: true }] as never),
    ...overrides,
  };
}

describe("resolvePersonSpine", () => {
  it("resolves a login profile's identity for the header", async () => {
    const spine = await resolvePersonSpine(personReads(), "profile", LEADER_ID);
    expect(spine).toMatchObject({
      kind: "profile",
      id: LEADER_ID,
      fullName: "Dana Leader",
      isLoginBacked: true,
      isLeader: true,
    });
  });

  it("returns null (→ 404) for an unknown profile id", async () => {
    const spine = await resolvePersonSpine(personReads(), "profile", "nope");
    expect(spine).toBeNull();
  });

  it("resolves a member as a non-login, non-leader record", async () => {
    const spine = await resolvePersonSpine(personReads(), "member", MEMBER_ID);
    expect(spine).toMatchObject({
      kind: "member",
      roleLabel: "Member",
      isLoginBacked: false,
      isLeader: false,
    });
  });

  it("returns null (→ 404) for an unknown member id", async () => {
    const spine = await resolvePersonSpine(personReads(), "member", "nope");
    expect(spine).toBeNull();
  });
});

const leaderSpine: PersonSpine = {
  kind: "profile",
  id: LEADER_ID,
  fullName: "Dana Leader",
  email: "dana@example.org",
  phone: null,
  status: "active",
  roleLabel: "Leader",
  isLoginBacked: true,
  isLeader: true,
  leaderRole: "leader",
  role: "leader",
};

const adminSpine: PersonSpine = {
  kind: "profile",
  id: ADMIN_ID,
  fullName: "Avery Admin",
  email: "avery@example.org",
  phone: null,
  status: "active",
  roleLabel: "Ministry Admin",
  isLoginBacked: true,
  isLeader: false,
  leaderRole: null,
  role: "ministry_admin",
};

const memberSpine: PersonSpine = {
  kind: "member",
  id: MEMBER_ID,
  fullName: "Morgan Member",
  email: null,
  phone: "555-0100",
  status: "active",
  roleLabel: "Member",
  isLoginBacked: false,
  isLeader: false,
  leaderRole: null,
  role: null,
};

describe("buildPersonBody", () => {
  it("maps an active leader's led groups, care link, and needsContact", async () => {
    const body = await buildPersonBody(personReads(), leaderSpine, TODAY);
    expect(body.person.groups).toEqual([
      { id: GROUP_ID, name: "Tuesday Group", roleInGroup: "leader" },
    ]);
    expect(body.person.canPlaceInGroup).toBe(true);
    expect(body.person.careHref).toBe(`/admin/shepherd-care/${LEADER_ID}`);
    expect(body.person.needsContact).toBe(true);
    // Closed groups are never placement targets.
    expect(body.availableGroups).toEqual([
      { id: GROUP_ID, name: "Tuesday Group" },
    ]);
  });

  it("fails closed to needsContact=false when the care directory read fails", async () => {
    const body = await buildPersonBody(
      personReads({
        fetchShepherdCareDirectory: async () => fail("directory down"),
      }),
      leaderSpine,
      TODAY
    );
    expect(body.person.needsContact).toBe(false);
  });

  // Issue #636 fix: the person-detail page now passes the "care" attention-reset
  // baselines it used to omit, so a Leader cleared by a care reset stops reading
  // as needing contact here, matching the Care queue.
  it("threads the care attention-reset baselines into the directory read", async () => {
    let captured: Parameters<
      PersonDetailReads["fetchShepherdCareDirectory"]
    >[0];
    await buildPersonBody(
      personReads({
        fetchAttentionBaselines: async () =>
          ok([
            {
              surface: "care",
              scope: "global",
              entity_id: null,
              baseline_on: "2026-06-01",
            },
          ] as never),
        fetchShepherdCareDirectory: async (options) => {
          captured = options;
          return ok([
            { profile: { id: LEADER_ID }, needs_attention: true },
          ] as never);
        },
      }),
      leaderSpine,
      TODAY
    );
    expect(captured?.baselines?.global).toBe("2026-06-01");
  });

  it("a non-leader login profile cannot be placed and has no care link", async () => {
    const body = await buildPersonBody(personReads(), adminSpine, TODAY);
    expect(body.person.canPlaceInGroup).toBe(false);
    expect(body.person.careHref).toBeNull();
    expect(body.person.needsContact).toBe(false);
  });

  it("maps a member's group memberships and never computes care", async () => {
    const body = await buildPersonBody(personReads(), memberSpine, TODAY);
    expect(body.person.groups).toEqual([
      { id: GROUP_ID, name: "Tuesday Group", roleInGroup: "member" },
    ]);
    expect(body.person.canPlaceInGroup).toBe(true);
    expect(body.person.careHref).toBeNull();
    expect(body.person.needsContact).toBe(false);
  });
});
