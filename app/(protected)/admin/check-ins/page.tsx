import { PastoralAppShell } from "@/components/pastoral/shell";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import { CheckInReviewShell } from "@/components/admin/check-in-review-shell";
import { requireAdmin } from "@/lib/auth/session";
import { navItemsForRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildWeekOptions,
  fetchAdminWeeklyCheckInReview,
  validateWeekParam,
  type WeeklyReviewData,
} from "@/lib/admin/check-ins";

export const dynamic = "force-dynamic";

const EMPTY_DATA: (meetingWeek: string) => WeeklyReviewData = (meetingWeek) => ({
  meetingWeek,
  rows: [],
  summary: {
    totalActive: 0,
    submitted: 0,
    missing: 0,
    didNotMeet: 0,
    plannedPause: 0,
    needsFollowUp: 0,
  },
  errors: {
    groups: "Supabase is not configured in this environment.",
    leaders: null,
    profiles: null,
    sessions: null,
    records: null,
    health: null,
    settings: null,
  },
});

type SearchParams = { week?: string | string[] };

export default async function AdminCheckInsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const session = await requireAdmin();
  const params = (await searchParams) ?? {};
  const meetingWeek = validateWeekParam(params.week);
  const weekOptions = buildWeekOptions(new Date());

  const client = await createSupabaseServerClient();
  const data = client
    ? await fetchAdminWeeklyCheckInReview(client, meetingWeek)
    : EMPTY_DATA(meetingWeek);

  return (
    <PastoralAppShell
      navItems={navItemsForRole(session.profile.role)}
      eyebrow="Check-ins"
      title="Check-ins this week"
      lede="Who turned in their group check-in this week, and which groups raised a follow-up signal. Closed groups aren't counted."
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
      <CheckInReviewShell
        data={data}
        meetingWeek={meetingWeek}
        weekOptions={weekOptions}
      />
    </PastoralAppShell>
  );
}
