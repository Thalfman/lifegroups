// Demoted on the Julian admin OS landing (2026-05). This page remains
// functional — it is the operational review surface for weekly leader
// check-ins — but it is no longer the headline. The /admin dashboard
// now leads with shepherd care and launch planning; missing_check_in
// dropped from priority 20 to 65 in the attention queue. (The 2026-05
// surface-audit doc that recorded this is retired to git history — see
// docs/README.md "Archived"; ADR 0033 records the keep decision.)
//
// Wired through the admin page runner (ADR 0028); the frozen-surface banner is
// the runner's `frozenBanner`.
//
// Kept off-nav by design — keep/retire/re-export decision: Keep (ADR 0033). The
// only admin-side window into live leader check-in data; preserved pending a
// canonical replacement.
import { PageBody } from "@/components/lg/PageHeader";
import { CheckInReviewShell } from "@/components/admin/check-in-review-shell";
import { adminPage } from "@/lib/admin/admin-page";
import { movedToFor } from "@/lib/nav/route-registry";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildWeekOptions,
  fetchAdminWeeklyCheckInReview,
  validateWeekParam,
  type WeeklyReviewData,
} from "@/lib/admin/check-ins";

export const dynamic = "force-dynamic";

const EMPTY_DATA: (meetingWeek: string) => WeeklyReviewData = (
  meetingWeek
) => ({
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

export default adminPage({
  frozenBanner: { movedTo: movedToFor("/admin/check-ins") },
  params: (raw) => ({ meetingWeek: validateWeekParam(raw.searchParams.week) }),
  load: async ({ meetingWeek }) => {
    const client = await createSupabaseServerClient();
    const data = client
      ? await fetchAdminWeeklyCheckInReview(client, meetingWeek)
      : EMPTY_DATA(meetingWeek);
    return { data, weekOptions: buildWeekOptions(new Date()) };
  },
  header: () => ({
    eyebrow: "Check-ins",
    title: "Check-ins",
    italic: "this week",
    lede: "Who turned in their group check-in this week, and which groups raised a follow-up signal. Closed groups aren't counted.",
  }),
  render: ({ data, weekOptions }, { meetingWeek }) => (
    <PageBody>
      <CheckInReviewShell
        data={data}
        meetingWeek={meetingWeek}
        weekOptions={weekOptions}
      />
    </PageBody>
  ),
});
