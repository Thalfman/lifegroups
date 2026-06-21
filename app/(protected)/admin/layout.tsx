import type { ReactNode } from "react";
import { LgAppShell } from "@/components/lg/shell/LgAppShell";
import { ContextualActionProvider } from "@/components/lg/admin/contextual-action-provider";
import { requireAdmin } from "@/lib/auth/session";
import { loadHiddenNavAreas } from "@/lib/nav/hidden-nav";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireAdmin();
  // Resolve the Super-Admin nav-visibility flags once for the whole admin shell
  // (ADR 0016), so the sidebar + mobile drawer hide the same tabs the operator
  // retired. Defaults to Groups/People/Planning hidden when unconfigured.
  const hiddenNavAreas = await loadHiddenNavAreas();
  return (
    <LgAppShell
      user={{
        name: session.profile.full_name,
        email: session.profile.email,
        role: session.profile.role,
      }}
      hiddenNavAreas={hiddenNavAreas}
    >
      {/* The shared contextual-action host lives in the admin layout only (not
          the role-shared LgAppShell), so its drawer + the actions it will host
          stay admin-scoped and can never mount on /leader or /over-shepherd. */}
      <ContextualActionProvider>{children}</ContextualActionProvider>
    </LgAppShell>
  );
}
