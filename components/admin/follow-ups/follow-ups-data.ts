import type { AdminFollowUpsData } from "@/components/admin/follow-ups/follow-ups-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bindReads, type OmitClient } from "@/lib/supabase/reads-seam";
import { readBatch } from "@/lib/supabase/read-batch";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { fetchFollowUpsForAdmin } from "@/lib/supabase/follow-up-reads";
import { fetchAllGroups } from "@/lib/supabase/group-reads";
import {
  fetchAllMembers,
  fetchProfilesForAdmin,
} from "@/lib/supabase/membership-reads";
import { fetchGuests } from "@/lib/supabase/guest-reads";

// The generic admin oversight follow-up queue's data, shared by the frozen
// /admin/follow-ups route and the Care area's Follow-ups tab (#301) so the two
// hosts can't drift. These are the generic `follow_ups` (tied to groups,
// members, guests) — the care-sensitive shepherd_care_follow_ups stay on their
// own surface; the two only ever cross-link as counts.
//
// Assembly is a pure function of the reads seam (ADR 0015): `loadX` binds the
// live client; tests bind an in-memory adapter satisfying `AdminFollowUpsReads`.

export type AdminFollowUpsReads = {
  fetchFollowUpsForAdmin: OmitClient<typeof fetchFollowUpsForAdmin>;
  fetchAllGroups: OmitClient<typeof fetchAllGroups>;
  fetchAllMembers: OmitClient<typeof fetchAllMembers>;
  fetchGuests: OmitClient<typeof fetchGuests>;
  fetchProfilesForAdmin: OmitClient<typeof fetchProfilesForAdmin>;
};

// Production adapter: binds the live Supabase client to every read this surface
// needs.
export function supabaseAdminFollowUpsReads(
  client: AppSupabaseClient
): AdminFollowUpsReads {
  return bindReads(client, {
    fetchFollowUpsForAdmin,
    fetchAllGroups,
    fetchAllMembers,
    fetchGuests,
    fetchProfilesForAdmin,
  });
}

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

// Pure assembly: gather the five reads through the batch combinator, then
// project each into the shell's data shape with a per-read error. Every
// degrade path is reachable from a test through an in-memory `reads` adapter.
export async function buildAdminFollowUpsData(
  reads: AdminFollowUpsReads
): Promise<AdminFollowUpsData> {
  const batch = await readBatch({
    followUps: () => reads.fetchFollowUpsForAdmin(),
    groups: () => reads.fetchAllGroups(),
    members: () => reads.fetchAllMembers({ statuses: ["active"] }),
    guests: () => reads.fetchGuests(),
    profiles: () =>
      reads.fetchProfilesForAdmin({
        roles: ["super_admin", "ministry_admin", "leader", "co_leader"],
        statuses: ["active"],
      }),
  });

  return {
    followUps: batch.results.followUps.data ?? [],
    groups: batch.results.groups.data ?? [],
    members: batch.results.members.data ?? [],
    guests: batch.results.guests.data ?? [],
    assigneeProfiles: batch.results.profiles.data ?? [],
    errors: {
      followUps: batch.errors.followUps,
      groups: batch.errors.groups,
      members: batch.errors.members,
      guests: batch.errors.guests,
      profiles: batch.errors.profiles,
    },
  };
}

export async function loadAdminFollowUpsData(): Promise<AdminFollowUpsData> {
  const client = await createSupabaseServerClient();
  if (!client) return EMPTY_ADMIN_FOLLOW_UPS_DATA;
  return buildAdminFollowUpsData(supabaseAdminFollowUpsReads(client));
}
