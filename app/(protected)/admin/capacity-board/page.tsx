import Link from "next/link";
import { PageBody, PageHeader } from "@/components/lg/PageHeader";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchCapacityBoardExtras,
  fetchLaunchPlanningInputsForAdmin,
} from "@/lib/supabase/read-models";
import { decodeMetricDefaults } from "@/lib/admin/metrics";
import {
  buildCapacityBoardModel,
  type CapacityBoardModel,
} from "@/lib/admin/capacity-board";
import { CapacityBoard } from "@/components/admin/capacity-board/capacity-board";
import { P, fontBody } from "@/lib/pastoral";

export const dynamic = "force-dynamic";

type PageData = {
  model: CapacityBoardModel;
  error: string | null;
};

async function loadData(): Promise<PageData> {
  const empty: CapacityBoardModel = {
    rows: [],
    suggestions: [],
    segments: [],
  };
  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      model: empty,
      error: "Database is not configured in this environment.",
    };
  }

  const [bundle, extras] = await Promise.all([
    fetchLaunchPlanningInputsForAdmin(client),
    fetchCapacityBoardExtras(client),
  ]);

  const metricDefaults = decodeMetricDefaults(bundle.metricDefaultsRow);
  const model = buildCapacityBoardModel({
    groups: bundle.groups,
    overrides: bundle.groupMetricSettings,
    memberships: bundle.memberships,
    metricDefaults,
    apprentices: extras.apprentices,
    coShepherdSinceByGroup: extras.coShepherdSinceByGroup,
    candidateFlagsByGroup: extras.candidateFlagsByGroup,
    candidateGroupIds: extras.candidateGroupIds,
    todayIso: new Date().toISOString().slice(0, 10),
  });

  const error =
    bundle.errors.groups ??
    bundle.errors.overrides ??
    bundle.errors.memberships ??
    bundle.errors.metricDefaults ??
    extras.error ??
    null;

  return { model, error };
}

export default async function AdminCapacityBoardPage() {
  await requireAdmin();
  const data = await loadData();

  return (
    <>
      <PageHeader
        eyebrow="Capacity & Multiplication"
        title="Capacity"
        italic="board"
        lede="Every active group at a glance — members against its target, capacity status in plain words, and a ready-to-multiply badge when a full group has an apprentice ready to lead the next one."
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
              The capacity board could not be loaded: {data.error}
            </p>
          ) : (
            <CapacityBoard model={data.model} />
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
              href="/admin/leader-pipeline"
              style={{ color: P.ink, textDecoration: "underline" }}
            >
              Leader pipeline
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
