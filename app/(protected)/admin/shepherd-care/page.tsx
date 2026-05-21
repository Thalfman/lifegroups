import { PageBody, PageHeader } from "@/components/lg/PageHeader";
import { ShepherdCareDirectoryTable } from "@/components/admin/shepherd-care/directory-table";
import {
  ShepherdCareCoverageFilter,
  ShepherdCareFilterChips,
  type CoverageFilter,
  type DirectoryFilter,
} from "@/components/admin/shepherd-care/filter-chips";
import { OverShepherdsSummaryCard } from "@/components/admin/shepherd-care/over-shepherds-summary-card";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchActiveShepherdCoverageAssignmentsForAdmin,
  fetchOverShepherdsForAdmin,
  fetchShepherdCareDirectoryForAdmin,
  type ActiveShepherdCoverageAssignmentSummary,
  type OverShepherdListRow,
  type ShepherdCareDirectoryEntry,
} from "@/lib/supabase/read-models";
import { isUuid } from "@/lib/shared/uuid";
import { P, fontBody } from "@/lib/pastoral";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function resolveFilter(value: string | string[] | undefined): DirectoryFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "needs_attention" ? "needs_attention" : "all";
}

function resolveCoverage(
  value: string | string[] | undefined,
): CoverageFilter | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (raw === "unassigned") return "unassigned";
  if (isUuid(raw)) return raw.toLowerCase();
  return undefined;
}

type LoadedData = {
  entries: ShepherdCareDirectoryEntry[];
  overShepherds: OverShepherdListRow[];
  assignments: ActiveShepherdCoverageAssignmentSummary[];
  error: string | null;
};

async function loadData(): Promise<LoadedData> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      entries: [],
      overShepherds: [],
      assignments: [],
      error: "Database is not configured in this environment.",
    };
  }
  // The three reads are independent; run them in parallel to keep TTFB
  // close to the cost of the slowest query.
  const [directory, overShepherdsRes, assignmentsRes] = await Promise.all([
    fetchShepherdCareDirectoryForAdmin(client),
    fetchOverShepherdsForAdmin(client, { includeArchived: true }),
    fetchActiveShepherdCoverageAssignmentsForAdmin(client),
  ]);
  if (directory.error) {
    return {
      entries: [],
      overShepherds: [],
      assignments: [],
      error: directory.error.message,
    };
  }
  return {
    entries: directory.data,
    overShepherds: overShepherdsRes.data ?? [],
    assignments: assignmentsRes.data ?? [],
    error:
      overShepherdsRes.error?.message ?? assignmentsRes.error?.message ?? null,
  };
}

export default async function AdminShepherdCarePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();

  const sp = await searchParams;
  const filter = resolveFilter(sp.filter);
  const coverage = resolveCoverage(sp.coverage);

  const { entries, overShepherds, assignments, error } = await loadData();

  const coverageByShepherdId = new Map<
    string,
    ActiveShepherdCoverageAssignmentSummary
  >();
  for (const a of assignments) {
    coverageByShepherdId.set(a.shepherd_profile_id, a);
  }
  const shepherdCountByOverShepherdId = new Map<string, number>();
  for (const a of assignments) {
    shepherdCountByOverShepherdId.set(
      a.over_shepherd_id,
      (shepherdCountByOverShepherdId.get(a.over_shepherd_id) ?? 0) + 1,
    );
  }
  const unassignedCount = entries.reduce(
    (sum, e) => (coverageByShepherdId.has(e.profile.id) ? sum : sum + 1),
    0,
  );

  const needsAttentionCount = entries.filter((e) => e.needs_attention).length;
  const filteredByAttention =
    filter === "needs_attention"
      ? entries.filter((e) => e.needs_attention)
      : entries;
  const visible = filteredByAttention.filter((e) => {
    if (coverage === undefined) return true;
    const c = coverageByShepherdId.get(e.profile.id) ?? null;
    if (coverage === "unassigned") return c === null;
    return c?.over_shepherd_id === coverage;
  });

  return (
    <>
      <PageHeader
        eyebrow="Shepherd care"
        title="Shepherd"
        italic="care"
        lede="Track leader and co-leader care: recent connections, next touchpoints, and current care status. Admin-only — care notes never leave this surface."
      />
      <PageBody>
        <div style={{ display: "grid", gap: 18 }}>
          <OverShepherdsSummaryCard
            overShepherds={overShepherds}
            shepherdCountById={shepherdCountByOverShepherdId}
            unassignedCount={unassignedCount}
          />
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
              justifyContent: "space-between",
            }}
          >
            <ShepherdCareFilterChips
              current={filter}
              totalCount={entries.length}
              needsAttentionCount={needsAttentionCount}
              coverage={coverage}
            />
            <ShepherdCareCoverageFilter
              filter={filter}
              coverage={coverage}
              overShepherds={overShepherds}
              unassignedCount={unassignedCount}
            />
          </div>
          {error ? (
            <p
              style={{
                fontFamily: fontBody,
                color: "#923220",
                background: P.terraSoft,
                padding: "10px 14px",
                borderRadius: 8,
                margin: 0,
              }}
            >
              {error}
            </p>
          ) : null}
          <ShepherdCareDirectoryTable
            entries={visible}
            coverageByShepherdId={coverageByShepherdId}
          />
        </div>
      </PageBody>
    </>
  );
}
