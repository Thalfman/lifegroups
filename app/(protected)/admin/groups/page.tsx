import { PageBody } from "@/components/lg/PageHeader";
import { GroupManagementShell } from "@/components/admin/group-management-shell";
import { loadGroupManagementData } from "@/components/admin/groups/group-management-data";
import { adminPage } from "@/lib/admin/admin-page";
import { isSuperAdminRole } from "@/lib/auth/roles";
import { resolveGroupListTab } from "@/lib/dashboard/group-list-tabs";
import {
  BackToSetupLink,
  isFromSetup,
} from "@/components/lg/admin/back-to-setup-link";

// Wired through the admin page runner (ADR 0028). The viewer id / super-admin
// flag come off the runner's admin session (the same React-cached session the
// guard resolved); the viewer id only scopes this browser's saved card⇄table
// view preference so two admins sharing a device don't inherit each other's
// choice (#325).
export const dynamic = "force-dynamic";

export default adminPage({
  params: (raw) => ({
    initialTab: resolveGroupListTab(raw.searchParams.tab),
    // `origin_setup=1` is the setup origin riding back through the Manage-group-
    // types round trip (#788), whose own `from` param holds `groups`; treat
    // either signal as "in the setup chain" so the Back-to-setup link survives.
    fromSetup:
      isFromSetup(raw.searchParams.from) ||
      raw.searchParams.origin_setup === "1",
  }),
  load: async (_params, session) => ({
    data: await loadGroupManagementData(),
    viewerId: session.profile.id,
    isSuperAdmin: isSuperAdminRole(session.profile.role),
  }),
  header: () => ({
    eyebrow: "Groups",
    title: "Groups",
    italic: "setup · health · capacity",
    lede: "The single home for group setup, health, capacity, and lifecycle. Each group's standing reads as four independent labels — lifecycle, setup, health (the Group-Health Grade), and capacity. Open a group for its Health, Attendance, Follow-ups, and Events.",
  }),
  render: ({ data, viewerId, isSuperAdmin }, { initialTab, fromSetup }) => (
    <PageBody>
      {fromSetup ? (
        <BackToSetupLink className="mb-3 block w-fit font-sans text-xs font-semibold text-ink2 no-underline hover:text-ink" />
      ) : null}
      <GroupManagementShell
        data={data}
        viewerId={viewerId}
        isSuperAdmin={isSuperAdmin}
        initialTab={initialTab}
        fromSetup={fromSetup}
      />
    </PageBody>
  ),
});
