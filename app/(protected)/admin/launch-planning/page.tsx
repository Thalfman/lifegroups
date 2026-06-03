import Link from "next/link";
import { PageBody, PageHeader } from "@/components/lg/PageHeader";
import { requireAdmin } from "@/lib/auth/session";
import { loadLaunchPlanningData } from "@/components/admin/launch-planning/launch-planning-data";
import { buildLaunchPlanningPanels } from "@/components/admin/launch-planning/launch-planning-panels";
import { LaunchPlanningShell } from "@/components/admin/launch-planning/launch-planning-shell";
import { fontBody, P } from "@/lib/pastoral";

export const dynamic = "force-dynamic";

// ADR 0010 surface-budget consolidation: this single surface answers one job —
// "how many groups can we launch, and when" — and absorbs the former Capacity
// board and Multiplication surfaces (both old routes now redirect here). The
// data loader and tab panels are shared with the Planning area (#303); this
// frozen route keeps its path and its progressive-disclosure shell unchanged.
export default async function AdminLaunchPlanningPage() {
  await requireAdmin();
  const data = await loadLaunchPlanningData();
  const panels = buildLaunchPlanningPanels(data);

  return (
    <>
      <PageHeader
        eyebrow="Launch planning"
        title="Capacity"
        italic="planning"
        lede="How many Life Groups we can launch, and when — group capacity, expected growth, staffing supply, and the multiplication pipeline in one place."
      />
      <PageBody>
        <div style={{ display: "grid", gap: 24 }}>
          <LaunchPlanningShell
            baseline={data.assumptions}
            notice={panels.notice}
            warnings={panels.warnings}
            answer={panels.answer}
            overview={panels.overview}
            forecast={panels.forecast}
            scenarios={panels.scenarios}
            groups={panels.groups}
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
              href="/admin/settings"
              style={{ color: P.ink, textDecoration: "underline" }}
            >
              Settings
            </Link>
            <Link
              href="/admin/shepherd-care"
              style={{ color: P.ink, textDecoration: "underline" }}
            >
              Leader care
            </Link>
          </nav>
        </div>
      </PageBody>
    </>
  );
}
