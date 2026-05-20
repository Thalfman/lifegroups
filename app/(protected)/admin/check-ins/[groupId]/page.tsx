import { notFound } from "next/navigation";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { CheckInDetailShell } from "@/components/admin/check-in-detail-shell";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchAdminCheckInDetail,
  validateWeekParam,
  type CheckInDetailData,
} from "@/lib/admin/check-ins";

export const dynamic = "force-dynamic";

type Params = { groupId: string };
type SearchParams = { week?: string | string[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function emptyDetail(
  groupId: string,
  meetingWeek: string,
  reason: string,
): CheckInDetailData {
  return {
    groupId,
    meetingWeek,
    group: null,
    leaderNames: [],
    session: null,
    sessionStatus: "missing",
    submittedByName: null,
    attendance: null,
    health: null,
    members: [],
    errors: {
      group: reason,
      leaders: null,
      profiles: null,
      session: null,
      records: null,
      health: null,
      memberships: null,
      members: null,
    },
  };
}

export default async function AdminCheckInDetailPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();
  const { groupId } = await params;
  if (!UUID_RE.test(groupId)) notFound();

  const sp = (await searchParams) ?? {};
  const meetingWeek = validateWeekParam(sp.week);

  const client = await createSupabaseServerClient();
  const data = client
    ? await fetchAdminCheckInDetail(client, groupId, meetingWeek)
    : emptyDetail(groupId, meetingWeek, "The database is not configured in this environment.");

  if (!data.errors.group && data.group === null && client) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Check-in detail"
        title={data.group?.name ?? "Group"}
        italic="this week."
        lede="Read the leader's full note, see who showed up, and confirm the health pulse for the week."
        maxWidth={920}
      />
      <PageBody maxWidth={920}>
        <CheckInDetailShell data={data} meetingWeek={meetingWeek} />
      </PageBody>
    </>
  );
}
