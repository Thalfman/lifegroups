import { AppShell } from "@/components/layout/shell";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import { PeopleManagementShell } from "@/components/admin/people-management-shell";
import { requireAdmin } from "@/lib/auth/session";
import { navItemsForRole } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export default async function AdminPeoplePage() {
  const session = await requireAdmin();

  return (
    <AppShell
      title="Manage People"
      subtitle="Preview of admin people and role management. Real writes unlock in Phase 5A.1 once narrow write policies and server actions are verified against live Supabase. Operational writes — attendance, guests, follow-ups — unlock in Phase 5B."
      phaseLabel="Phase 5A.0"
      navItems={navItemsForRole(session.profile.role)}
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
      <PeopleManagementShell />
    </AppShell>
  );
}
