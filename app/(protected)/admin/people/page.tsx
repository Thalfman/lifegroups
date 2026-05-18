import { PastoralAppShell } from "@/components/pastoral/shell";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import { PeopleManagementShell } from "@/components/admin/people-management-shell";
import { requireAdmin } from "@/lib/auth/session";
import { navItemsForRole } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export default async function AdminPeoplePage() {
  const session = await requireAdmin();

  return (
    <PastoralAppShell
      navItems={navItemsForRole(session.profile.role)}
      eyebrow="Phase 5A.0 · Manage people"
      title="The whole church,"
      titleItalic="known by name."
      lede="Preview of admin people and role management. Real writes unlock in Phase 5A.1 once narrow write policies and server actions are verified against live Supabase. Operational writes — attendance, guests, follow-ups — unlock in Phase 5B."
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
    </PastoralAppShell>
  );
}
