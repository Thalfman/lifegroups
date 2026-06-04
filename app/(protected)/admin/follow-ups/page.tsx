import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { AdminFollowUpsShell } from "@/components/admin/follow-ups/follow-ups-shell";
import { loadAdminFollowUpsData } from "@/components/admin/follow-ups/follow-ups-data";
import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminFollowUpsPage() {
  const session = await requireAdmin();
  const data = await loadAdminFollowUpsData();

  return (
    <>
      <PageHeader
        eyebrow="Follow-ups"
        title="Follow-ups"
        lede="The admin oversight queue. Open follow-ups tied to a group, member, or guest — leader-care notes live in Leader care, not here. Mark in progress when you start. Mark done when it lands."
      />
      <PageBody>
        <AdminFollowUpsShell data={data} viewerId={session.profile.id} />
      </PageBody>
    </>
  );
}
