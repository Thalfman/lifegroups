import type { ReactNode } from "react";
import { measureReadBundle } from "@/lib/observability/read-timing";
import { PageBody } from "@/components/lg/PageHeader";
import { adminPage } from "@/lib/admin/admin-page";
import { loadMultiplyGridData } from "@/components/admin/multiply/multiply-grid-data";
import { loadMultiplyPlanData } from "@/components/admin/multiply/multiply-plan-data";
import { loadLeaderPipelineData } from "@/components/admin/leader-pipeline/leader-pipeline-data";
// The three tab panels are loaded lazily (ssr:false) so their code lands in
// post-hydration chunks instead of this route's First Load JS (see lazy-panels).
import {
  MultiplyGridView,
  LeaderPipeline,
} from "@/components/admin/multiply/lazy-panels";
import {
  MultiplyShell,
  type MultiplyTab,
} from "@/components/admin/multiply/multiply-shell";
import { PipelineView } from "@/components/admin/multiply/pipeline-view";

// Multiply area (ADR 0016 / 0019 / 0022 / 0030). One tabbed surface that unifies
// the church's three faces of multiplication tracking, mirroring the Care tab
// shell:
//   • Readiness (default) — the per-group-type grid (#403): the at-a-glance
//     "which group types are ready to multiply" signal. Setup lives in
//     Settings.
//   • Pipeline — the per-group multiplication plan seeded from Julian's Doc
//     (ADR 0006): named groups by group type, with target year, successor/
//     apprentice, and readiness chips. Re-homed here from the frozen Planning
//     tab; renamed from "Plan" (ADR 0030) to avoid colliding with the top-level
//     Plan area.
//   • Shepherds — the apprentice pipeline (who's ready to lead the next group),
//     re-homed from the off-nav /admin/leader-pipeline route.
// The Pipeline + Shepherds data/tables/routes are unchanged and still resolve by
// direct URL; this re-homing surfaces them in the visible Multiply area (ADR
// 0022). The active tab is driven by the URL's `?tab=` param inside MultiplyShell
// (legacy `?tab=plan` resolves to Pipeline).
//
// Wired through the admin page runner (ADR 0028): the guard + header + body are
// the runner's; the load assembles the three tabs.
export const dynamic = "force-dynamic";

// A compact, per-tab error note so one failed read degrades only its own tab
// rather than blanking the whole surface (the Care-page pattern).
function errorNote(message: string): ReactNode {
  return (
    <p className="m-0 rounded-md bg-roseSoft px-3.5 py-2.5 font-sans text-sm text-rose">
      {message}
    </p>
  );
}

// A calm, non-alarm notice for a degraded-but-working state (#473) — quieter
// than errorNote: the surface still renders; this only explains what it is
// showing instead.
function calmNote(message: string): ReactNode {
  return (
    <p className="m-0 rounded-md border border-line bg-bg px-3.5 py-2.5 font-sans text-sm text-ink2">
      {message}
    </p>
  );
}

// Assemble the three tabs' data in parallel so TTFB tracks the slowest read
// rather than their sum. Each tab owns its own error so the others still render.
async function loadMultiplyTabs(): Promise<{ tabs: MultiplyTab[] }> {
  // All three tabs' reads still run on every visit (the default tab is "plan",
  // so the grid compute + pipeline read are wasted on the common path — a
  // server-side per-tab split is a follow-up). Time each one separately so the
  // production `read_bundle` logs show which tab dominates and justify that
  // split with measured evidence. `describe` carries only counts/discriminants,
  // never row contents (the read-timing privacy contract).
  const [plan, grid, leaders] = await Promise.all([
    measureReadBundle("multiply_plan", loadMultiplyPlanData, (data) => ({
      result_kind: data.error ? "error" : "ok",
      segments: data.segments.length,
    })),
    measureReadBundle("multiply_readiness", loadMultiplyGridData, (data) => ({
      result_kind: data.error ? "error" : "ok",
      rule_fell_back: data.ruleFellBack,
    })),
    measureReadBundle("multiply_leaders", loadLeaderPipelineData, (data) => ({
      result_kind: data.error ? "error" : "ok",
      total_apprentices: data.rollup.totalApprentices,
    })),
  ]);

  const planCount = plan.segments.reduce(
    (n, seg) => n + seg.candidates.length,
    0
  );

  // ADR 0030: Readiness leads (the at-a-glance signal), then Pipeline (the
  // former "Plan" tab, renamed to avoid colliding with the top-level Plan area),
  // then Shepherds (the apprentice pipeline).
  const tabs: MultiplyTab[] = [
    {
      key: "readiness",
      label: "Readiness",
      panel: grid.error ? (
        errorNote(grid.error)
      ) : (
        <div className="grid gap-4">
          {/* #473: the stored trigger existed but couldn't be read — readiness
              below is evaluated against the built-in default, and saving the
              trigger in Settings will overwrite what's stored. */}
          {grid.ruleFellBack
            ? calmNote(
                "The stored multiplication trigger couldn't be read, so the " +
                  "built-in default is in use here. Saving the trigger in " +
                  "Settings will overwrite what's stored."
              )
            : null}
          <MultiplyGridView rows={grid.rows} ministryYear={grid.ministryYear} />
        </div>
      ),
    },
    {
      key: "pipeline",
      label: "Pipeline",
      count: planCount,
      panel: plan.error ? (
        errorNote(`The multiplication plan could not be loaded: ${plan.error}`)
      ) : (
        <div className="grid gap-4">
          {/* ADR 0030: the type-first Pipeline. Each pipelined type lists its
              auto-listed potential candidates (active groups of the type with no
              saved candidate) and any locked-in candidates. #757 wires the
              potential → locked-in lock-in flow (and Remove) directly into these
              sub-sections, so the legacy per-group MultiplicationPlanner is
              retired from this tab — the lock-in form replaces it. (The planner
              component is kept; the frozen /admin/planning host still renders
              it.) Matched shepherds under each type arrive in #758. */}
          <PipelineView
            pipeline={plan.pipeline}
            groupTypes={plan.groupTypes}
            unpipelinedCandidates={plan.unpipelinedCandidates}
          />
        </div>
      ),
    },
    {
      key: "leaders",
      label: "Shepherds",
      count: leaders.rollup.totalApprentices,
      panel: leaders.error ? (
        errorNote(`The shepherd pipeline could not be loaded: ${leaders.error}`)
      ) : (
        <LeaderPipeline
          rollup={leaders.rollup}
          availableGroups={leaders.availableGroups}
          memberOptionsByGroup={leaders.memberOptionsByGroup}
        />
      ),
    },
  ];

  return { tabs };
}

export default adminPage({
  load: () => loadMultiplyTabs(),
  header: () => ({
    eyebrow: "Multiply",
    title: "Plan your",
    italic: "multiplication",
    lede: "Which groups are slated to multiply, which group types are ready, and who's in the shepherd pipeline, in one place.",
  }),
  render: ({ tabs }) => (
    <PageBody>
      <MultiplyShell tabs={tabs} />
    </PageBody>
  ),
});
