import type { GuestsManagementData } from "@/components/admin/guests/guests-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bindReads, type BoundReads } from "@/lib/supabase/reads-seam";
import { readBatch } from "@/lib/supabase/read-batch";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { fetchGuestFollowUpCounts } from "@/lib/supabase/follow-up-reads";
import { fetchAllGroups } from "@/lib/supabase/group-reads";
import { fetchProfilesForAdmin } from "@/lib/supabase/membership-reads";
import { fetchGuests } from "@/lib/supabase/guest-reads";

// The Guests surface's data, as a function of the reads seam (ADR 0015). The
// follow-up counts are a waterfall — they read by the guest ids the first batch
// returns — and that sequencing plus the Map→record projection is now testable
// through an in-memory adapter.

const GUESTS_FETCHERS = {
  fetchGuests,
  fetchAllGroups,
  fetchProfilesForAdmin,
  fetchGuestFollowUpCounts,
};

export type GuestsReads = BoundReads<typeof GUESTS_FETCHERS>;

export function supabaseGuestsReads(client: AppSupabaseClient): GuestsReads {
  return bindReads(client, GUESTS_FETCHERS, "guests");
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
  const batch = await readBatch({
    guests: () => reads.fetchGuests(),
    groups: () => reads.fetchAllGroups(),
    profiles: () =>
      reads.fetchProfilesForAdmin({
        roles: ["super_admin", "ministry_admin", "leader", "co_leader"],
        statuses: ["active"],
      }),
  });

  const guests = batch.results.guests.data ?? [];
  const guestIds = guests.map((g) => g.id);
  const followUpCountsResult = await reads.fetchGuestFollowUpCounts(guestIds);
  const followUpCounts = followUpCountsResult.data ?? new Map<string, number>();

  return {
    guests,
    groups: batch.results.groups.data ?? [],
    ownerProfiles: batch.results.profiles.data ?? [],
    openFollowUpsByGuest: Object.fromEntries(followUpCounts.entries()),
    errors: {
      guests: batch.errors.guests,
      groups: batch.errors.groups,
      profiles: batch.errors.profiles,
      followUps: followUpCountsResult.error?.message ?? null,
    },
  };
}

export async function loadGuestsData(): Promise<GuestsManagementData> {
  const client = await createSupabaseServerClient();
  if (!client) return EMPTY_GUESTS_DATA;
  return buildGuestsData(supabaseGuestsReads(client));
}
