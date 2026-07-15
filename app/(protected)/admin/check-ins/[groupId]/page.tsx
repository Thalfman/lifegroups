import { notFound } from "next/navigation";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { FrozenSurfaceBanner } from "@/components/lg/FrozenSurfaceBanner";
import { movedToFor } from "@/lib/nav/route-registry";
import { CheckInDetailShell } from "@/components/admin/check-in-detail-shell";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/shared/uuid";
import {
  buildCheckInDetailData,
  emptyCheckInDetail,
  supabaseCheckInDetailReads,
  validateWeekParam,
  type CheckInDetailResult,
} from "@/lib/admin/check-ins";

export const dynamic = "force-dynamic";

type Params = { groupId: string };
type SearchParams = { week?: string | string[] };

// Binds the live client and runs the pure buildCheckInDetailData assembly
// (ADR 0015). The seam interface, adapter, and build live in
// lib/admin/check-ins.ts next to the shared check-in derivations; only this
// page touches the server client, so the client-side detail shell can keep
// importing the formatters and types from that module.
async function loadCheckInDetailData(options: {
  groupId: string;
  meetingWeek: string;
}): Promise<CheckInDetailResult> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      kind: "ok",
      data: emptyCheckInDetail(
        options.groupId,
        options.meetingWeek,
        "The database is not configured in this environment."
      ),
    };
  }
  return buildCheckInDetailData(supabaseCheckInDetailReads(client), options);
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
  if (!isUuid(groupId)) notFound();

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
      <FrozenSurfaceBanner
        movedTo={movedToFor("/admin/check-ins/[groupId]") ?? undefined}
      />
      <PageHeader
        eyebrow="Check-in detail"
        title={data.group?.name ?? "Group"}
        italic="this week."
        lede="Read the shepherd's full note, see who showed up, and confirm the health pulse for the week."
        maxWidth={920}
      />
      <PageBody maxWidth={920}>
        <CheckInDetailShell data={data} meetingWeek={meetingWeek} />
      </PageBody>
    </>
  );
}
