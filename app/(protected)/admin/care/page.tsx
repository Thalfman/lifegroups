import { Suspense } from "react";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { PageSkeleton } from "@/components/lg/PageSkeleton";
import { CareShell, type CareTabKey } from "@/components/admin/care/care-shell";
import type { CareWorkspace } from "@/components/admin/care/care-workspace";
import {
  buildCarePageData,
  carePageLoaders,
} from "@/components/admin/care/care-page-data";
import {
  resolveCareInitialTabFromParams,
  resolveDirectoryFilter,
  type DirectoryFilter,
} from "@/lib/admin/shepherd-care-view";
import { requireAdmin } from "@/lib/auth/session";
import { measureReadBundle } from "@/lib/observability/read-timing";
import { isSuperAdminRole } from "@/lib/auth/roles";
import {
  currentMinistryYear,
  currentPeriodMonthIso,
} from "@/lib/admin/ministry-year";
import { churchTodayIso } from "@/lib/shared/church-time";

// Care area (ADR 0013, #301; re-keyed in #334; consolidated to the PRD Care
// shell in #477). The route owns admin guarding and date resolution; read
// orchestration lives in components/admin/care/care-page-data behind injected
// loaders, and pure tab/badge/banner composition lives in
// components/admin/care/care-workspace so the canonical page and its thin alias
// entries keep one view model without reintroducing Supabase orchestration into
// the route component.
export const dynamic = "force-dynamic";

// Shared loader for the canonical Care shell. /admin/care and the thin alias
// entries (/admin/shepherd-care landing and /admin/follow-ups) all call this
// function so there is a single guarded data path. The aliases differ only by
// which tab they open on.
export async function loadCarePageData({
  rosterFilter = "all",
}: {
  rosterFilter?: DirectoryFilter;
} = {}): Promise<CareWorkspace> {
  const session = await requireAdmin();
  // SAD9: the inline permanent-delete control is super-admin-only. Gate at
  // render here; the server action + RPC re-gate authoritatively.
  const isSuperAdmin = isSuperAdminRole(session.profile.role);
  const today = churchTodayIso();
  // Health grades are keyed to the current Ministry Year (Aug-May); the Jun/Jul
  // off-season has none, so the enrichment loader skips the grade reads then.
  const ministryYear = currentMinistryYear();
  const periodMonthIso = currentPeriodMonthIso();

  return buildCarePageData(carePageLoaders, {
    viewerId: session.profile.id,
    isSuperAdmin,
    rosterFilter,
    todayIso: today,
    ministryYear,
    periodMonthIso,
  });
}

// Legacy Leader-care drill-down params that the embedded widgets and Home's
// Needs Attention actions still emit (`?view=...`, `?filter=...`,
// `?coverage=...`) against both the canonical page and the frozen
// /admin/shepherd-care alias. The shared entry resolves them to the matching
// canonical tab (and the roster's needs-attention filter) so deep links keep
// landing where the work is.
export type CareSearchParams = {
  view?: string | string[];
  filter?: string | string[];
  coverage?: string | string[];
};

// The canonical Care surface: one header, one shell. The alias entries render
// this same view, only changing which tab opens first, so the experience is
// identical regardless of which URL resolved it.
export async function CarePageView({
  initialTab = "over-shepherds",
  searchParams,
}: {
  initialTab?: CareTabKey;
  searchParams?: Promise<CareSearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const resolvedTab = resolveCareInitialTabFromParams(params, initialTab);
  const rosterFilter = resolveDirectoryFilter(params.filter);

  // Render the header synchronously and stream the care directory behind a
  // <Suspense> boundary so a fresh open flushes chrome immediately instead of
  // waiting on the full care read fan-out (see /admin home for the rationale).
  return (
    <>
      <PageHeader
        eyebrow="Care"
        title="How your shepherds"
        italic="are doing"
        lede="Your shepherds' care in one place, grouped by over-shepherd."
      />
      <Suspense fallback={<PageSkeleton bodyOnly />}>
        <CareData rosterFilter={rosterFilter} resolvedTab={resolvedTab} />
      </Suspense>
    </>
  );
}

async function CareData({
  rosterFilter,
  resolvedTab,
}: {
  rosterFilter: DirectoryFilter;
  resolvedTab: CareTabKey;
}) {
  // Timed so the production `read_bundle` logs attribute this surface's read
  // latency; `describe` carries only counts (privacy contract).
  const { tabs, errorBanner } = await measureReadBundle(
    "care_page",
    () => loadCarePageData({ rosterFilter }),
    (w) => ({ tabs: w.tabs.length, has_error_banner: w.errorBanner != null })
  );

  return (
    <PageBody>
      {/* Page-level so a failed care read is visible from every tab; otherwise
          tabs with normal empty states would falsely signal "no care work". */}
      {errorBanner ? <div className="mb-5">{errorBanner}</div> : null}
      <CareShell tabs={tabs} initialTab={resolvedTab} />
    </PageBody>
  );
}

export default async function AdminCarePage({
  searchParams,
}: {
  searchParams?: Promise<CareSearchParams>;
}) {
  return <CarePageView searchParams={searchParams} />;
}
