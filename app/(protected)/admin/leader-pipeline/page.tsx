import Link from "next/link";
import { PageBody, PageHeader } from "@/components/lg/PageHeader";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchAllGroups,
  fetchLeaderPipelineForAdmin,
} from "@/lib/supabase/read-models";
import {
  buildPipelineRollup,
  type ApprenticeView,
  type PipelineGroupRef,
  type PipelineRollup,
} from "@/lib/admin/leader-pipeline";
import { LeaderPipeline } from "@/components/admin/leader-pipeline/leader-pipeline";
import { P, fontBody } from "@/lib/pastoral";

export const dynamic = "force-dynamic";

type PageData = {
  rollup: PipelineRollup;
  availableGroups: { id: string; name: string }[];
  error: string | null;
};

async function loadData(): Promise<PageData> {
  const empty: PipelineRollup = {
    stages: [],
    groupsWithoutApprentice: [],
    totalApprentices: 0,
  };
  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      rollup: empty,
      availableGroups: [],
      error: "Database is not configured in this environment.",
    };
  }

  const [pipelineRes, allGroupsRes] = await Promise.all([
    fetchLeaderPipelineForAdmin(client),
    fetchAllGroups(client),
  ]);

  const activeGroups: PipelineGroupRef[] = (allGroupsRes.data ?? [])
    .filter((g) => g.lifecycle_status === "active")
    .map((g) => ({ id: g.id, name: g.name }));

  const apprentices: ApprenticeView[] = (pipelineRes.data ?? []).map((e) => ({
    id: e.apprentice.id,
    groupId: e.apprentice.group_id,
    groupName: e.groupName ?? "Unknown group",
    displayName: e.apprentice.display_name,
    memberId: e.apprentice.member_id,
    stage: e.apprentice.readiness_stage,
    expectedReadyOn: e.apprentice.expected_ready_on,
    notes: e.apprentice.notes,
  }));

  const rollup = buildPipelineRollup(apprentices, activeGroups);
  const availableGroups = [...activeGroups].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return {
    rollup,
    availableGroups,
    error: pipelineRes.error?.message ?? allGroupsRes.error?.message ?? null,
  };
}

export default async function AdminLeaderPipelinePage() {
  await requireAdmin();
  const data = await loadData();

  return (
    <>
      <PageHeader
        eyebrow="Capacity & Multiplication"
        title="Leader"
        italic="pipeline"
        lede="Every apprentice and where they stand — Identified, In training, Ready to lead, Launched. The supply side of multiplication: who's ready to lead the next group, and which groups have no apprentice yet."
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
              The leader pipeline could not be loaded: {data.error}
            </p>
          ) : (
            <LeaderPipeline
              rollup={data.rollup}
              availableGroups={data.availableGroups}
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
              href="/admin/capacity-board"
              style={{ color: P.ink, textDecoration: "underline" }}
            >
              Capacity board
            </Link>
            <Link
              href="/admin/multiplication"
              style={{ color: P.ink, textDecoration: "underline" }}
            >
              Multiplication
            </Link>
            <Link
              href="/admin/launch-planning"
              style={{ color: P.ink, textDecoration: "underline" }}
            >
              Launch planning
            </Link>
          </nav>
        </div>
      </PageBody>
    </>
  );
}
