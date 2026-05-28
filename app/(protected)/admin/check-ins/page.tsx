// Demoted on the Julian admin OS landing (2026-05). This page remains
// functional — it is the operational review surface for weekly leader
// check-ins — but it is no longer the headline. The /admin dashboard
// now leads with shepherd care and launch planning; missing_check_in
// dropped from priority 20 to 65 in the attention queue. See
// docs/PRODUCT_SURFACE_AUDIT_2026-05.md.
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { CheckInReviewShell } from "@/components/admin/check-in-review-shell";
import { requireAdmin } from "@/lib/auth/session";
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
    groups: "The database is not configured in this environment.",
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
  await requireAdmin();
  const params = (await searchParams) ?? {};
  const meetingWeek = validateWeekParam(params.week);
  const weekOptions = buildWeekOptions(new Date());

  const client = await createSupabaseServerClient();
  const data = client
    ? await fetchAdminWeeklyCheckInReview(client, meetingWeek)
    : EMPTY_DATA(meetingWeek);

  return (
    <>
      <PageHeader
        eyebrow="Check-ins"
        title="Check-ins"
        italic="this week"
        lede="Who turned in their group check-in this week, and which groups raised a follow-up signal. Closed groups aren't counted."
      />
      <PageBody>
        <CheckInReviewShell
          data={data}
          meetingWeek={meetingWeek}
          weekOptions={weekOptions}
        />
      </PageBody>
    </>
  );
}
