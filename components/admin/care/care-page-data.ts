import { loadAdminFollowUpsData } from "@/components/admin/follow-ups/follow-ups-data";
import type { AdminFollowUpsData } from "@/components/admin/follow-ups/follow-ups-shell";
import {
  buildCareWorkspace,
  type CareWorkspace,
} from "@/components/admin/care/care-workspace";
import type { DirectoryFilter } from "@/lib/admin/shepherd-care-view";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  loadCareAccordionEnrichment,
  EMPTY_ENRICHMENT,
  type CareAccordionEnrichment,
} from "@/lib/supabase/care-accordion-reads";
import { loadCareData, type CareData } from "@/components/admin/care/care-data";
import {
  buildNotesFeedData,
  supabaseNotesFeedReads,
  EMPTY_NOTES_FEED,
  type NotesFeedContext,
  type NotesFeedData,
} from "@/components/admin/care/notes-feed-data";

// The Care page's read orchestration, lifted out of the route so its promise
// threading — a concurrent batch whose notes-feed seed maps are then-derived
// mid-flight, plus a handled-rejection guard — is a pure function of injected
// loaders that tests can drive with resolvable/rejectable fakes. The route
// keeps only the admin guard, date/year resolution, and the live bindings
// below; this module owns everything between "context resolved" and
// "workspace built".

// The four reads the Care page fans out to. Production binds the live
// `carePageLoaders`; a test injects deferreds satisfying the same interface.
export type CarePageLoaders = {
  loadFollowUps: () => Promise<AdminFollowUpsData>;
  loadCare: (todayIso: string) => Promise<CareData>;
  loadEnrichment: (
    ministryYear: number | null,
    periodMonthIso: string
  ) => Promise<CareAccordionEnrichment>;
  loadNotesFeed: (context: NotesFeedContext) => Promise<NotesFeedData>;
};

// Everything the route resolves before orchestration starts: the guarded
// viewer, the roster filter from the URL, and the date/year anchors the care
// and enrichment loaders key off.
export type CarePageContext = {
  viewerId: string;
  isSuperAdmin: boolean;
  rosterFilter: DirectoryFilter;
  todayIso: string;
  // Health grades are keyed to the current Ministry Year (Aug-May); the Jun/Jul
  // off-season has none, so the enrichment loader skips the grade reads then.
  ministryYear: number | null;
  periodMonthIso: string;
};

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

// The live adapters: each loader binds its own cookie-authenticated client (or
// degrades to its documented empty shape without one).
export const carePageLoaders: CarePageLoaders = {
  loadFollowUps: loadAdminFollowUpsData,
  loadCare: loadCareData,
  loadEnrichment: loadCareAccordionEnrichmentSafe,
  loadNotesFeed: loadNotesFeedSafe,
};

export async function buildCarePageData(
  loaders: CarePageLoaders,
  context: CarePageContext
): Promise<CareWorkspace> {
  const batch = Promise.all([
    loaders.loadFollowUps(),
    loaders.loadCare(context.todayIso),
    loaders.loadEnrichment(context.ministryYear, context.periodMonthIso),
  ]);

  // The Notes feed starts now, concurrently with the batch: its content reads
  // don't depend on the batch, only on the name seeds produced by the batch.
  const notesFeedPromise = loaders.loadNotesFeed({
    viewerProfileId: context.viewerId,
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
    viewerId: context.viewerId,
    isSuperAdmin: context.isSuperAdmin,
    rosterFilter: context.rosterFilter,
    todayIso: context.todayIso,
    followUpsData,
    care,
    enrichment,
    notesFeed,
  });
}
