import { PastoralAppShell } from "@/components/pastoral/shell";
import { EmptyState } from "@/components/dashboard/cards";
import { requireOverShepherd } from "@/lib/auth/session";
import { navItemsForRole } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

// Placeholder landing for the Over-Shepherd tier (Phase OS.1). The guard
// lives in layout.tsx; this page only confirms the role lands here, distinct
// from /admin. The scoped "My Shepherds" directory + per-Shepherd care
// history arrive in the read-surface slice (the focused nav entry already
// points here).
export default async function OverShepherdPage() {
  const session = await requireOverShepherd();

  return (
    <PastoralAppShell
      navItems={navItemsForRole(session.profile.role)}
      currentUser={{
        name: session.profile.full_name,
        email: session.profile.email,
        role: session.profile.role,
      }}
      eyebrow="Over-Shepherd"
      title="My Shepherds"
      lede="Your focused care surface. The Shepherds you cover will appear here."
      contentMaxWidth={720}
    >
      <EmptyState
        title="Coming soon"
        description="The directory of Shepherds you cover, and their care history, are being set up. Check back shortly."
      />
    </PastoralAppShell>
  );
}
