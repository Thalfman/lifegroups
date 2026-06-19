import { describe, expect, it } from "vitest";

import {
  buildSuperAdminConsoleData,
  buildNoClientConsoleData,
  type SuperAdminConsoleReads,
} from "@/components/admin/super-admin/console-data";
import { BUILT_IN_APP_CONFIG } from "@/lib/admin/app-config-decode";
import type { ReadResult } from "@/lib/supabase/read-core";
import type {
  ChecklistRow,
  ChecklistTone,
} from "@/components/admin/system-status-checklist";
import type { GroupLeadersRow, GroupsRow, ProfilesRow } from "@/types/database";

// In-memory adapter for the console reads seam (ADR 0015): the same interface
// the production `supabaseSuperAdminConsoleReads` adapter satisfies, so the pure
// builder and its checklist degrade rules become unit-testable without a live
// Supabase client.

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

const ACTOR_ID = "00000000-0000-0000-0000-0000000000aa";

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

function group(overrides: Partial<GroupsRow>): GroupsRow {
  return {
    id: "g-1",
    name: "Group",
    description: null,
    meeting_day: null,
    meeting_time: null,
    meeting_frequency: "weekly",
    meeting_week_parity: null,
    location_area: null,
    address_optional: null,
    capacity: null,
    lifecycle_status: "active",
    health_status: "healthy",
    group_type: null,
    launched_on: null,
    pause_reason: null,
    pause_start_date: null,
    expected_return_date: null,
    restart_reminder_date: null,
    admin_notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    closed_at: null,
    ...overrides,
  };
}

function leaderAssignment(profileId: string): GroupLeadersRow {
  return {
    id: `gl-${profileId}`,
    group_id: "g-1",
    profile_id: profileId,
    role: "leader",
    assigned_at: "2026-01-01",
    active: true,
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

// Every read at its empty, no-error baseline. Non-nullable scalar reads
// (cleanSlateImpact / history- and attention-reset state) have no empty success
// value, so the baseline returns their failure variant — the console degrades
// them to a null panel, and they sit outside the tracked checklist errors.
function emptyReads(
  overrides: Partial<SuperAdminConsoleReads> = {}
): SuperAdminConsoleReads {
  return {
    fetchProfilesForAdmin: async () => ok([]),
    fetchAllGroups: async () => ok([]),
    fetchAllMembers: async () => ok([]),
    fetchAllGroupLeaders: async () => ok([]),
    fetchRecentAuditEvents: async () => ok([]),
    fetchPlatformConfig: async () => ok(null),
    fetchActiveOverShepherds: async () => [],
    fetchCoverageAssignableLeaders: async () => [],
    fetchCurrentCoverageAssignments: async () => [],
    fetchCleanSlateImpact: async () => fail("not provided"),
    fetchAuditEventCount: async () => ok(0),
    fetchLatestCleanSlateSnapshot: async () => ok(null),
    fetchHistoryResetState: async () => fail("not provided"),
    fetchAttentionResetState: async () => fail("not provided"),
    fetchPermanentDeletionTargets: async () => [],
    fetchRecentTombstones: async () => [],
    fetchRecentUsageEvents: async () => ok([]),
    ...overrides,
  };
}

function rowTone(checklist: ChecklistRow[], key: string): ChecklistTone {
  const row = checklist.find((r) => r.key === key);
  if (!row) throw new Error(`checklist row not found: ${key}`);
  return row.tone;
}

describe("buildSuperAdminConsoleData", () => {
  it("assembles the console with no errors and ok checklist rows when reads succeed", async () => {
    const data = await buildSuperAdminConsoleData(
      emptyReads({
        fetchProfilesForAdmin: async () =>
          ok([profile({ id: "p-leader", role: "leader" })]),
        fetchAllGroups: async () => ok([group({ id: "g-1" })]),
        fetchAllGroupLeaders: async () => ok([leaderAssignment("p-leader")]),
      }),
      { currentActorProfileId: ACTOR_ID }
    );

    expect(data.errors).toEqual({
      audit: null,
      profiles: null,
      groups: null,
      members: null,
      leaders: null,
      platformConfig: null,
    });
    expect(rowTone(data.checklist, "supabase")).toBe("ok");
    expect(rowTone(data.checklist, "is_super_admin")).toBe("info");
    expect(rowTone(data.checklist, "groups")).toBe("ok");
    expect(rowTone(data.checklist, "leaders")).toBe("ok");
    expect(rowTone(data.checklist, "leader_assignment")).toBe("ok");
    expect(rowTone(data.checklist, "audit_access")).toBe("ok");
    // The leader (not the current actor) is offered for role reassignment.
    expect(data.assignableProfiles.map((p) => p.id)).toEqual(["p-leader"]);
  });

  it("surfaces a single failed read and flips only that checklist row", async () => {
    const data = await buildSuperAdminConsoleData(
      emptyReads({
        // profiles still load, so the leaders row stays green ...
        fetchProfilesForAdmin: async () =>
          ok([profile({ id: "p-leader", role: "leader" })]),
        // ... but the groups read fails.
        fetchAllGroups: async () => fail("boom"),
      }),
      { currentActorProfileId: ACTOR_ID }
    );

    expect(data.errors.groups).toBe("boom");
    expect(data.errors.profiles).toBeNull();
    expect(rowTone(data.checklist, "groups")).toBe("warn");
    expect(rowTone(data.checklist, "leaders")).toBe("ok");
    // A failed read degrades to its empty fallback — never a thrown page.
    expect(data.groupsById.size).toBe(0);
  });

  it("renders the no-client fallback with built-in config and all rows warned", async () => {
    const data = buildNoClientConsoleData();

    expect(data.appConfig).toBe(BUILT_IN_APP_CONFIG);
    expect(rowTone(data.checklist, "supabase")).toBe("warn");
    expect(rowTone(data.checklist, "groups")).toBe("warn");
    expect(rowTone(data.checklist, "leaders")).toBe("warn");
    expect(rowTone(data.checklist, "members")).toBe("warn");
    expect(rowTone(data.checklist, "leader_assignment")).toBe("warn");
    expect(rowTone(data.checklist, "audit_access")).toBe("warn");
    const notConfigured = "The database is not configured in this environment.";
    expect(data.errors.profiles).toBe(notConfigured);
    expect(data.errors.platformConfig).toBe(notConfigured);
  });
});
