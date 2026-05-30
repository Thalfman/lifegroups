import { redirect } from "next/navigation";
import { PastoralAppShell } from "@/components/pastoral/shell";
import { EmptyState } from "@/components/dashboard/cards";
import { MyShepherdsTable } from "@/components/over-shepherd/my-shepherds-table";
import { requireOverShepherd } from "@/lib/auth/session";
import { navItemsForRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchOverShepherdCoverageForCaller } from "@/lib/over-shepherd/coverage";
import { fetchOverShepherdCareDirectory } from "@/lib/over-shepherd/read-models";
import { fetchMetricDefaults } from "@/lib/supabase/read-models";
import {
  careCadenceWindowsFromDefaults,
  decodeMetricDefaults,
} from "@/lib/admin/metrics";

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

  // Either backend read failing — surface one controlled empty state rather
  // than leaking a 500.
  const unavailable = (
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

  if (coverageResult.error) return unavailable;

  // Bridge contract (fetchOverShepherdCoverageForCaller): a null payload with
  // no error means no-access — the caller's profile resolved to zero or an
  // ambiguous (>1) active roster row. That is NOT an over_shepherd with an
  // empty assignment list (which resolves to { coveredShepherdIds: [] }), so
  // deny the surface rather than masking a broken/ambiguous email bridge as a
  // benign "no Shepherds assigned" page (Codex #5).
  const coverage = coverageResult.data;
  if (coverage === null) redirect("/unauthorized");
  const coveredIds = coverage.coveredShepherdIds;

  // Honor the admin-configured delegated staleness window so this directory's
  // needs_attention agrees with the admin surfaces (#123). Every covered
  // Shepherd is delegated by definition, so only the delegated window matters;
  // a missing/failed settings read falls back to the documented baseline.
  const metricDefaultsRes = client ? await fetchMetricDefaults(client) : null;
  const windows = careCadenceWindowsFromDefaults(
    decodeMetricDefaults(metricDefaultsRes?.data ?? null),
  );

  const directoryResult = await fetchOverShepherdCareDirectory(
    client!,
    coveredIds,
    { windows },
  );

  if (directoryResult.error) return unavailable;

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
