import Link from "next/link";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { loadLaunchPlanningData } from "@/components/admin/launch-planning/launch-planning-data";
import { buildLaunchPlanningPanels } from "@/components/admin/launch-planning/launch-planning-panels";
import { PlanLaunchWidget } from "@/components/admin/launch-planning/plan-launch-widget";
import { PlanningShell, type PlanningTabKey } from "./planning-shell";
import { PlanningCalendarPanel } from "./planning-calendar-panel";
import { fontBody, P } from "@/lib/pastoral";

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
}: {
  monthIso: string;
  viewerId?: string | null;
  initialTab?: PlanningTabKey;
}) {
  const data = await loadLaunchPlanningData();
  const panels = buildLaunchPlanningPanels(data);

  // Launches tab: the launch-planning glance hero (notice + confidence
  // warnings + the at-a-glance answer + "Plan a launch") above the capacity
  // breakdown + staffing supply. The remaining launch panels keep their content
  // verbatim under their reduction-plan labels (Capacity / Scenarios /
  // Multiplication).
  const launchesPanel = (
    <div style={{ display: "grid", gap: 24 }}>
      <section style={{ display: "grid", gap: 16 }}>
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
    <div style={{ display: "grid", gap: 24 }}>
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
        lede="What is coming next — the ministry calendar and everything that goes into launching the next Life Groups, in one place."
      />
      <PageBody>
        <div style={{ display: "grid", gap: 24 }}>
          <PlanningShell
            initialTab={initialTab}
            calendar={
              <PlanningCalendarPanel monthIso={monthIso} viewerId={viewerId} />
            }
            launches={launchesPanel}
            capacity={capacityPanel}
            scenarios={panels.scenarios}
            multiplication={panels.multiplicationPlanner}
          />

          <nav
            aria-label="Related admin surfaces"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
              fontFamily: fontBody,
              fontSize: 13,
              color: P.ink2,
            }}
          >
            <span style={{ color: P.ink3 }}>Related:</span>
            <Link
              href="/admin/leader-pipeline"
              style={{ color: P.ink, textDecoration: "underline" }}
            >
              Apprentices
            </Link>
            <Link
              href="/admin/groups"
              style={{ color: P.ink, textDecoration: "underline" }}
            >
              Groups
            </Link>
            <Link
              href="/admin/care"
              style={{ color: P.ink, textDecoration: "underline" }}
            >
              Care
            </Link>
          </nav>
        </div>
      </PageBody>
    </>
  );
}
