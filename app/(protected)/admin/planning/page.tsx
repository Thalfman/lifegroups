import Link from "next/link";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { requireAdmin } from "@/lib/auth/session";
import { loadLaunchPlanningData } from "@/components/admin/launch-planning/launch-planning-data";
import { buildLaunchPlanningPanels } from "@/components/admin/launch-planning/launch-planning-panels";
import { PlanLaunchWidget } from "@/components/admin/launch-planning/plan-launch-widget";
import { PlanningShell } from "@/components/admin/planning/planning-shell";
import { PlanningCalendarPanel } from "@/components/admin/planning/planning-calendar-panel";
import { monthBounds } from "@/lib/calendar/occurrences";
import { churchMonthIso } from "@/lib/shared/church-time";
import { fontBody, P } from "@/lib/pastoral";

// Planning area (ADR 0013, #303). Planning is the entry point for Job 2 — "what
// groups need to launch / what is coming next?" — and hosts the former Launch
// Planning + Calendar surfaces as the five tabs Calendar, Launches, Capacity,
// Scenarios, Multiplication. It is a NEW route: the frozen
// /admin/launch-planning and /admin/calendar paths keep their files and still
// resolve directly (ADR 0008/0009). The launch data loader and tab panels are
// shared with the frozen launch-planning route so the two can't drift.
export const dynamic = "force-dynamic";

type SearchParams = { month?: string | string[] };

function pickMonthParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  return monthBounds(raw) ? raw : null;
}

export default async function AdminPlanningPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const session = await requireAdmin();
  const params = (await searchParams) ?? {};
  const monthIso = pickMonthParam(params.month) ?? churchMonthIso();

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
            calendar={
              <PlanningCalendarPanel
                monthIso={monthIso}
                viewerId={session.profile.id}
              />
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
              Leader pipeline
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
