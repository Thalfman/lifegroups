import { PastoralAppShell } from "@/components/pastoral/shell";
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
    <PastoralAppShell
      navItems={navItemsForRole(session.profile.role)}
      eyebrow={`${data.weekLabel} · Staff view`}
      title="The whole ministry,"
      titleItalic="at a glance."
      lede="Read-only visibility for staff coordinators. Mirrors the admin dashboard without the levers."
      headerSlot={
        <>
          <DataSourceBadge source={source} />
          <UserPill
            name={session.profile.full_name}
            email={session.profile.email}
            role={session.profile.role}
          />
          <LogoutButton />
        </>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        {source === "live" ? <ReadOnlyDataNotice /> : <FallbackDataNotice />}
        {error ? <DashboardErrorNotice message={error} /> : null}
        <AdminDashboard data={data} />
      </div>
    </PastoralAppShell>
  );
}
