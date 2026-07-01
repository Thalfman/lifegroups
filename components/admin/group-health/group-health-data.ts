import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bindReads, type OmitClient } from "@/lib/supabase/reads-seam";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { listGroupHealthOverview } from "@/lib/admin/group-health-read";
import { currentPeriodMonthIso } from "@/lib/admin/ministry-year";
import { resolveGroupGradeBoard } from "@/lib/admin/group-health-grades";
import { fetchPlatformConfig } from "@/lib/supabase/settings-reads";
import { fetchMetricDefaultsCached } from "@/lib/supabase/cached-config";
import { decodeMetricDefaults } from "@/lib/admin/metrics";
import { decodeAppConfig } from "@/lib/admin/app-config-decode";
import { GROUP_HEALTH_COPY_KEYS, resolveCopy } from "@/lib/admin/editable-copy";

type GroupHealthOverviewRow = NonNullable<
  Awaited<ReturnType<typeof listGroupHealthOverview>>["data"]
>[number];
type WatchGrade = ReturnType<
  typeof decodeMetricDefaults
>["group_health_watch_grade"];

// The Group-Health surface's data, as a function of the reads seam (ADR 0015).
// The page renders three distinct states (no DB, read error, ok); the build
// function decides which, so the ranking + copy-resolution assembly is testable
// through an in-memory `reads` adapter rather than only via the rendered page.
export type GroupHealthView =
  | { status: "no-db" }
  | { status: "error" }
  | {
      status: "ok";
      period: string;
      rows: GroupHealthOverviewRow[];
      spiritualGrowthLabel: string;
      groupQuestionLabel: string;
      watchGrade: WatchGrade;
    };

export type GroupHealthReads = {
  listGroupHealthOverview: OmitClient<typeof listGroupHealthOverview>;
  fetchPlatformConfig: OmitClient<typeof fetchPlatformConfig>;
  fetchMetricDefaults: OmitClient<typeof fetchMetricDefaultsCached>;
};

export function supabaseGroupHealthReads(
  client: AppSupabaseClient
): GroupHealthReads {
  return bindReads(client, {
    listGroupHealthOverview,
    fetchPlatformConfig,
    fetchMetricDefaults: fetchMetricDefaultsCached,
  });
}

export async function buildGroupHealthData(
  reads: GroupHealthReads,
  options: { period?: string } = {}
): Promise<GroupHealthView> {
  const period = options.period ?? currentPeriodMonthIso();

  // The overview and the editable-copy config are independent reads, so fetch
  // them concurrently rather than waterfalling on this on-every-load surface.
  //
  // Phase SAC.2 (#162): the two question wordings are operator-editable via the
  // Super Admin Console. platform_config is Super-Admin-only via RLS, so for a
  // ministry_admin this read returns null and decodeAppConfig yields {} — which
  // makes resolveCopy fall back to the documented placeholders. That graceful
  // fallback is the intended behaviour, not an error.
  const [overview, platformConfig, metricDefaults] = await Promise.all([
    reads.listGroupHealthOverview(period),
    reads.fetchPlatformConfig(),
    reads.fetchMetricDefaults(),
  ]);

  if (overview.error || !overview.data) return { status: "error" };

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

  return {
    status: "ok",
    period,
    rows,
    spiritualGrowthLabel,
    groupQuestionLabel,
    watchGrade,
  };
}

export async function loadGroupHealthData(): Promise<GroupHealthView> {
  const client = await createSupabaseServerClient();
  if (!client) return { status: "no-db" };
  return buildGroupHealthData(supabaseGroupHealthReads(client));
}
