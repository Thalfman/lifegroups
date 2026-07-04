import Link from "next/link";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { loadLaunchPlanningData } from "@/components/admin/launch-planning/launch-planning-data";
import { buildLaunchPlanningPanels } from "@/components/admin/launch-planning/launch-planning-panels";
import { PlanLaunchWidget } from "@/components/admin/launch-planning/plan-launch-widget";
import { PlanningShell, type PlanningTabKey } from "./planning-shell";
import { PlanningCalendarPanel } from "./planning-calendar-panel";

// The canonical Planning area view (ADR 0013, #303/#329). Planning is the entry
// point for Job 2 — "what groups need to launch / what is coming next?" — and
// hosts the former Launch Planning + Calendar surfaces as the five tabs
// Calendar, Launches, Capacity, Scenarios, Multiplication.
//
// This is the SINGLE loader + shell path for all three entries: the canonical
// /admin/planning route plus the frozen /admin/launch-planning and
// /admin/calendar aliases. Each alias is a thin page that renders this view
// with a different `initialTab` (alias-render: a 200 at the matching tab, never
// a 302). The launch data loader and tab panels are shared so the surfaces
// can't drift.
export async function PlanningView({
  monthIso,
  viewerId,
  initialTab = "calendar",
  planningViews = false,
}: {
  monthIso: string;
  viewerId?: string | null;
  initialTab?: PlanningTabKey;
  // Opt the Calendar tab into the #331 opinionated saved views. ONLY the
  // canonical /admin/planning page passes this; the frozen /admin/calendar and
  // /admin/launch-planning aliases leave it off so /admin/calendar keeps its
  // pre-#331 calendar behavior (ADR 0013 freeze). Default off so an alias that
  // forgets to set it can't accidentally leak the new affordances.
  planningViews?: boolean;
}) {
  const data = await loadLaunchPlanningData();
  const panels = buildLaunchPlanningPanels(data);

  // Launches tab: the launch-planning glance hero (notice + confidence
  // warnings + the at-a-glance answer + "Plan a launch") above the capacity
  // breakdown + staffing supply. The remaining launch panels keep their content
  // verbatim under their reduction-plan labels (Capacity / Scenarios /
  // Multiplication).
  const launchesPanel = (
    <div className="grid gap-6">
      <section className="grid gap-4">
        {panels.notice}
        {panels.warnings}
        {panels.answer}
        <PlanLaunchWidget baseline={data.assumptions} />
      </section>
      {panels.overview}
    </div>
  );

  // Capacity tab: "current and forecasted group capacity" (reduction plan §7).
  // The forecast inputs/results plus the capacity board (current per-group
  // status), which the frozen route keeps under its "Groups and multiplication"
  // tab but the plan places here.
  const capacityPanel = (
    <div className="grid gap-6">
      {panels.forecast}
      {panels.capacityBoard}
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow="Planning"
        title="What's"
        italic="next"
        lede="What is coming next: the ministry calendar and everything that goes into launching the next Life Groups, in one place."
      />
      <PageBody>
        <div className="grid gap-6">
          <PlanningShell
            initialTab={initialTab}
            calendar={
              <PlanningCalendarPanel
                monthIso={monthIso}
                viewerId={viewerId}
                planningViews={planningViews}
              />
            }
            launches={launchesPanel}
            capacity={capacityPanel}
            scenarios={panels.scenarios}
            multiplication={panels.multiplicationPlanner}
          />

          <nav
            aria-label="Related admin surfaces"
            className="flex flex-wrap items-center gap-3 font-sans text-sm text-ink2"
          >
            <span className="text-ink3">Related:</span>
            <Link href="/admin/leader-pipeline" className="text-ink underline">
              Apprentices
            </Link>
            <Link href="/admin/groups" className="text-ink underline">
              Groups
            </Link>
            <Link href="/admin/care" className="text-ink underline">
              Care
            </Link>
          </nav>
        </div>
      </PageBody>
    </>
  );
}
