import type { ReactNode } from "react";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { AdminFollowUpsShell } from "@/components/admin/follow-ups/follow-ups-shell";
import { loadAdminFollowUpsData } from "@/components/admin/follow-ups/follow-ups-data";
import { CareItemList } from "@/components/admin/care/care-item-list";
import { CareAccordion } from "@/components/admin/care/care-accordion";
import { SectionHeader } from "@/components/layout/shell";
import { ShepherdCareDashboardSummaryCards } from "@/components/admin/shepherd-care/dashboard-summary-cards";
import { CareAttentionQueue } from "@/components/admin/shepherd-care/care-attention-queue";
import { ShepherdCareDirectoryTable } from "@/components/admin/shepherd-care/directory-table";
import { ShepherdCareFilterChips } from "@/components/admin/shepherd-care/filter-chips";
import {
  CareShell,
  type CareTab,
  type CareTabKey,
} from "@/components/admin/care/care-shell";
import {
  resolveCareInitialTabFromParams,
  resolveDirectoryFilter,
  type DirectoryFilter,
} from "@/lib/admin/shepherd-care-view";
import { requireAdmin } from "@/lib/auth/session";
import { isSuperAdminRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadHiddenNavAreas } from "@/lib/nav/hidden-nav";
import {
  currentMinistryYear,
  currentPeriodMonthIso,
} from "@/lib/admin/ministry-year";
import {
  loadCareAccordionEnrichment,
  EMPTY_ENRICHMENT,
  type CareAccordionEnrichment,
} from "@/lib/supabase/care-accordion-reads";
import {
  currentUtcDateIso,
  type ActiveShepherdCoverageAssignmentSummary,
} from "@/lib/supabase/read-models";
import { loadCareData } from "@/components/admin/care/care-data";
import {
  buildNotesFeedData,
  supabaseNotesFeedReads,
  EMPTY_NOTES_FEED,
  type NotesFeedContext,
  type NotesFeedData,
} from "@/components/admin/care/notes-feed-data";
import { NotesFeedShell } from "@/components/admin/care/notes-feed-shell";
import {
  buildShepherdCareDashboardModel,
  countAllAttentionItems,
} from "@/lib/admin/shepherd-care-dashboard";
import {
  buildCareArea,
  combinedOpenFollowUpCount,
} from "@/lib/admin/care-area";
import { buildCareAccordion } from "@/lib/admin/care-accordion";
import type { GroupsRow } from "@/types/database";

// Bucket heading inside the Follow-ups tab's shepherd-care section. Quieter than
// the SectionHeader title so the two buckets read as subdivisions of one source.
const CARE_GROUP_HEADING = "m-0 font-sans text-sm font-semibold text-ink3";

// One-line lede at the top of the Follow-ups tab (#479): the tab stacks two
// separate queues, so it opens by saying which is which before either renders.
const FOLLOW_UPS_LEDE = "m-0 font-sans text-sm text-ink2";

// Care area (ADR 0013, #301; re-keyed to the PRD IA in #334; consolidated to
// FOUR tabs in #477 so no two tabs answer the same question). Care is the
// entry point for Job 1 — "how are my leaders doing?". Every panel is backed
// by data already loaded below (loadCarePageData) — the consolidation
// introduces NO new reads:
//   • Over-Shepherds — the default landing tab: the accordion of leaders
//                      grouped by over-shepherd (#373). It absorbed the former
//                      Coverage tab: the Unassigned pane and the
//                      coverage-management link live in the accordion region.
//   • All leaders    — the flat roster, with the former Dashboard's summary
//                      tiles + attention queue above it and a needs-attention
//                      filter chip restoring the row filter the #328
//                      consolidation dropped (so Home's care-attention link
//                      lands filtered).
//   • Follow-ups     — BOTH follow-up sources, clearly labelled: a leading
//                      shepherd-care section (the former Due Soon / Completed
//                      buckets, backed by shepherd_care_follow_ups) plus the
//                      generic open-task queue (the `follow_ups` table). They are
//                      separate tables, not one queue's filters, so both render
//                      here rather than collapsing into the generic queue.
//   • Recent updates — the recent calls / notes / meetings feed.
// The legacy six-tab keys and the `view` / `filter` / `coverage` params remain
// accepted inputs forever — resolveCareInitialTabFromParams maps them onto the
// four tabs. The frozen /admin/shepherd-care and /admin/follow-ups paths,
// tables, and filenames are unchanged and still alias-render directly (200,
// not 302) (ADR 0008/0009, #328). This is a navigation/layout consolidation,
// not a data or route merge — care-note content stays on the per-leader detail
// page and the generic queue stays on the generic follow_ups table; the two
// only cross-link.
export const dynamic = "force-dynamic";

// Resolve each leader's group name(s) from the active group_leaders rows joined
// to the groups list (already loaded for the Follow-ups tab, so no extra read).
function buildGroupNameByShepherdId(
  groupLeaders: { profile_id: string; group_id: string }[],
  groups: GroupsRow[]
): Map<string, string> {
  // Only active groups: closing a group updates groups.lifecycle_status but
  // leaves its group_leaders rows active, so a closed group would otherwise
  // surface as a current related group.
  const nameById = new Map(
    groups
      .filter((g) => g.lifecycle_status === "active")
      .map((g) => [g.id, g.name])
  );
  const namesByLeader = new Map<string, string[]>();
  for (const gl of groupLeaders) {
    const name = nameById.get(gl.group_id);
    if (!name) continue;
    const list = namesByLeader.get(gl.profile_id) ?? [];
    if (!list.includes(name)) list.push(name);
    namesByLeader.set(gl.profile_id, list);
  }
  const out = new Map<string, string>();
  for (const [leaderId, names] of namesByLeader) {
    out.set(leaderId, names.sort((a, b) => a.localeCompare(b)).join(", "));
  }
  return out;
}

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

// Shared loader + tab/banner builder for the canonical Care shell. The canonical
// /admin/care page and the thin alias entries (/admin/shepherd-care landing and
// /admin/follow-ups) all call this one function so there is a single data path
// and a single set of tabs — the aliases only differ by which tab they open on
// (ADR 0013, #328). It runs the admin guard so a thin alias page is a guarded
// entry just like the canonical page. `rosterFilter` is the needs-attention
// row filter (#477): when the request carried `filter=needs_attention` the
// All-leaders roster renders pre-filtered to the flagged rows.
export async function loadCarePageData({
  rosterFilter = "all",
}: {
  rosterFilter?: DirectoryFilter;
} = {}): Promise<{
  tabs: CareTab[];
  errorBanner: ReactNode;
}> {
  const session = await requireAdmin();
  // SAD9: the inline permanent-delete control is super-admin-only. Gate at render
  // here (the server action + RPC re-gate authoritatively).
  const isSuperAdmin = isSuperAdminRole(session.profile.role);
  const today = currentUtcDateIso();
  // Health grades are keyed to the current Ministry Year (Aug–May); the Jun/Jul
  // off-season has none, so the enrichment loader skips the grade reads then.
  const ministryYear = currentMinistryYear();
  const periodMonthIso = currentPeriodMonthIso();

  const batch = Promise.all([
    loadAdminFollowUpsData(),
    loadCareData(today),
    loadCareAccordionEnrichmentSafe(ministryYear, periodMonthIso),
    loadHiddenNavAreas(),
  ]);

  // The Notes feed starts NOW, concurrently with the batch: its content reads
  // don't depend on the batch — only its name SEEDS do (the care directory +
  // groups list, so the follow-up name read only fetches what those don't
  // cover), and buildNotesFeedData awaits the seed promises after its own
  // reads return.
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
  // feed is consumed — mark the feed promise handled so the mirrored rejection
  // doesn't surface as unhandled.
  void notesFeedPromise.catch(() => EMPTY_NOTES_FEED);

  const [followUpsData, care, enrichment, hiddenNavAreas] = await batch;
  const notesFeed = await notesFeedPromise;
  const hiddenNavAreaList = [...hiddenNavAreas];
  const peopleHidden = hiddenNavAreas.has("/admin/people");

  const ownerNameByShepherdId = new Map<string, string>();
  for (const a of care.assignments) {
    ownerNameByShepherdId.set(a.shepherd_profile_id, a.over_shepherd.full_name);
  }
  const groupNameByShepherdId = buildGroupNameByShepherdId(
    care.groupLeaders,
    followUpsData.groups
  );

  // Dashboard model drives the summary tiles + attention queue (the former
  // Needs Contact signal) that now lead the All-leaders tab (#477). The
  // attention queue keeps its default top-N slice for the scan surface;
  // countAllAttentionItems gives the true total so the queue can render its
  // "+N more" footer pointing at the roster below.
  const dashboard = buildShepherdCareDashboardModel({
    entries: care.entries,
    assignments: care.assignments,
    overShepherds: care.overShepherds,
    recentInteractions: care.recentInteractions,
    careFollowUps: care.outstandingFollowUps,
    careFollowUpsAvailable: care.outstandingFollowUpsAvailable,
    todayIso: today,
    assignmentsAvailable: care.assignmentsAvailable,
    windows: care.windows,
    baselines: care.baselines,
  });
  const totalAttention = countAllAttentionItems(
    care.entries,
    care.assignments,
    today,
    {
      coverageAvailable: care.assignmentsAvailable,
      windows: care.windows,
      careFollowUps: care.outstandingFollowUps,
      baselines: care.baselines,
    }
  );

  // Coverage owner per leader, so the Directory table can render its
  // "Over-shepherd" column from the already-loaded active assignments.
  const coverageByShepherdId = new Map<
    string,
    ActiveShepherdCoverageAssignmentSummary
  >();
  for (const a of care.assignments) {
    coverageByShepherdId.set(a.shepherd_profile_id, a);
  }

  // buildCareArea maps the loaded reads into the enriched care-item rows (owner
  // + group resolved). After the #334 re-key:
  //   • recentCare        → Recent interactions tab.
  //   • dueSoon/completed  → the SHEPHERD-CARE section of the Follow-ups tab.
  // The shepherd_care_follow_ups buckets (dueSoon / completed) MUST keep an
  // actionable home: AdminFollowUpsShell reads only the generic `follow_ups`
  // table, so without this section a due-soon-not-overdue or recently-completed
  // shepherd-care follow-up would have no list to act from anywhere under
  // /admin/care (the Dashboard only counts the overdue ones). needsContact is
  // surfaced via the Dashboard attention queue and so is not consumed here.
  const area = buildCareArea({
    entries: care.entries,
    attentionQueue: dashboard.attentionQueue,
    outstandingFollowUps: care.outstandingFollowUps,
    completedFollowUps: care.completedFollowUps,
    recentInteractions: care.recentInteractions,
    ownerNameByShepherdId,
    groupNameByShepherdId,
    todayIso: today,
  });

  // #479 — the Follow-ups tab badge: one combined open count across BOTH
  // follow-up queues (open care follow-ups + open general follow-ups), so the
  // tab answers "how much open follow-up work is waiting?" at a glance. When
  // either feed failed to read, the badge is suppressed entirely rather than
  // showing a false low number (the page-level error banner explains why).
  const openFollowUpCount = combinedOpenFollowUpCount({
    careFollowUps: care.outstandingFollowUps,
    careFollowUpsAvailable: care.outstandingFollowUpsAvailable,
    generalFollowUps: followUpsData.followUps,
    generalFollowUpsAvailable: followUpsData.errors.followUps === null,
  });

  // #373 — the canonical Care view: an Over-Shepherd accordion (ADR 0016).
  // Pure consolidation of data already loaded above (over-shepherds, active
  // coverage assignments, the care directory, group leaders + groups) — no new
  // reads. Each leader carries their Leader Care Status; the grade/notes/prayer
  // slots are placeholders the panel renders (#377/#378/#381 fill them later).
  const accordionPanes = buildCareAccordion({
    overShepherds: care.overShepherds,
    assignments: care.assignments,
    groupLeaders: care.groupLeaders,
    groups: followUpsData.groups,
    careEntries: care.entries,
    // #377/#378/#381 — the formerly-placeholder slots, now filled from the
    // batched enrichment reads (Group-/Leader-Health Grades + Care Notes /
    // Prayer presence). Enrichment degrades to empty maps, never blocking the
    // accordion, so a failed grade/note read just shows ungraded / sealed.
    leaderHealthByLeaderId: enrichment.leaderHealthByLeaderId,
    groupHealthByGroupId: enrichment.groupHealthByGroupId,
    noteStateByLeaderId: enrichment.noteStateByLeaderId,
  });

  const errorBanner = care.error ? (
    <p className="m-0 rounded-md bg-claySoft px-3.5 py-2.5 font-sans text-base text-clayDeep">
      {care.error}
    </p>
  ) : null;

  // #477 — the needs-attention roster filter, restored from the pre-#328
  // directory. The chips re-navigate with `filter=needs_attention` (an
  // SSR-friendly link, no client state), and the table renders only the
  // flagged rows when it is active. The chip counts use the row-level
  // needs_attention flag — deliberately narrower than totalAttention, whose
  // extra reasons (no over-shepherd, overdue follow-up, …) surface in the
  // attention queue above the roster instead.
  const needsAttentionEntries = care.entries.filter((e) => e.needs_attention);
  const rosterEntries =
    rosterFilter === "needs_attention" ? needsAttentionEntries : care.entries;

  const tabs: CareTab[] = [
    {
      // #373 — canonical Care view, the default landing tab: the Over-Shepherd
      // accordion (collapsed by default). Since #477 it also hosts coverage
      // triage: the accordion region carries the Unassigned pane the retired
      // Coverage tab used to hold.
      key: "over-shepherds",
      label: "Over-Shepherds",
      panel: (
        <CareAccordion
          panes={accordionPanes}
          isSuperAdmin={isSuperAdmin}
          gradeEntry={enrichment.gradeEntry}
          hiddenNavAreas={hiddenNavAreaList}
        />
      ),
    },
    {
      // #477 — the merged roster tab: the former Dashboard's summary tiles +
      // attention queue lead, the flat roster of the SAME leaders the
      // Over-Shepherds tab groups follows, with the needs-attention filter
      // chips between them. One tab to scan AND act — the legacy `dashboard`
      // and `directory` keys both normalize here.
      key: "all-leaders",
      label: "All leaders",
      count: care.entries.length,
      panel: (
        <div className="grid gap-5">
          <ShepherdCareDashboardSummaryCards
            summary={dashboard.summary}
            coverageAvailable={dashboard.coverageAvailable}
            followUpsAvailable={dashboard.followUpsAvailable}
          />
          <CareAttentionQueue
            items={dashboard.attentionQueue}
            totalCount={totalAttention}
            rosterFiltered={rosterFilter === "needs_attention"}
          />
          <div className="grid gap-3">
            <p className="m-0 font-sans text-sm text-ink2">
              Every leader in one flat list — the same leaders the
              Over-Shepherds tab groups by their over-shepherd.
            </p>
            <ShepherdCareFilterChips
              current={rosterFilter}
              totalCount={care.entries.length}
              needsAttentionCount={needsAttentionEntries.length}
              coverage={undefined}
            />
            <ShepherdCareDirectoryTable
              entries={rosterEntries}
              coverageByShepherdId={coverageByShepherdId}
              emptyText={
                rosterFilter === "needs_attention"
                  ? "No leaders are flagged for attention right now."
                  : undefined
              }
              emptyAction={
                rosterFilter === "needs_attention"
                  ? {
                      href: "/admin/care?view=all-leaders",
                      label: "Show all leaders",
                    }
                  : care.entries.length === 0
                    ? isSuperAdmin || !peopleHidden
                      ? {
                          href: isSuperAdmin
                            ? "/admin/super-admin#people-import"
                            : "/admin/people",
                          label: isSuperAdmin ? "Import people" : "Open People",
                        }
                      : undefined
                    : undefined
              }
            />
          </div>
        </div>
      ),
    },
    {
      key: "follow-ups",
      label: "Follow-ups",
      // #479 — the combined open count across both queues below. Undefined
      // (no badge) when either feed failed, never a false low number.
      count: openFollowUpCount,
      // Two distinct follow-up sources live here, each clearly labelled so they
      // can't be mistaken for one another (#334 P1 — keep shepherd-care
      // follow-ups visible; #479 — subject-first headings + a one-line lede
      // stating the split, copy only, no queue merge). The shepherd-care
      // buckets (dueSoon / completed, backed by shepherd_care_follow_ups) lead
      // with their own CareItemList so due-soon-not-overdue and
      // recently-completed care follow-ups stay actionable; the generic
      // oversight queue (the `follow_ups` table) follows unchanged so neither
      // host loses functionality.
      panel: (
        <div className="grid gap-6">
          <p className={FOLLOW_UPS_LEDE}>
            Two queues live here: care follow-ups are about your leaders, and
            general follow-ups cover groups and tasks.
          </p>
          <div className="grid gap-9">
            <section className="grid gap-5">
              <SectionHeader
                eyebrow="Leader care"
                title="Care follow-ups — about your leaders"
                description="Care follow-ups due soon, overdue, or recently completed. This is a separate list from the general follow-up queue further down — the two are tracked independently, so their counts won't match."
              />
              <div className="grid gap-6">
                <div className="grid gap-2.5">
                  <h3 className={CARE_GROUP_HEADING}>
                    Due-soon care follow-ups ({area.dueSoon.length})
                  </h3>
                  <CareItemList
                    items={area.dueSoon}
                    emptyTitle="No care follow-ups due soon"
                    emptyDescription="No care follow-ups are overdue or due in the next week."
                    isSuperAdmin={isSuperAdmin}
                  />
                </div>
                <div className="grid gap-2.5">
                  <h3 className={CARE_GROUP_HEADING}>
                    Completed care follow-ups ({area.completed.length})
                  </h3>
                  <CareItemList
                    items={area.completed}
                    emptyTitle="No completed care follow-ups yet"
                    emptyDescription="Care follow-ups you mark complete land here — not items from the general follow-up queue below."
                    isSuperAdmin={isSuperAdmin}
                  />
                </div>
              </div>
            </section>
            <AdminFollowUpsShell
              data={followUpsData}
              viewerId={session.profile.id}
              isSuperAdmin={isSuperAdmin}
            />
          </div>
        </div>
      ),
    },
    {
      // The spreadsheet's "Update of communication", across all leaders: the
      // recent calls / notes / meetings feed. Key unchanged for deep links.
      key: "recent-interactions",
      label: "Recent updates",
      count: area.recentCare.length,
      panel: (
        <CareItemList
          items={area.recentCare}
          emptyTitle="No recent care logged"
          emptyDescription="Logged calls, notes, and meetings will appear here as they happen."
          isSuperAdmin={isSuperAdmin}
        />
      ),
    },
    {
      // ADR 0023 — the All Notes feed: every Care Note / Prayer Request /
      // broad note the viewer may read, in one newest-first list, plus the
      // presence-only sealed counts with the inline transparency toggle.
      // Distinct from Recent updates: that tab answers "what care activity
      // happened" (interactions, no sealed content), this one "what's written
      // that I may read". Badge = readable item count, suppressed when a feed
      // read failed (#479 — never a false low number).
      key: "notes",
      label: "Notes",
      count: notesFeed.feedAvailable ? notesFeed.items.length : undefined,
      panel: (
        <NotesFeedShell
          items={notesFeed.items}
          sealedSummary={notesFeed.sealedSummary}
          feedAvailable={notesFeed.feedAvailable}
          sealedAvailable={notesFeed.sealedAvailable}
          namesAvailable={notesFeed.namesAvailable}
        />
      ),
    },
  ];

  return { tabs, errorBanner };
}

// Legacy Leader-care drill-down params that the embedded widgets and Home's
// Needs Attention actions still emit (`?view=…`, `?filter=…`, `?coverage=…`)
// against both the canonical page and the frozen /admin/shepherd-care alias.
// The shared entry resolves them to the matching canonical tab (and the
// roster's needs-attention filter) so those deep links keep landing where the
// work is (#334 — PRD "serves its deep links"; #477 — the four-tab matrix).
export type CareSearchParams = {
  view?: string | string[];
  filter?: string | string[];
  coverage?: string | string[];
};

// The canonical Care surface: one header, one shell. The alias entries render
// this same view, only changing which tab opens first, so the experience is
// identical regardless of which URL resolved it (ADR 0013, #328). `initialTab`
// is the route's default landing tab; the legacy `view` / `filter` /
// `coverage` params (when present) override it so deep links resolve to the
// right tab — see resolveCareInitialTabFromParams. `filter=needs_attention`
// additionally pre-applies the All-leaders roster filter (#477).
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
  const { tabs, errorBanner } = await loadCarePageData({ rosterFilter });

  return (
    <>
      <PageHeader
        eyebrow="Care"
        title="How your leaders"
        italic="are doing"
        lede="Your leaders' care in one place, grouped by over-shepherd."
      />
      <PageBody>
        {/* Page-level so a failed care read is visible from every tab —
            otherwise Over-Shepherds / All leaders / Recent updates would show
            their normal empty state and falsely signal "no care work". */}
        {errorBanner ? <div className="mb-5">{errorBanner}</div> : null}
        <CareShell tabs={tabs} initialTab={resolvedTab} />
      </PageBody>
    </>
  );
}

export default async function AdminCarePage({
  searchParams,
}: {
  searchParams?: Promise<CareSearchParams>;
}) {
  return <CarePageView searchParams={searchParams} />;
}
