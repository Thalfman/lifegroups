import type { GuestsManagementData } from "@/components/admin/guests/guests-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bindReads, type OmitClient } from "@/lib/supabase/reads-seam";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  fetchAllGroups,
  fetchGuestFollowUpCounts,
  fetchGuests,
  fetchProfilesForAdmin,
} from "@/lib/supabase/read-models";

// The Guests surface's data, as a function of the reads seam (ADR 0015). The
// follow-up counts are a waterfall — they read by the guest ids the first batch
// returns — and that sequencing plus the Map→record projection is now testable
// through an in-memory adapter.

export type GuestsReads = {
  fetchGuests: OmitClient<typeof fetchGuests>;
  fetchAllGroups: OmitClient<typeof fetchAllGroups>;
  fetchProfilesForAdmin: OmitClient<typeof fetchProfilesForAdmin>;
  fetchGuestFollowUpCounts: OmitClient<typeof fetchGuestFollowUpCounts>;
};

export function supabaseGuestsReads(client: AppSupabaseClient): GuestsReads {
  return bindReads(client, {
    fetchGuests,
    fetchAllGroups,
    fetchProfilesForAdmin,
    fetchGuestFollowUpCounts,
  });
}

export const EMPTY_GUESTS_DATA: GuestsManagementData = {
  guests: [],
  groups: [],
  ownerProfiles: [],
  openFollowUpsByGuest: {},
  errors: {
    guests: "The database is not configured in this environment.",
    groups: "The database is not configured in this environment.",
    profiles: "The database is not configured in this environment.",
    followUps: "The database is not configured in this environment.",
  },
};

export async function buildGuestsData(
  reads: GuestsReads
): Promise<GuestsManagementData> {
  const [guestsResult, groupsResult, profilesResult] = await Promise.all([
    reads.fetchGuests(),
    reads.fetchAllGroups(),
    reads.fetchProfilesForAdmin({
      roles: ["super_admin", "ministry_admin", "leader", "co_leader"],
      statuses: ["active"],
    }),
  ]);

  const guests = guestsResult.data ?? [];
  const guestIds = guests.map((g) => g.id);
  const followUpCountsResult = await reads.fetchGuestFollowUpCounts(guestIds);
  const followUpCounts = followUpCountsResult.data ?? new Map<string, number>();

  return {
    guests,
    groups: groupsResult.data ?? [],
    ownerProfiles: profilesResult.data ?? [],
    openFollowUpsByGuest: Object.fromEntries(followUpCounts.entries()),
    errors: {
      guests: guestsResult.error?.message ?? null,
      groups: groupsResult.error?.message ?? null,
      profiles: profilesResult.error?.message ?? null,
      followUps: followUpCountsResult.error?.message ?? null,
    },
  };
}

export async function loadGuestsData(): Promise<GuestsManagementData> {
  const client = await createSupabaseServerClient();
  if (!client) return EMPTY_GUESTS_DATA;
  return buildGuestsData(supabaseGuestsReads(client));
}
