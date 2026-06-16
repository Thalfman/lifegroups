import type { ReactNode } from "react";
import Link from "next/link";
import { AdminFollowUpsShell } from "@/components/admin/follow-ups/follow-ups-shell";
import { CareItemList } from "@/components/admin/care/care-item-list";
import { CareAccordion } from "@/components/admin/care/care-accordion";
import { SectionHeader } from "@/components/layout/shell";
import { ShepherdCareDashboardSummaryCards } from "@/components/admin/shepherd-care/dashboard-summary-cards";
import { CareAttentionQueue } from "@/components/admin/shepherd-care/care-attention-queue";
import { ShepherdCareDirectoryTable } from "@/components/admin/shepherd-care/directory-table";
import { ShepherdCareFilterChips } from "@/components/admin/shepherd-care/filter-chips";
import type { CareTab } from "@/components/admin/care/care-shell";
import { NotesFeedShell } from "@/components/admin/care/notes-feed-shell";
import type { AdminFollowUpsData } from "@/components/admin/follow-ups/follow-ups-shell";
import type { CareData } from "@/components/admin/care/care-data";
import type { NotesFeedData } from "@/components/admin/care/notes-feed-data";
import type { DirectoryFilter } from "@/lib/admin/shepherd-care-view";
import {
  buildShepherdCareDashboardModel,
  countAllAttentionItems,
} from "@/lib/admin/shepherd-care-dashboard";
import {
  buildCareArea,
  openFollowUpCountsByQueue,
} from "@/lib/admin/care-area";
import { buildCareAccordion } from "@/lib/admin/care-accordion";
import type { CareAccordionEnrichment } from "@/lib/supabase/care-accordion-reads";
import type { ActiveShepherdCoverageAssignmentSummary } from "@/lib/supabase/read-models";
import type { GroupsRow } from "@/types/database";

const CARE_GROUP_HEADING = "m-0 font-sans text-sm font-semibold text-ink3";
const FOLLOW_UPS_LEDE = "m-0 font-sans text-sm text-ink2";
// #644: the two open-queue figures, shown as one labelled line so the counts
// read as "N care · N general" rather than a single merged number.
const FOLLOW_UPS_OPEN_COUNTS =
  "m-0 flex flex-wrap items-center gap-1 font-sans text-sm text-ink2 [&_strong]:font-semibold [&_strong]:text-ink";

export type CareWorkspaceInput = {
  viewerId: string;
  isSuperAdmin: boolean;
  rosterFilter: DirectoryFilter;
  todayIso: string;
  followUpsData: AdminFollowUpsData;
  care: CareData;
  enrichment: CareAccordionEnrichment;
  notesFeed: NotesFeedData;
  hiddenNavAreas: readonly string[];
};

export type CareWorkspace = {
  tabs: CareTab[];
  errorBanner: ReactNode;
};

// Resolve each leader's group name(s) from the active group_leaders rows joined
// to the groups list (already loaded for the Follow-ups tab, so no extra read).
export function buildGroupNameByShepherdId(
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

function CareSetupNotice({
  isSuperAdmin,
  hasLeaders,
  hasCoverage,
}: {
  isSuperAdmin: boolean;
  hasLeaders: boolean;
  hasCoverage: boolean;
}) {
  const nextHref = !hasLeaders
    ? isSuperAdmin
      ? "/admin/super-admin#people-import"
      : "/admin/people"
    : isSuperAdmin
      ? "/admin/super-admin#coverage"
      : "/admin/people";
  const nextLabel = !hasLeaders
    ? isSuperAdmin
      ? "Import people"
      : "Open People"
    : isSuperAdmin
      ? "Assign coverage"
      : "Review leaders";

  return (
    <aside className="rounded-md border border-line bg-surface px-4 py-3.5">
      <div className="font-display text-lg font-medium text-ink">
        Care setup path
      </div>
      <p className="m-0 mt-1 font-sans text-sm text-ink2">
        Care will turn on after people are imported, leaders are marked, group
        leaders are assigned, and over-shepherd coverage is in place.
      </p>
      {!hasCoverage && hasLeaders ? (
        <p className="m-0 mt-1 font-sans text-sm text-ink2">
          Leaders exist, but coverage is not assigned yet.
        </p>
      ) : null}
      <Link
        href={nextHref}
        className="mt-3 inline-flex font-sans text-sm font-semibold text-clay no-underline hover:underline"
      >
        {nextLabel} -&gt;
      </Link>
    </aside>
  );
}

// Pure Care workspace composition: it accepts only already-loaded read models
// and returns the canonical Care shell tabs plus the page-level degraded-read
// banner. The route stays responsible for auth, date resolution, and I/O.
export function buildCareWorkspace({
  viewerId,
  isSuperAdmin,
  rosterFilter,
  todayIso,
  followUpsData,
  care,
  enrichment,
  notesFeed,
  hiddenNavAreas,
}: CareWorkspaceInput): CareWorkspace {
  const ownerNameByShepherdId = new Map<string, string>();
  for (const a of care.assignments) {
    ownerNameByShepherdId.set(a.shepherd_profile_id, a.over_shepherd.full_name);
  }
  const groupNameByShepherdId = buildGroupNameByShepherdId(
    care.groupLeaders,
    followUpsData.groups
  );

  const dashboard = buildShepherdCareDashboardModel({
    entries: care.entries,
    assignments: care.assignments,
    overShepherds: care.overShepherds,
    recentInteractions: care.recentInteractions,
    careFollowUps: care.outstandingFollowUps,
    careFollowUpsAvailable: care.outstandingFollowUpsAvailable,
    todayIso,
    assignmentsAvailable: care.assignmentsAvailable,
    windows: care.windows,
    baselines: care.baselines,
  });
  const totalAttention = countAllAttentionItems(
    care.entries,
    care.assignments,
    todayIso,
    {
      coverageAvailable: care.assignmentsAvailable,
      windows: care.windows,
      careFollowUps: care.outstandingFollowUps,
      baselines: care.baselines,
    }
  );

  const coverageByShepherdId = new Map<
    string,
    ActiveShepherdCoverageAssignmentSummary
  >();
  for (const a of care.assignments) {
    coverageByShepherdId.set(a.shepherd_profile_id, a);
  }

  const area = buildCareArea({
    entries: care.entries,
    attentionQueue: dashboard.attentionQueue,
    outstandingFollowUps: care.outstandingFollowUps,
    completedFollowUps: care.completedFollowUps,
    recentInteractions: care.recentInteractions,
    ownerNameByShepherdId,
    groupNameByShepherdId,
    todayIso,
  });

  const openFollowUpCounts = openFollowUpCountsByQueue({
    careFollowUps: care.outstandingFollowUps,
    careFollowUpsAvailable: care.outstandingFollowUpsAvailable,
    generalFollowUps: followUpsData.followUps,
    generalFollowUpsAvailable: followUpsData.errors.followUps === null,
  });

  const accordionPanes = buildCareAccordion({
    overShepherds: care.overShepherds,
    assignments: care.assignments,
    groupLeaders: care.groupLeaders,
    groups: followUpsData.groups,
    careEntries: care.entries,
    leaderHealthByLeaderId: enrichment.leaderHealthByLeaderId,
    groupHealthByGroupId: enrichment.groupHealthByGroupId,
    noteStateByLeaderId: enrichment.noteStateByLeaderId,
  });
  const hasCareLeaders = care.entries.length > 0;
  const hasCoverage = care.assignments.length > 0;
  const showCareSetupNotice =
    !hasCareLeaders || (care.assignmentsAvailable && !hasCoverage);
  const careSetupNotice = showCareSetupNotice ? (
    <CareSetupNotice
      isSuperAdmin={isSuperAdmin}
      hasLeaders={hasCareLeaders}
      hasCoverage={hasCoverage}
    />
  ) : null;

  const errorBanner = care.error ? (
    <p className="m-0 rounded-md bg-claySoft px-3.5 py-2.5 font-sans text-base text-clayDeep">
      {care.error}
    </p>
  ) : null;

  const needsAttentionEntries = care.entries.filter((e) => e.needs_attention);
  const rosterEntries =
    rosterFilter === "needs_attention" ? needsAttentionEntries : care.entries;
  const peopleHidden = hiddenNavAreas.includes("/admin/people");

  const tabs: CareTab[] = [
    {
      key: "over-shepherds",
      label: "Over-Shepherds",
      panel: (
        <div className="grid gap-5">
          {careSetupNotice}
          <CareAccordion
            panes={accordionPanes}
            isSuperAdmin={isSuperAdmin}
            gradeEntry={enrichment.gradeEntry}
            hiddenNavAreas={hiddenNavAreas}
          />
        </div>
      ),
    },
    {
      key: "all-leaders",
      label: "All leaders",
      count: care.entries.length,
      panel: (
        <div className="grid gap-5">
          {careSetupNotice}
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
              Every leader in one flat list {"\u2014"} the same leaders the
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
      // #644: no single combined count badge on the tab — the two queues are
      // tracked independently and their counts won't match, so the panel shows
      // them as two distinct labelled figures instead.
      label: "Follow-ups",
      panel: (
        <div className="grid gap-6">
          <p className={FOLLOW_UPS_LEDE}>
            Two queues live here: care follow-ups are about your leaders, and
            general follow-ups cover groups and tasks.
          </p>
          {openFollowUpCounts ? (
            <p
              className={FOLLOW_UPS_OPEN_COUNTS}
              aria-label={`${openFollowUpCounts.care} open care follow-ups, ${openFollowUpCounts.general} open general follow-ups`}
            >
              <span>
                <strong>{openFollowUpCounts.care}</strong> care
              </span>
              <span aria-hidden="true"> &middot; </span>
              <span>
                <strong>{openFollowUpCounts.general}</strong> general
              </span>
            </p>
          ) : null}
          <div className="grid gap-9">
            <section className="grid gap-5">
              <SectionHeader
                eyebrow="Leader care"
                title={"Care follow-ups \u2014 about your leaders"}
                description={
                  "Care follow-ups due soon, overdue, or recently completed. This is a separate list from the general follow-up queue further down \u2014 the two are tracked independently, so their counts won't match."
                }
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
                    emptyDescription={
                      "Care follow-ups you mark complete land here \u2014 not items from the general follow-up queue below."
                    }
                    isSuperAdmin={isSuperAdmin}
                  />
                </div>
              </div>
            </section>
            <AdminFollowUpsShell
              data={followUpsData}
              viewerId={viewerId}
              isSuperAdmin={isSuperAdmin}
            />
          </div>
        </div>
      ),
    },
    {
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
