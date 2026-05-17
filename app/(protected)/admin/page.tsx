import { AppShell } from "@/components/layout/shell";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { DataSourceBadge } from "@/components/dashboard/data-source-badge";
import {
  ConfiguredDataNotice,
  DashboardErrorNotice,
  FallbackDataNotice,
} from "@/components/dashboard/notices";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminDashboardData } from "@/lib/dashboard/queries";
import { navItemsForRole } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await requireAdmin();
  const client = await createSupabaseServerClient();
  const { source, data, error } = await getAdminDashboardData(client);

  return (
    <AppShell
      title="Admin Dashboard"
      subtitle="Ministry-level visibility across every life group."
      phaseLabel="Admin"
      navItems={navItemsForRole(session.profile.role)}
      headerSlot={
        <>
          <DataSourceBadge source={source} />
          <UserPill name={session.profile.full_name} email={session.profile.email} role={session.profile.role} />
          <LogoutButton />
        </>
      }
    >
      {source === "live" ? <ConfiguredDataNotice /> : <FallbackDataNotice />}
      {error ? <DashboardErrorNotice message={error} /> : null}
      <AdminDashboard data={data} />
    </AppShell>
  );
}
