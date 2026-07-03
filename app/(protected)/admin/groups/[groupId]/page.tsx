// Group detail (issue #300). Groups is the single source of truth for a group's
// setup, health, attendance, capacity, lifecycle, and related activity — so a
// group's detail carries six tabs: Overview, People, Health, Attendance,
// Follow-ups, Events. The separate Group Health surface is folded in here (its
// route survives per ADR 0008/0009; the Health tab hosts the same Group-Health
// Grade read).
//
// Tabs are URL-driven (?tab=…) so each renders server-side with its own scoped
// read — the build gate server-renders this route, and a deep link to one tab
// works. Attendance is historical / read-only (the check-in flow is frozen per
// ADR 0002/0009): it never presents stale sessions as a live feed.
//
// All reads live behind the reads seam (ADR 0015): the loader binds the live
// client once and runs the pure buildGroupDetailData assembly (spine + only
// the requested tab's reads), so this page is guard → load → hand-off. The
// tab panels are purely presentational and live in
// components/admin/group-detail/group-detail-view.tsx (#822).

import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import {
  BackToSetupLink,
  isFromSetup,
} from "@/components/lg/admin/back-to-setup-link";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/lib/auth/session";
import { isSuperAdminRole } from "@/lib/auth/roles";
import { loadHiddenNavAreas } from "@/lib/nav/hidden-nav";
import { isReturning } from "@/lib/nav/return-to";
import { GroupDetailHeaderActions } from "@/components/admin/groups/group-detail-header-actions";
import { GroupTabPanel } from "@/components/admin/group-detail/group-detail-view";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchGroupTypesCached,
  fetchMetricDefaultsCached,
} from "@/lib/supabase/cached-config";
import { decodeMetricDefaults } from "@/lib/admin/metrics";
import { Suspense } from "react";
import { DetailTabPanelSkeleton } from "@/components/lg/DetailPageSkeleton";
import {
  loadGroupSpine,
  type GroupDetailOptions,
  type GroupDetailTab,
} from "@/components/admin/groups/group-detail-data";
import { currentPeriodMonthIso } from "@/lib/admin/ministry-year";
import { churchTodayIso } from "@/lib/shared/church-time";

export const dynamic = "force-dynamic";

type Params = { groupId: string };
type Search = { tab?: string; from?: string; origin_setup?: string };

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "people", label: "People" },
  { key: "health", label: "Health" },
  { key: "attendance", label: "Attendance" },
  { key: "follow-ups", label: "Follow-ups" },
  { key: "events", label: "Events" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function resolveTab(raw: string | undefined): TabKey {
  return (TABS.find((t) => t.key === raw)?.key ?? "overview") as TabKey;
}

// The editor-only config the detail-header actions need (the group-type picker
// list + the ministry default capacity). Loaded behind its own client and
// degrading to empty/null so the header still renders if a config read fails
// (mirroring the list shell, which reads the same two cached config rows).
async function loadGroupEditorConfig(): Promise<{
  groupTypes: string[];
  defaultCapacity: number | null;
}> {
  const client = await createSupabaseServerClient();
  if (!client) return { groupTypes: [], defaultCapacity: null };
  const [typesResult, defaultsResult] = await Promise.all([
    fetchGroupTypesCached(client),
    fetchMetricDefaultsCached(client),
  ]);
  return {
    groupTypes: typesResult.data ?? [],
    defaultCapacity: decodeMetricDefaults(defaultsResult.data ?? null)
      .default_group_capacity,
  };
}

export default async function AdminGroupDetailPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams?: Promise<Search>;
}) {
  const { groupId } = await params;
  const search = (await searchParams) ?? {};
  const tab: GroupDetailTab = resolveTab(search.tab);
  // ADR 0027: arrived from a setup deep-link (via the Groups list). Keep the
  // "← Back to setup" affordance here — this is where the roster work (Assign
  // leaders/members) actually happens — and preserve the marker across tabs.
  // `origin_setup=1` is the setup origin riding back through the Edit-rubric
  // round trip (#785), since that trip needs `from=group-health` for its own
  // ReturnFocus — treat either signal as "in the setup chain".
  const fromSetup = isFromSetup(search.from) || search.origin_setup === "1";
  const tabMarker = fromSetup ? "&from=setup" : "";

  const session = await requireAdmin();
  // Gates the super-admin-only "Reset attention" control inside the shared
  // health editor drawer.
  const isSuperAdmin = isSuperAdminRole(session.profile.role);

  // Resolve only the spine synchronously: it decides 404 and titles the page,
  // so it must complete before anything renders. The heavy per-tab reads are
  // deferred into the Suspense boundary below and stream in after the header +
  // tab bar paint (repo-sweep #605).
  const [spine, hiddenNavAreas, editorConfig] = await Promise.all([
    loadGroupSpine(groupId),
    loadHiddenNavAreas(),
    loadGroupEditorConfig(),
  ]);
  if (spine.kind !== "ok") notFound();
  const { group } = spine;
  // #776 OPP-8 — returned here after editing the rubric in Settings; the Health
  // tab restores scroll + focus to the "Edit rubric" button via ReturnFocus.
  const returningFromRubric = isReturning("group-health", search.from);
  const tabOptions: GroupDetailOptions = {
    groupId,
    tab,
    periodMonth: currentPeriodMonthIso(),
    todayIso: churchTodayIso(),
  };

  return (
    <>
      <PageHeader
        eyebrow="Groups"
        title={group.name}
        lede="The full record for this group: setup, the Group-Health Grade, capacity, lifecycle, and its people and activity."
        maxWidth={920}
      />
      <PageBody maxWidth={920}>
        <div className="grid gap-5">
          {/* Back link on the left, the group action menu on the right (#776
              OPP-2): Edit / Archive / Restore / (super-admin) Delete now live on
              the detail header, so reviewing a group no longer means going back
              to the list to act on it. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {fromSetup ? (
              <BackToSetupLink className="w-fit font-sans text-sm font-semibold text-ink2 no-underline hover:text-ink" />
            ) : (
              <Link
                href="/admin/groups"
                className="font-sans text-sm text-ink2 no-underline"
              >
                ← Back to groups
              </Link>
            )}
            <GroupDetailHeaderActions
              group={group}
              groupTypes={editorConfig.groupTypes}
              defaultCapacity={editorConfig.defaultCapacity}
              isSuperAdmin={isSuperAdmin}
            />
          </div>

          <div
            role="tablist"
            aria-label="Group detail sections"
            className="flex flex-wrap gap-1 self-start rounded-pill border border-line bg-surface p-[3px]"
          >
            {TABS.map((t) => {
              const active = t.key === tab;
              return (
                <Link
                  key={t.key}
                  role="tab"
                  aria-selected={active}
                  href={`/admin/groups/${groupId}?tab=${t.key}${tabMarker}`}
                  className={cn(
                    "inline-flex items-center rounded-pill px-3.5 py-2 font-sans text-sm no-underline transition-colors duration-150",
                    active
                      ? "bg-clay font-bold text-surface"
                      : "bg-transparent font-medium text-ink3 hover:bg-surfaceAlt"
                  )}
                >
                  {t.label}
                </Link>
              );
            })}
          </div>

          <Suspense
            key={`${groupId}-${tab}`}
            fallback={<DetailTabPanelSkeleton />}
          >
            <GroupTabPanel
              group={group}
              groupId={groupId}
              options={tabOptions}
              isSuperAdmin={isSuperAdmin}
              hiddenNavAreas={[...hiddenNavAreas]}
              returningFromRubric={returningFromRubric}
              fromSetup={fromSetup}
            />
          </Suspense>
        </div>
      </PageBody>
    </>
  );
}
