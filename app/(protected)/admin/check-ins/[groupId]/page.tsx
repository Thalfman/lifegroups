import { notFound } from "next/navigation";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { CheckInDetailShell } from "@/components/admin/check-in-detail-shell";
import { loadCheckInDetailData } from "@/components/admin/check-in-detail-data";
import { requireAdmin } from "@/lib/auth/session";
import { validateWeekParam } from "@/lib/admin/check-ins";

export const dynamic = "force-dynamic";

type Params = { groupId: string };
type SearchParams = { week?: string | string[] };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // All reads live behind the reads seam (ADR 0015): the loader binds the live
  // client once and runs the pure buildCheckInDetailData assembly, so this
  // page is guard → load → shell.
  const result = await loadCheckInDetailData({ groupId, meetingWeek });
  if (result.kind === "not_found") notFound();
  const data = result.data;

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
