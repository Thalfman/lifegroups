import { PastoralAppShell } from "@/components/pastoral/shell";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import {
  GuestsManagementShell,
  type GuestsManagementData,
} from "@/components/admin/guests/guests-shell";
import { requireAdmin } from "@/lib/auth/session";
import { navItemsForRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchAllGroups,
  fetchGuestFollowUpCounts,
  fetchGuests,
  fetchProfilesForAdmin,
} from "@/lib/supabase/read-models";

export const dynamic = "force-dynamic";

const EMPTY_DATA: GuestsManagementData = {
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

async function loadData(): Promise<GuestsManagementData> {
  const client = await createSupabaseServerClient();
  if (!client) return EMPTY_DATA;

  const [guestsResult, groupsResult, profilesResult] = await Promise.all([
    fetchGuests(client),
    fetchAllGroups(client),
    fetchProfilesForAdmin(client, {
      roles: ["super_admin", "ministry_admin", "leader", "co_leader"],
      statuses: ["active"],
    }),
  ]);

  const guests = guestsResult.data ?? [];
  const guestIds = guests.map((g) => g.id);
  const followUpCountsResult = await fetchGuestFollowUpCounts(client, guestIds);
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

export default async function AdminGuestsPage() {
  const session = await requireAdmin();
  const data = await loadData();

  return (
    <PastoralAppShell
      navItems={navItemsForRole(session.profile.role)}
      currentUser={{
        name: session.profile.full_name,
        email: session.profile.email,
        role: session.profile.role,
      }}
      eyebrow="Guests"
      title="Guests"
      lede="Add a guest, walk them through the pipeline, and assign a follow-up owner. Nothing here sends an SMS or email — this is your manual record."
      headerSlot={
        <>
          <UserPill
            name={session.profile.full_name}
            email={session.profile.email}
            role={session.profile.role}
          />
          <LogoutButton />
        </>
      }
    >
      <GuestsManagementShell data={data} />
    </PastoralAppShell>
  );
}
