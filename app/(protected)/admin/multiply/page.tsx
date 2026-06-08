import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/session";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { P, fontBody } from "@/lib/pastoral";
import { loadMultiplyGridData } from "@/components/admin/multiply/multiply-grid-data";
import { MultiplyGridView } from "@/components/admin/multiply/multiply-grid";
import { loadMultiplyPlanData } from "@/components/admin/multiply/multiply-plan-data";
import { MultiplicationPlanner } from "@/components/admin/multiplication/multiplication-planner";
import { loadLeaderPipelineData } from "@/components/admin/leader-pipeline/leader-pipeline-data";
import { LeaderPipeline } from "@/components/admin/leader-pipeline/leader-pipeline";
import {
  MultiplyShell,
  type MultiplyTab,
  type MultiplyTabKey,
} from "@/components/admin/multiply/multiply-shell";
import { resolveMultiplyInitialTab } from "@/components/admin/multiply/multiply-data";

// Multiply area (ADR 0016 / 0019 / 0022). One tabbed surface that unifies the
// church's three faces of multiplication tracking, mirroring the Care tab shell:
//   • Plan (default) — the per-group multiplication plan seeded from Julian's Doc
//     (ADR 0006): named groups by Audience × category, with target year,
//     successor/apprentice, meeting time, and readiness chips. Re-homed here from
//     the frozen Planning tab.
//   • Readiness — the per-cell category × top-type grid (#403): the at-a-glance
//     "which cells are ready to multiply" signal. Setup lives in Settings.
//   • Leaders — the apprentice pipeline (who's ready to lead the next group),
//     re-homed from the off-nav /admin/leader-pipeline route.
// The Plan + Leaders data/tables/routes are unchanged and still resolve by direct
// URL; this re-homing surfaces them in the visible Multiply area (ADR 0022).
export const dynamic = "force-dynamic";

type SearchParams = { tab?: string | string[] };

// A compact, per-tab error note so one failed read degrades only its own tab
// rather than blanking the whole surface (the Care-page pattern).
function errorNote(message: string): ReactNode {
  return (
    <p
      style={{
        margin: 0,
        fontFamily: fontBody,
        fontSize: 13,
        color: "#7d3621",
        background: P.terraSoft,
        border: `1px solid ${P.terra}`,
        borderRadius: 8,
        padding: "10px 14px",
      }}
    >
      {message}
    </p>
  );
}

// Shared loader: run the admin guard once, then assemble the three tabs' data in
// parallel so TTFB tracks the slowest read rather than their sum. Each tab owns
// its own error so the others still render.
async function loadMultiplyPageData(): Promise<{ tabs: MultiplyTab[] }> {
  await requireAdmin();

  const [plan, grid, leaders] = await Promise.all([
    loadMultiplyPlanData(),
    loadMultiplyGridData(),
    loadLeaderPipelineData(),
  ]);

  const planCount = plan.segments.reduce(
    (n, seg) => n + seg.candidates.length,
    0
  );

  const tabs: MultiplyTab[] = [
    {
      key: "plan",
      label: "Plan",
      count: planCount,
      panel: plan.error ? (
        errorNote(`The multiplication plan could not be loaded: ${plan.error}`)
      ) : (
        <MultiplicationPlanner
          segments={plan.segments}
          availableGroups={plan.availableGroups}
          apprenticesByGroup={plan.apprenticesByGroup}
          // Suggestions are derived from the (frozen) capacity board; the Plan
          // tab doesn't load it, so none are surfaced here for now (ADR 0022).
          suggestions={[]}
        />
      ),
    },
    {
      key: "readiness",
      label: "Readiness",
      panel: grid.error ? (
        errorNote(grid.error)
      ) : (
        <MultiplyGridView grid={grid.grid} ministryYear={grid.ministryYear} />
      ),
    },
    {
      key: "leaders",
      label: "Leaders",
      count: leaders.rollup.totalApprentices,
      panel: leaders.error ? (
        errorNote(`The leader pipeline could not be loaded: ${leaders.error}`)
      ) : (
        <LeaderPipeline
          rollup={leaders.rollup}
          availableGroups={leaders.availableGroups}
        />
      ),
    },
  ];

  return { tabs };
}

export default async function AdminMultiplyPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const initialTab: MultiplyTabKey = resolveMultiplyInitialTab(params.tab);
  const { tabs } = await loadMultiplyPageData();

  return (
    <>
      <PageHeader
        eyebrow="Multiply"
        title="Plan your"
        italic="multiplication"
        lede="Which groups are slated to multiply, which cells are ready, and who's in the leader pipeline — in one place."
      />
      <PageBody>
        <MultiplyShell tabs={tabs} initialTab={initialTab} />
      </PageBody>
    </>
  );
}
