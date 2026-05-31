import Link from "next/link";
import { PageBody, PageHeader } from "@/components/lg/PageHeader";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchAllGroups,
  fetchLeaderPipelineForAdmin,
  fetchMultiplicationCandidatesForAdmin,
} from "@/lib/supabase/read-models";
import {
  buildPlannerSegments,
  type SegmentGroup,
} from "@/lib/admin/multiplication";
import { STAGE_LABEL } from "@/lib/admin/leader-pipeline";
import {
  MultiplicationPlanner,
  type ApprenticeOption,
} from "@/components/admin/multiplication/multiplication-planner";
import { P, fontBody } from "@/lib/pastoral";

export const dynamic = "force-dynamic";

type PageData = {
  segments: SegmentGroup[];
  availableGroups: { id: string; name: string }[];
  // Apprentices keyed by group id, so a candidate's link picker only offers
  // same-group apprentices (the RPC + trigger reject cross-group links).
  apprenticesByGroup: Record<string, ApprenticeOption[]>;
  error: string | null;
};

async function loadData(): Promise<PageData> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      segments: [],
      availableGroups: [],
      apprenticesByGroup: {},
      error: "Database is not configured in this environment.",
    };
  }

  const [candidatesRes, allGroupsRes, pipelineRes] = await Promise.all([
    fetchMultiplicationCandidatesForAdmin(client),
    fetchAllGroups(client),
    fetchLeaderPipelineForAdmin(client),
  ]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const segments = buildPlannerSegments(candidatesRes.data ?? [], todayIso);

  const candidateGroupIds = new Set(
    (candidatesRes.data ?? []).map((e) => e.candidate.group_id)
  );
  const availableGroups = (allGroupsRes.data ?? [])
    .filter(
      (g) => g.lifecycle_status === "active" && !candidateGroupIds.has(g.id)
    )
    .map((g) => ({ id: g.id, name: g.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const apprenticesByGroup: Record<string, ApprenticeOption[]> = {};
  for (const e of pipelineRes.data ?? []) {
    const list = (apprenticesByGroup[e.apprentice.group_id] ??= []);
    list.push({
      id: e.apprentice.id,
      label: `${e.apprentice.display_name} · ${STAGE_LABEL[e.apprentice.readiness_stage]}`,
    });
  }

  return {
    segments,
    availableGroups,
    apprenticesByGroup,
    error:
      candidatesRes.error?.message ??
      allGroupsRes.error?.message ??
      pipelineRes.error?.message ??
      null,
  };
}

export default async function AdminMultiplicationPage() {
  await requireAdmin();
  const data = await loadData();

  return (
    <>
      <PageHeader
        eyebrow="Multiplication"
        title="Multiplication"
        italic="planner"
        lede="Which Life Groups are ready to multiply — grouped by audience and life stage, split by target year, scored against Julian's readiness criteria."
      />
      <PageBody>
        <div style={{ display: "grid", gap: 24 }}>
          {data.error ? (
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
              The multiplication pipeline could not be loaded: {data.error}
            </p>
          ) : (
            <MultiplicationPlanner
              segments={data.segments}
              availableGroups={data.availableGroups}
              apprenticesByGroup={data.apprenticesByGroup}
            />
          )}

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
              href="/admin/launch-planning"
              style={{ color: P.ink, textDecoration: "underline" }}
            >
              Launch planning
            </Link>
            <Link
              href="/admin/groups"
              style={{ color: P.ink, textDecoration: "underline" }}
            >
              Groups
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
