import type { AdminFollowUpsData } from "@/components/admin/follow-ups/follow-ups-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchAllGroups,
  fetchAllMembers,
  fetchFollowUpsForAdmin,
  fetchGuests,
  fetchProfilesForAdmin,
} from "@/lib/supabase/read-models";

// The generic admin oversight follow-up queue's data, shared by the frozen
// /admin/follow-ups route and the Care area's Follow-ups tab (#301) so the two
// hosts can't drift. These are the generic `follow_ups` (tied to groups,
// members, guests) — the care-sensitive shepherd_care_follow_ups stay on their
// own surface; the two only ever cross-link as counts.
export const EMPTY_ADMIN_FOLLOW_UPS_DATA: AdminFollowUpsData = {
  followUps: [],
  groups: [],
  members: [],
  guests: [],
  assigneeProfiles: [],
  errors: {
    followUps: "The database is not configured in this environment.",
    groups: "The database is not configured in this environment.",
    members: "The database is not configured in this environment.",
    guests: "The database is not configured in this environment.",
    profiles: "The database is not configured in this environment.",
  },
};

export async function loadAdminFollowUpsData(): Promise<AdminFollowUpsData> {
  const client = await createSupabaseServerClient();
  if (!client) return EMPTY_ADMIN_FOLLOW_UPS_DATA;

  const [
    followUpsResult,
    groupsResult,
    membersResult,
    guestsResult,
    profilesResult,
  ] = await Promise.all([
    fetchFollowUpsForAdmin(client),
    fetchAllGroups(client),
    fetchAllMembers(client, { statuses: ["active"] }),
    fetchGuests(client),
    fetchProfilesForAdmin(client, {
      roles: ["super_admin", "ministry_admin", "leader", "co_leader"],
      statuses: ["active"],
    }),
  ]);

  return {
    followUps: followUpsResult.data ?? [],
    groups: groupsResult.data ?? [],
    members: membersResult.data ?? [],
    guests: guestsResult.data ?? [],
    assigneeProfiles: profilesResult.data ?? [],
    errors: {
      followUps: followUpsResult.error?.message ?? null,
      groups: groupsResult.error?.message ?? null,
      members: membersResult.error?.message ?? null,
      guests: guestsResult.error?.message ?? null,
      profiles: profilesResult.error?.message ?? null,
    },
  };
}
