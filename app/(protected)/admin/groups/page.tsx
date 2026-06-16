import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { GroupManagementShell } from "@/components/admin/group-management-shell";
import { loadGroupManagementData } from "@/components/admin/groups/group-management-data";
import { getCurrentSession, requireAdmin } from "@/lib/auth/session";
import { isSuperAdminRole } from "@/lib/auth/roles";
import { resolveGroupListTab } from "@/lib/dashboard/group-list-tabs";
import {
  BackToSetupLink,
  isFromSetup,
} from "@/components/lg/admin/back-to-setup-link";

export const dynamic = "force-dynamic";

type SearchParams = { tab?: string | string[]; from?: string | string[] };

export default async function AdminGroupsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();
  const params = (await searchParams) ?? {};
  const initialTab = resolveGroupListTab(params.tab);
  const fromSetup = isFromSetup(params.from);
  // The signed-in admin's profile id, used only to scope this browser's saved
  // card⇄table view preference so two admins sharing a device don't inherit
  // each other's choice (#325). getCurrentSession is React-cached, so this
  // re-uses the lookup requireAdmin just performed rather than re-reading.
  const session = await getCurrentSession();
  const viewerId = session.kind === "authenticated" ? session.profile.id : null;
  const isSuperAdmin =
    session.kind === "authenticated" && isSuperAdminRole(session.profile.role);
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
        {fromSetup ? (
          <BackToSetupLink className="mb-3 block w-fit font-sans text-xs font-semibold text-ink2 no-underline hover:text-ink" />
        ) : null}
        <GroupManagementShell
          data={data}
          viewerId={viewerId}
          isSuperAdmin={isSuperAdmin}
          initialTab={initialTab}
        />
      </PageBody>
    </>
  );
}
