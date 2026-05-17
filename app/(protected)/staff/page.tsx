import { AppShell } from "@/components/layout/shell";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { DataSourceBadge } from "@/components/dashboard/data-source-badge";
import {
  DashboardErrorNotice,
  FallbackDataNotice,
  ReadOnlyDataNotice,
} from "@/components/dashboard/notices";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import { requireAdminOrStaff } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminDashboardData } from "@/lib/dashboard/queries";
import { navItemsForRole } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const session = await requireAdminOrStaff();
  const client = await createSupabaseServerClient();
  const { source, data, error } = await getAdminDashboardData(client);

  return (
    <AppShell
      title="Staff Read-Only View"
      subtitle="Ministry-wide read-only visibility for staff coordinators."
      phaseLabel="Staff"
      navItems={navItemsForRole(session.profile.role)}
      headerSlot={
        <>
          <DataSourceBadge source={source} />
          <UserPill name={session.profile.full_name} email={session.profile.email} role={session.profile.role} />
          <LogoutButton />
        </>
      }
    >
      {source === "live" ? <ReadOnlyDataNotice /> : <FallbackDataNotice />}
      {error ? <DashboardErrorNotice message={error} /> : null}
      <AdminDashboard data={data} />
    </AppShell>
  );
}
