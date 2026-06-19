import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { LgAppShell } from "@/components/lg/shell/LgAppShell";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { AddToHomeScreenButton } from "@/components/pwa/add-to-home-screen-button";
import { EmptyState } from "@/components/dashboard/cards";
import { MyShepherdsTable } from "@/components/over-shepherd/my-shepherds-table";
import { requireOverShepherd } from "@/lib/auth/session";
import { toShellUser } from "@/lib/auth/shell-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readFirstRunOrientationSeen } from "@/lib/account/orientation";
import { FirstRunCard } from "@/components/orientation/first-run-card";
import { fetchOverShepherdCoverageForCaller } from "@/lib/over-shepherd/coverage";
import { fetchOverShepherdCareDirectory } from "@/lib/over-shepherd/read-models";
import { fetchMetricDefaultsCached } from "@/lib/supabase/cached-config";
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

  const user = toShellUser(session.profile);

  const SHELL_MAX_WIDTH = 980;
  const shell = (lede: string, body: ReactNode) => (
    <LgAppShell user={user}>
      <PageHeader
        eyebrow="Over-Shepherd"
        title="My Shepherds"
        lede={lede}
        maxWidth={SHELL_MAX_WIDTH}
        actions={<AddToHomeScreenButton />}
      />
      <PageBody maxWidth={SHELL_MAX_WIDTH}>{body}</PageBody>
    </LgAppShell>
  );

  // The first-run "seen" flag (#560) is independent of the coverage read, so
  // fetch them in parallel rather than serially on first paint. A failed/absent
  // orientation read degrades to "seen" so the card never nags on a flaky load.
  const [orientationSeen, coverageResult] = await Promise.all([
    client ? readFirstRunOrientationSeen(client) : Promise.resolve(true),
    fetchOverShepherdCoverageForCaller(client),
  ]);

  // Either backend read failing — surface one controlled empty state rather
  // than leaking a 500.
  const unavailable = shell(
    "We couldn't load your Shepherds just now.",
    <EmptyState
      title="Temporarily unavailable"
      description="Your care list couldn't be loaded. Please refresh in a moment."
    />
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
  const metricDefaultsRes = client
    ? await fetchMetricDefaultsCached(client)
    : null;
  const windows = careCadenceWindowsFromDefaults(
    decodeMetricDefaults(metricDefaultsRes?.data ?? null)
  );

  const directoryResult = await fetchOverShepherdCareDirectory(
    client!,
    coveredIds,
    { windows }
  );

  if (directoryResult.error) return unavailable;

  const entries = directoryResult.data;
  const lede =
    entries.length === 0
      ? "No Shepherds are assigned to your care yet. A ministry admin will route coverage your way."
      : "The Shepherds you cover, with their current care status.";

  return shell(
    lede,
    <>
      {orientationSeen ? null : <FirstRunCard variant="over_shepherd" />}
      <MyShepherdsTable entries={entries} />
    </>
  );
}
