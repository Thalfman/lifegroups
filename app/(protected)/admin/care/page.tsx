import { Suspense } from "react";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { PageSkeleton } from "@/components/lg/PageSkeleton";
import { loadAdminFollowUpsData } from "@/components/admin/follow-ups/follow-ups-data";
import { CareShell, type CareTabKey } from "@/components/admin/care/care-shell";
import {
  buildCareWorkspace,
  type CareWorkspace,
} from "@/components/admin/care/care-workspace";
import {
  resolveCareInitialTabFromParams,
  resolveDirectoryFilter,
  type DirectoryFilter,
} from "@/lib/admin/shepherd-care-view";
import { requireAdmin } from "@/lib/auth/session";
import { measureReadBundle } from "@/lib/observability/read-timing";
import { isSuperAdminRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  currentMinistryYear,
  currentPeriodMonthIso,
} from "@/lib/admin/ministry-year";
import {
  loadCareAccordionEnrichment,
  EMPTY_ENRICHMENT,
  type CareAccordionEnrichment,
} from "@/lib/supabase/care-accordion-reads";
import { currentUtcDateIso } from "@/lib/supabase/read-models";
import { loadCareData } from "@/components/admin/care/care-data";
import {
  buildNotesFeedData,
  supabaseNotesFeedReads,
  EMPTY_NOTES_FEED,
  type NotesFeedContext,
  type NotesFeedData,
} from "@/components/admin/care/notes-feed-data";

// Care area (ADR 0013, #301; re-keyed in #334; consolidated to the PRD Care
// shell in #477). The route owns admin guarding, date resolution, and read
// orchestration. Pure tab/badge/banner composition lives in
// components/admin/care/care-workspace so the canonical page and its thin alias
// entries keep one view model without reintroducing Supabase orchestration into
// the route component.
export const dynamic = "force-dynamic";

// Load the accordion enrichment (grades + note presence) behind its own client,
// degrading to empty maps when the DB is not configured so the Care surface
// still renders (matching loadCareData's documented empty-shape behaviour).
async function loadCareAccordionEnrichmentSafe(
  ministryYear: number | null,
  periodMonthIso: string
): Promise<CareAccordionEnrichment> {
  const client = await createSupabaseServerClient();
  if (!client) return EMPTY_ENRICHMENT;
  return loadCareAccordionEnrichment(client, { ministryYear, periodMonthIso });
}

// Load the Notes tab's feed (ADR 0023) behind its own client, seeded with the
// names the page already resolved (leaders from the care directory, group
// names from the follow-ups groups list) so the feed only fetches the author
// names those maps don't cover. Degrades to the documented empty shape when
// the DB is not configured.
async function loadNotesFeedSafe(
  context: NotesFeedContext
): Promise<NotesFeedData> {
  const client = await createSupabaseServerClient();
  if (!client) return EMPTY_NOTES_FEED;
  return buildNotesFeedData(supabaseNotesFeedReads(client), context);
}

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
  const today = currentUtcDateIso();
  // Health grades are keyed to the current Ministry Year (Aug-May); the Jun/Jul
  // off-season has none, so the enrichment loader skips the grade reads then.
  const ministryYear = currentMinistryYear();
  const periodMonthIso = currentPeriodMonthIso();

  const batch = Promise.all([
    loadAdminFollowUpsData(),
    loadCareData(today),
    loadCareAccordionEnrichmentSafe(ministryYear, periodMonthIso),
  ]);

  // The Notes feed starts now, concurrently with the batch: its content reads
  // don't depend on the batch, only on the name seeds produced by the batch.
  const notesFeedPromise = loadNotesFeedSafe({
    viewerProfileId: session.profile.id,
    nameByProfileId: batch.then(
      ([, care]) =>
        new Map(care.entries.map((e) => [e.profile.id, e.profile.full_name]))
    ),
    groupNameByGroupId: batch.then(
      ([followUps]) => new Map(followUps.groups.map((g) => [g.id, g.name]))
    ),
  });
  // If the batch itself throws, the page errors at the await below before the
  // feed is consumed. Mark the feed promise handled so the mirrored rejection
  // doesn't surface as unhandled.
  void notesFeedPromise.catch(() => EMPTY_NOTES_FEED);

  const [followUpsData, care, enrichment] = await batch;
  const notesFeed = await notesFeedPromise;

  return buildCareWorkspace({
    viewerId: session.profile.id,
    isSuperAdmin,
    rosterFilter,
    todayIso: today,
    followUpsData,
    care,
    enrichment,
    notesFeed,
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
