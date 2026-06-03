import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  currentPeriodMonthIso,
  listGroupHealthOverview,
} from "@/lib/admin/group-health-read";
import { resolveGroupGradeBoard } from "@/lib/admin/group-health-grades";
import { fetchPlatformConfig } from "@/lib/supabase/read-models";
import { fetchMetricDefaultsCached } from "@/lib/supabase/cached-config";
import { decodeMetricDefaults } from "@/lib/admin/metrics";
import { decodeAppConfig } from "@/lib/admin/app-config-decode";
import { GROUP_HEALTH_COPY_KEYS, resolveCopy } from "@/lib/admin/editable-copy";
import { GroupHealthTriage } from "@/components/lg/admin/group-health-triage";

// Group health triage workflow (#259, Admin Interaction Model PRD req 2 — the
// Editing Pattern reference implementation). The repeated per-row form-table is
// gone: this is a review/triage table, and editing one group at a time happens
// in the shared EditingSurface drawer (GroupHealthTriage). The grade still
// recomputes live on read for the current month; placeholder labels stay as-is
// (ADR-0007). The final filter logic (director thresholds) is gated to step 05.
export default async function GroupHealthPage() {
  const client = await createSupabaseServerClient();
  if (!client) {
    return (
      <>
        <PageHeader eyebrow="Ministry Admin" title="Group health" />
        <PageBody>
          <p style={{ fontFamily: "var(--font-body)", color: "var(--c-ink2)" }}>
            The database isn&apos;t configured, so grades can&apos;t be loaded.
          </p>
        </PageBody>
      </>
    );
  }

  const period = currentPeriodMonthIso();
  // The overview and the editable-copy config are independent reads, so fetch
  // them concurrently rather than waterfalling on this on-every-load surface.
  //
  // Phase SAC.2 (#162): the two question wordings are operator-editable via the
  // Super Admin Console. platform_config is Super-Admin-only via RLS, so for a
  // ministry_admin this read returns null and decodeAppConfig yields {} — which
  // makes resolveCopy fall back to the documented placeholders. That graceful
  // fallback is the intended behaviour, not an error.
  const [overview, platformConfig, metricDefaults] = await Promise.all([
    listGroupHealthOverview(client, period),
    fetchPlatformConfig(client),
    fetchMetricDefaultsCached(client),
  ]);
  const editableCopy = decodeAppConfig(platformConfig.data).editableCopy;
  // The director's Watch grade threshold, sourced from Settings (#265). A read
  // failure falls back to the documented default rather than failing the page.
  const watchGrade = decodeMetricDefaults(
    metricDefaults.error ? null : metricDefaults.data
  ).group_health_watch_grade;
  const spiritualGrowthLabel = resolveCopy(
    editableCopy,
    GROUP_HEALTH_COPY_KEYS.spiritualGrowth
  );
  const groupQuestionLabel = resolveCopy(
    editableCopy,
    GROUP_HEALTH_COPY_KEYS.groupQuestion
  );

  if (overview.error) {
    return (
      <>
        <PageHeader eyebrow="Ministry Admin" title="Group health" />
        <PageBody>
          <p style={{ fontFamily: "var(--font-body)", color: "#923220" }}>
            Couldn&apos;t load group-health grades. Refresh to try again.
          </p>
        </PageBody>
      </>
    );
  }

  // Resolve each group's effective grade and rank best-to-worst (ungraded
  // last) through the one Group-Health Grade facade, so the groups that need
  // attention surface together (PRD Q12 Job 3 / #129). Overrides land with
  // #129; an empty map ranks by the computed letter as-is.
  const rowsById = new Map(overview.data.map((row) => [row.group_id, row]));
  const board = resolveGroupGradeBoard(
    overview.data.map((row) => ({
      group_id: row.group_id,
      group_name: row.group_name,
      computed_letter: row.computed_letter,
    })),
    new Map(),
    period
  );
  const rows = board.ranked.map((g) => rowsById.get(g.group_id)!);

  return (
    <>
      <PageHeader
        eyebrow="Ministry Admin"
        title="Group health"
        lede={`Group-Health Grade for ${period}, recomputed live from attendance consistency (rolling 8-week average) and your 1–5 ratings. Open a group to edit its ratings; saving writes the month's snapshot.`}
      />
      <PageBody>
        <GroupHealthTriage
          rows={rows}
          period={period}
          spiritualGrowthLabel={spiritualGrowthLabel}
          groupQuestionLabel={groupQuestionLabel}
          watchGrade={watchGrade}
        />
      </PageBody>
    </>
  );
}
