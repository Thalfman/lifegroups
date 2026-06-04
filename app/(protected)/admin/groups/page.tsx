import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { GroupManagementShell } from "@/components/admin/group-management-shell";
import { loadGroupManagementData } from "@/components/admin/groups/group-management-data";
import { getCurrentSession, requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminGroupsPage() {
  await requireAdmin();
  // The signed-in admin's profile id, used only to scope this browser's saved
  // card⇄table view preference so two admins sharing a device don't inherit
  // each other's choice (#325). getCurrentSession is React-cached, so this
  // re-uses the lookup requireAdmin just performed rather than re-reading.
  const session = await getCurrentSession();
  const viewerId = session.kind === "authenticated" ? session.profile.id : null;
  const data = await loadGroupManagementData();

  return (
    <>
      <PageHeader
        eyebrow="Groups"
        title="Groups"
        italic="setup · health · capacity"
        lede="The single home for group setup, health, capacity, and lifecycle. Each group's standing reads as four independent labels — lifecycle, setup, health (the Group-Health Grade), and capacity. Open a group for its Health, Attendance, Follow-ups, and Events."
      />
      <PageBody>
        <GroupManagementShell data={data} viewerId={viewerId} />
      </PageBody>
    </>
  );
}
