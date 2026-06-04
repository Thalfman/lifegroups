import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { GroupManagementShell } from "@/components/admin/group-management-shell";
import { loadGroupManagementData } from "@/components/admin/groups/group-management-data";
import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminGroupsPage() {
  await requireAdmin();
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
        <GroupManagementShell data={data} />
      </PageBody>
    </>
  );
}
