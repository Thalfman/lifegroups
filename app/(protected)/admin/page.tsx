import { PastoralAppShell } from "@/components/pastoral/shell";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminDashboardData } from "@/lib/dashboard/queries";
import { buildWeekOptions, validateWeekParam } from "@/lib/admin/check-ins";
import { navItemsForRole } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

type SearchParams = { week?: string | string[] };

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const session = await requireAdmin();
  const params = (await searchParams) ?? {};
  const selectedWeek = validateWeekParam(params.week);
  const weekOptions = buildWeekOptions(new Date());

  const client = await createSupabaseServerClient();
  const { data } = await getAdminDashboardData(client, {
    selectedWeek,
  });

  return (
    <PastoralAppShell
      navItems={navItemsForRole(session.profile.role)}
      currentUser={{
        name: session.profile.full_name,
        email: session.profile.email,
        role: session.profile.role,
      }}
      eyebrow="This week"
      title="This week"
      lede="Supporting Life Groups as they tell and show the story of Jesus. See what needs attention this week."
      headerSlot={
        <>
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
        <AdminDashboard data={data} weekOptions={weekOptions} />
      </div>
    </PastoralAppShell>
  );
}
