import { createSupabaseServerClient } from "@/lib/supabase/server";
import { measureReadBundle } from "@/lib/observability/read-timing";
import { bindReads, type OmitClient } from "@/lib/supabase/reads-seam";
import { readBatch } from "@/lib/supabase/read-batch";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { currentMinistryYear } from "@/components/admin/multiply/multiply-data";
import {
  buildGroupTypeCoverage,
  sortByLargestShortfall,
  type GroupTypeCoverage,
} from "@/lib/admin/group-type-coverage";
import { decodeReadinessRuleWithReport } from "@/lib/admin/cell-readiness";
import { fetchReadinessRule } from "@/lib/supabase/readiness-reads";
import {
  fetchAllGroups,
  fetchGroupTypes,
  fetchGroupTypeConfigs,
} from "@/lib/supabase/read-models";
import { loadAllGroupsForAdmin } from "@/lib/admin/groups-read";

// The Multiply by-type surface's data. The old per-cell (Audience × Category)
// grid is gone (collapsed to the free-text group_type model): rows are now group
// TYPES. For each type the loader assembles per-type coverage ("have X of Y") via
// the pure buildGroupTypeCoverage resolver — X = active+launching groups carrying
// the type, Y = the type's configured target_count — plus whether a config row
// exists (so the per-type config editor can seed). The single GLOBAL readiness
// rule is read alongside; Multiply shows coverage + the configurable rule, not a
// live per-cell readiness evaluation against removed inputs.

export type MultiplyTypeRow = GroupTypeCoverage & {
  // The per-type readiness-rule override jsonb (null = inherit the global rule),
  // so the per-type config editor can seed its override controls.
  readinessRule: Record<string, unknown> | null;
};

export type MultiplyGridData = {
  ministryYear: number;
  rows: MultiplyTypeRow[];
  // True when a STORED global trigger rule was present but couldn't be read, so
  // the surface shows the built-in default. A MISSING stored rule (fresh
  // ministry) does not set this.
  ruleFellBack: boolean;
  error: string | null;
};

export const EMPTY_MULTIPLY_GRID_DATA: MultiplyGridData = {
  ministryYear: new Date().getUTCFullYear(),
  rows: [],
  ruleFellBack: false,
  error: "The database is not configured in this environment.",
};

// The reads this surface assembles, as one interface (ADR 0015). `loadX` binds
// the live client; a test binds an in-memory adapter satisfying the same
// interface.
export type MultiplyGridReads = {
  fetchGroupTypes: OmitClient<typeof fetchGroupTypes>;
  fetchGroupTypeConfigs: OmitClient<typeof fetchGroupTypeConfigs>;
  fetchAllGroups: OmitClient<typeof fetchAllGroups>;
  fetchReadinessRule: OmitClient<typeof fetchReadinessRule>;
};

export function supabaseMultiplyGridReads(
  client: AppSupabaseClient
): MultiplyGridReads {
  return {
    ...bindReads(client, {
      fetchGroupTypes,
      fetchGroupTypeConfigs,
      fetchReadinessRule,
    }),
    // Share the per-request cached groups read with Boundary A's dashboard batch
    // (lib/admin/groups-read.ts) so a first /admin launch reads the full groups
    // table once, not once per Suspense boundary. The seam type is unchanged
    // (OmitClient<typeof fetchAllGroups> === () => Promise<ReadResult<GroupsRow[]>>),
    // so tests still inject their own in-memory fetchAllGroups.
    fetchAllGroups: () => loadAllGroupsForAdmin(),
  };
}

// Pure assembly: gather the reads through the batch combinator, then build the
// per-type coverage rows. Every degrade path is reachable from a test through an
// in-memory `reads` adapter. A failed read degrades to its empty input and
// surfaces on `error`.
export async function buildMultiplyGridData(
  reads: MultiplyGridReads,
  now: Date = new Date()
): Promise<MultiplyGridData> {
  const ministryYear = currentMinistryYear(now);

  // Declaration order is the error precedence (readBatch's firstError).
  const batch = await readBatch({
    types: () => reads.fetchGroupTypes(),
    configs: () => reads.fetchGroupTypeConfigs(),
    groups: () => reads.fetchAllGroups(),
    readinessRule: () => reads.fetchReadinessRule(ministryYear),
  });

  const types = batch.results.types.data ?? [];
  const configs = batch.results.configs.data ?? [];
  const groups = batch.results.groups.data ?? [];

  // #473: decode the stored global trigger WITH a report. A missing stored rule
  // decodes to the built-in default silently; a present-but-unreadable payload
  // flags ruleFellBack so the Readiness tab can say so instead of presenting
  // default-rule readiness as if it were the configured trigger.
  const decodedRule = decodeReadinessRuleWithReport(
    batch.results.readinessRule.data?.rule ?? null
  );

  const coverage = buildGroupTypeCoverage({
    types,
    groups: groups.map((g) => ({
      groupType: g.group_type,
      lifecycleStatus: g.lifecycle_status,
    })),
    configs: configs.map((c) => ({
      groupType: c.group_type,
      targetCount: c.target_count,
    })),
  });

  // Index the readiness override by normalized type name so each coverage row can
  // seed its per-type config editor.
  const overrideByKey = new Map<string, Record<string, unknown> | null>();
  for (const c of configs) {
    overrideByKey.set(c.group_type.trim().toLowerCase(), c.readiness_rule);
  }

  const rows: MultiplyTypeRow[] = sortByLargestShortfall(coverage).map(
    (row) => ({
      ...row,
      readinessRule:
        overrideByKey.get(row.groupType.trim().toLowerCase()) ?? null,
    })
  );

  return {
    ministryYear,
    rows,
    ruleFellBack: decodedRule.fellBack,
    error: batch.firstError,
  };
}

export async function loadMultiplyGridData(
  now: Date = new Date()
): Promise<MultiplyGridData> {
  return measureReadBundle("multiply_grid", async () => {
    const client = await createSupabaseServerClient();
    if (!client) {
      return {
        ...EMPTY_MULTIPLY_GRID_DATA,
        ministryYear: currentMinistryYear(now),
      };
    }
    return buildMultiplyGridData(supabaseMultiplyGridReads(client), now);
  });
}
