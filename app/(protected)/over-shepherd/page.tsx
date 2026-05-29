import { PastoralAppShell } from "@/components/pastoral/shell";
import { EmptyState } from "@/components/dashboard/cards";
import { MyShepherdsTable } from "@/components/over-shepherd/my-shepherds-table";
import { requireOverShepherd } from "@/lib/auth/session";
import { navItemsForRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchOverShepherdCoverageForCaller } from "@/lib/over-shepherd/coverage";
import { fetchOverShepherdCareDirectory } from "@/lib/over-shepherd/read-models";

export const dynamic = "force-dynamic";

// Over-Shepherd "My Shepherds" directory — read-only, row-scoped to the
// caller's active coverage (docs/adr/0002-oversight-ladder-and-leader-gating.md).
// Scope is resolved by the OS.2 coverage bridge; the underlying rows are also
// RLS-scoped. The admin-only admin_summary is never read on this path.
export default async function OverShepherdPage() {
  const session = await requireOverShepherd();
  const client = await createSupabaseServerClient();

  const navItems = navItemsForRole(session.profile.role);
  const currentUser = {
    name: session.profile.full_name,
    email: session.profile.email,
    role: session.profile.role,
  };

  const coverageResult = await fetchOverShepherdCoverageForCaller(client);

  const shellProps = {
    navItems,
    currentUser,
    eyebrow: "Over-Shepherd",
    title: "My Shepherds",
    contentMaxWidth: 980,
  } as const;

  // Backend failure resolving coverage — surface a controlled empty state
  // rather than leaking a 500.
  if (coverageResult.error) {
    return (
      <PastoralAppShell
        {...shellProps}
        lede="We couldn't load your Shepherds just now."
      >
        <EmptyState
          title="Temporarily unavailable"
          description="Your care list couldn't be loaded. Please refresh in a moment."
        />
      </PastoralAppShell>
    );
  }

  const coverage = coverageResult.data;
  const coveredIds = coverage?.coveredShepherdIds ?? [];

  const directoryResult = await fetchOverShepherdCareDirectory(
    client!,
    coveredIds,
  );

  if (directoryResult.error) {
    return (
      <PastoralAppShell
        {...shellProps}
        lede="We couldn't load your Shepherds just now."
      >
        <EmptyState
          title="Temporarily unavailable"
          description="Your care list couldn't be loaded. Please refresh in a moment."
        />
      </PastoralAppShell>
    );
  }

  const entries = directoryResult.data;
  const lede =
    entries.length === 0
      ? "No Shepherds are assigned to your care yet. A ministry admin will route coverage your way."
      : "The Shepherds you cover, with their current care status.";

  return (
    <PastoralAppShell {...shellProps} lede={lede}>
      <MyShepherdsTable entries={entries} />
    </PastoralAppShell>
  );
}
