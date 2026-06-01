import type { ReactNode } from "react";
import Link from "next/link";
import { PageBody, PageHeader } from "@/components/lg/PageHeader";
import { ErrorBanner } from "@/components/lg/ErrorBanner";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchAllGroups,
  fetchCapacityBoardExtras,
  fetchChurchAttendanceSnapshots,
  fetchLaunchPlanningAssumptions,
  fetchLaunchPlanningInputsForAdmin,
  fetchLaunchPlanningScenariosForAdmin,
  fetchLeaderPipelineForAdmin,
  fetchMultiplicationCandidatesForAdmin,
  type LaunchPlanningInputsBundle,
} from "@/lib/supabase/read-models";
import {
  BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS,
  buildLaunchPlanningInputs,
  buildScenarioComparison,
  buildStaffingForecast,
  computeLaunchPlan,
  decodeLaunchPlanningAssumptions,
  decodeLaunchPlanningScenario,
  filterActiveScenarios,
  findCurrentScenario,
  participationPct,
  type LaunchPlanningScenario,
  type StaffingApprentice,
  type StaffingForecast,
} from "@/lib/admin/launch-planning";
import {
  buildCapacityBoardModel,
  type CapacityBoardModel,
} from "@/lib/admin/capacity-board";
import {
  buildPlannerSegments,
  type SegmentGroup,
} from "@/lib/admin/multiplication";
import { STAGE_LABEL } from "@/lib/admin/leader-pipeline";
import { StaffingSupplyCard } from "@/components/admin/launch-planning/staffing-supply-card";
import {
  BUILT_IN_METRIC_DEFAULTS,
  decodeMetricDefaults,
} from "@/lib/admin/metrics";
import { LaunchPlanningAssumptionsForm } from "@/components/admin/launch-planning/assumptions-form";
import { LaunchPlanningSummaryCards } from "@/components/admin/launch-planning/summary-cards";
import { LaunchPlanningResultsPanel } from "@/components/admin/launch-planning/results-panel";
import { LaunchPlanningSetupWarnings } from "@/components/admin/launch-planning/setup-warnings";
import { ScenariosPanel } from "@/components/admin/launch-planning/scenarios-panel";
import { ChurchAttendanceCard } from "@/components/admin/launch-planning/church-attendance-card";
import { CapacityBoard } from "@/components/admin/capacity-board/capacity-board";
import {
  MultiplicationPlanner,
  type ApprenticeOption,
} from "@/components/admin/multiplication/multiplication-planner";
import { P, fontBody, fontSans } from "@/lib/pastoral";

export const dynamic = "force-dynamic";

// ADR 0010 surface-budget consolidation: this single surface answers one job —
// "how many groups can we launch, and when" — and absorbs the former Capacity
// board and Multiplication surfaces (both old routes now redirect here).
type PageData = {
  assumptions: ReturnType<typeof decodeLaunchPlanningAssumptions>;
  assumptionsAvailable: boolean;
  assumptionsError: string | null;
  inputsBundle: LaunchPlanningInputsBundle;
  inputs: ReturnType<typeof buildLaunchPlanningInputs>;
  outputs: ReturnType<typeof computeLaunchPlan>;
  activeScenarios: LaunchPlanningScenario[];
  scenariosError: string | null;
  comparison: ReturnType<typeof buildScenarioComparison>;
  churchAttendanceLatest: {
    snapshotDate: string;
    attendanceCount: number;
  } | null;
  participationPct: number | null;
  staffingForecast: StaffingForecast;
  staffingSourceLabel: string;
  // #186: the pipeline is the source of truth for staffing supply. A read
  // failure must not silently read as "0 Ready" / inflated shortfall.
  pipelineError: string | null;
  // Capacity board (merged-in surface).
  capacityModel: CapacityBoardModel;
  capacityError: string | null;
  // Multiplication planner (merged-in surface).
  segments: SegmentGroup[];
  availableGroups: { id: string; name: string }[];
  // Apprentices keyed by group id, so a candidate's link picker only offers
  // same-group apprentices (the RPC + trigger reject cross-group links).
  apprenticesByGroup: Record<string, ApprenticeOption[]>;
  multiplicationError: string | null;
  // Computed once in loadData; reused by the render (e.g. ChurchAttendanceCard).
  todayIso: string;
};

const EMPTY_CAPACITY_MODEL: CapacityBoardModel = {
  rows: [],
  suggestions: [],
  segments: [],
};

type MultiplicationView = {
  segments: SegmentGroup[];
  availableGroups: { id: string; name: string }[];
  apprenticesByGroup: Record<string, ApprenticeOption[]>;
};

type CandidatesData = NonNullable<
  Awaited<ReturnType<typeof fetchMultiplicationCandidatesForAdmin>>["data"]
>;
type AllGroupsData = NonNullable<
  Awaited<ReturnType<typeof fetchAllGroups>>["data"]
>;
type PipelineData = NonNullable<
  Awaited<ReturnType<typeof fetchLeaderPipelineForAdmin>>["data"]
>;

// Shape the multiplication-candidate, group, and pipeline reads into the
// planner's props. Only called once its three source reads have succeeded.
function buildMultiplicationView(
  candidates: CandidatesData,
  allGroups: AllGroupsData,
  pipeline: PipelineData,
  todayIso: string
): MultiplicationView {
  const segments = buildPlannerSegments(candidates, todayIso);
  const candidateGroupIds = new Set(
    candidates.map((e) => e.candidate.group_id)
  );
  const availableGroups = allGroups
    .filter(
      (g) => g.lifecycle_status === "active" && !candidateGroupIds.has(g.id)
    )
    .map((g) => ({ id: g.id, name: g.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const apprenticesByGroup: Record<string, ApprenticeOption[]> = {};
  for (const e of pipeline) {
    const list = (apprenticesByGroup[e.apprentice.group_id] ??= []);
    list.push({
      id: e.apprentice.id,
      label: `${e.apprentice.display_name} · ${STAGE_LABEL[e.apprentice.readiness_stage]}`,
    });
  }
  return { segments, availableGroups, apprenticesByGroup };
}

function emptyData(): PageData {
  const dbError = "Database is not configured in this environment.";
  const inputsBundle: LaunchPlanningInputsBundle = {
    groups: [],
    groupMetricSettings: [],
    memberships: [],
    metricDefaultsRow: null,
    errors: {
      groups: dbError,
      overrides: dbError,
      memberships: dbError,
      metricDefaults: dbError,
    },
  };
  const inputs = buildLaunchPlanningInputs({
    groups: [],
    overrides: [],
    memberships: [],
    metricDefaults: BUILT_IN_METRIC_DEFAULTS,
  });
  return {
    assumptions: BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS,
    assumptionsAvailable: false,
    assumptionsError: dbError,
    inputsBundle,
    inputs,
    outputs: computeLaunchPlan(BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS, inputs),
    activeScenarios: [],
    scenariosError: dbError,
    comparison: [],
    churchAttendanceLatest: null,
    participationPct: null,
    staffingForecast: buildStaffingForecast(
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS,
      []
    ),
    staffingSourceLabel: "baseline",
    pipelineError: dbError,
    capacityModel: EMPTY_CAPACITY_MODEL,
    capacityError: dbError,
    segments: [],
    availableGroups: [],
    apprenticesByGroup: {},
    multiplicationError: dbError,
    todayIso: new Date().toISOString().slice(0, 10),
  };
}

async function loadData(): Promise<PageData> {
  const client = await createSupabaseServerClient();
  if (!client) return emptyData();

  // Run the independent fetches in parallel so TTFB tracks the slowest rather
  // than their sum. The three former surfaces shared inputs, the capacity
  // extras, and the leader pipeline, so each is fetched once here.
  const [
    assumptionsRes,
    inputsBundle,
    scenariosRes,
    churchRes,
    pipelineRes,
    candidatesRes,
    allGroupsRes,
    boardExtras,
  ] = await Promise.all([
    fetchLaunchPlanningAssumptions(client),
    fetchLaunchPlanningInputsForAdmin(client),
    fetchLaunchPlanningScenariosForAdmin(client),
    fetchChurchAttendanceSnapshots(client, { limit: 1 }),
    fetchLeaderPipelineForAdmin(client),
    fetchMultiplicationCandidatesForAdmin(client),
    fetchAllGroups(client),
    fetchCapacityBoardExtras(client),
  ]);

  const metricDefaults = decodeMetricDefaults(inputsBundle.metricDefaultsRow);
  const todayIso = new Date().toISOString().slice(0, 10);

  // --- Launch planning ---
  const assumptions = decodeLaunchPlanningAssumptions(
    assumptionsRes.data ?? null,
    metricDefaults
  );
  const inputs = buildLaunchPlanningInputs({
    groups: inputsBundle.groups,
    overrides: inputsBundle.groupMetricSettings,
    memberships: inputsBundle.memberships,
    metricDefaults,
  });
  const outputs = computeLaunchPlan(assumptions, inputs);

  const rawScenarios = scenariosRes.data ?? [];
  const activeScenarios = filterActiveScenarios(rawScenarios).map((row) =>
    decodeLaunchPlanningScenario(row, metricDefaults)
  );
  const comparison = buildScenarioComparison(activeScenarios, inputs);

  // #186: staffing supply comes from the live pipeline. Prefer the current
  // scenario's launch plan; fall back to the baseline assumptions.
  const apprentices: StaffingApprentice[] = (pipelineRes.data ?? []).map(
    (e) => ({
      stage: e.apprentice.readiness_stage,
      expectedReadyOn: e.apprentice.expected_ready_on,
    })
  );
  const currentScenario = findCurrentScenario(activeScenarios);
  const staffingAssumptions = currentScenario?.assumptions ?? assumptions;
  const staffingForecast = buildStaffingForecast(
    staffingAssumptions,
    apprentices
  );
  const staffingSourceLabel = currentScenario
    ? `current scenario: ${currentScenario.name}`
    : "baseline assumptions";

  const latestSnapshot = churchRes.data?.[0] ?? null;
  const churchAttendanceLatest = latestSnapshot
    ? {
        snapshotDate: latestSnapshot.snapshot_date,
        attendanceCount: latestSnapshot.attendance_count,
      }
    : null;

  // --- Capacity board. Its model (rows + the "Suggested to multiply" panel) is
  // derived purely from capacity inputs + board extras, NOT the leader pipeline.
  // Skip the build when its inputs failed — the render shows a banner instead,
  // so building from empty data would be wasted work. ---
  const capacityError =
    inputsBundle.errors.groups ??
    inputsBundle.errors.overrides ??
    inputsBundle.errors.memberships ??
    inputsBundle.errors.metricDefaults ??
    boardExtras.error ??
    null;
  const capacityModel = capacityError
    ? EMPTY_CAPACITY_MODEL
    : buildCapacityBoardModel({
        groups: inputsBundle.groups,
        overrides: inputsBundle.groupMetricSettings,
        memberships: inputsBundle.memberships,
        metricDefaults,
        apprentices: boardExtras.apprentices,
        coShepherdSinceByGroup: boardExtras.coShepherdSinceByGroup,
        candidateFlagsByGroup: boardExtras.candidateFlagsByGroup,
        candidateGroupIds: boardExtras.candidateGroupIds,
        todayIso,
      });

  // --- Multiplication planner. The pipeline drives apprenticesByGroup; a
  // pipeline failure must block the planner (as the old /admin/multiplication
  // page did) so the apprentice picker can't render with no options and silently
  // clear leader_pipeline_id on save. boardExtras is NOT in this list — it only
  // feeds the capacity board's suggestions, which render in the capacity section. ---
  const multiplicationError =
    candidatesRes.error?.message ??
    allGroupsRes.error?.message ??
    pipelineRes.error?.message ??
    null;
  const { segments, availableGroups, apprenticesByGroup } = multiplicationError
    ? { segments: [], availableGroups: [], apprenticesByGroup: {} }
    : buildMultiplicationView(
        candidatesRes.data ?? [],
        allGroupsRes.data ?? [],
        pipelineRes.data ?? [],
        todayIso
      );

  return {
    assumptions,
    assumptionsAvailable: assumptionsRes.data != null,
    assumptionsError: assumptionsRes.error?.message ?? null,
    inputsBundle,
    inputs,
    outputs,
    activeScenarios,
    scenariosError: scenariosRes.error?.message ?? null,
    comparison,
    churchAttendanceLatest,
    participationPct: participationPct(
      inputs.current_participants,
      churchAttendanceLatest?.attendanceCount ?? null
    ),
    staffingForecast,
    staffingSourceLabel,
    pipelineError: pipelineRes.error?.message ?? null,
    capacityModel,
    capacityError,
    segments,
    availableGroups,
    apprenticesByGroup,
    multiplicationError,
    todayIso,
  };
}

function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontFamily: fontSans,
        fontSize: 10,
        letterSpacing: 1.5,
        textTransform: "uppercase",
        color: P.ink3,
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}

export default async function AdminLaunchPlanningPage() {
  await requireAdmin();
  const data = await loadData();

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
          {data.assumptionsError ? (
            <ErrorBanner>
              Saved assumptions could not be loaded. Showing built-in defaults:{" "}
              {data.assumptionsError}
            </ErrorBanner>
          ) : null}

          {!data.assumptionsError ? (
            <div
              style={{
                margin: 0,
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                fontFamily: fontBody,
                fontSize: 13,
                color: P.ink2,
                background: P.bgDeep,
                borderRadius: 8,
                padding: "10px 14px",
              }}
            >
              <span>
                {data.assumptionsAvailable
                  ? "This forecast uses your saved assumptions."
                  : "This forecast is live now on Fox Valley's built-in starting assumptions — tune it to your numbers any time."}
              </span>
              <a
                href="#lp-assumptions"
                style={{
                  color: P.ink,
                  fontWeight: 600,
                  textDecoration: "underline",
                  whiteSpace: "nowrap",
                }}
              >
                Adjust forecast ↓
              </a>
            </div>
          ) : null}

          <LaunchPlanningSummaryCards
            inputs={data.inputs}
            outputs={data.outputs}
          />

          {data.pipelineError ? (
            <ErrorBanner>
              The leader pipeline could not be loaded, so the staffing supply
              below may understate who is ready. {data.pipelineError}
            </ErrorBanner>
          ) : (
            <StaffingSupplyCard
              forecast={data.staffingForecast}
              inputs={data.inputs}
              sourceLabel={data.staffingSourceLabel}
            />
          )}

          <ChurchAttendanceCard
            latest={data.churchAttendanceLatest}
            currentParticipants={data.inputs.current_participants}
            participationPct={data.participationPct}
            todayIso={data.todayIso}
          />

          <LaunchPlanningSetupWarnings
            inputs={data.inputs}
            errors={data.inputsBundle.errors}
          />

          <div
            className="lg-m-grid-stack"
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              gap: 20,
              alignItems: "start",
            }}
          >
            <section
              id="lp-assumptions"
              style={{
                background: P.surface,
                border: `1px solid ${P.line}`,
                borderRadius: 14,
                padding: "22px 24px",
                scrollMarginTop: 16,
              }}
            >
              <header style={{ marginBottom: 16 }}>
                <SectionEyebrow>Assumptions</SectionEyebrow>
                <h2
                  style={{
                    margin: "4px 0 0",
                    fontFamily: fontBody,
                    fontSize: 18,
                    color: P.ink,
                    fontWeight: 600,
                  }}
                >
                  Forecast inputs
                </h2>
              </header>
              <LaunchPlanningAssumptionsForm assumptions={data.assumptions} />
            </section>

            <LaunchPlanningResultsPanel
              assumptions={data.assumptions}
              inputs={data.inputs}
              outputs={data.outputs}
            />
          </div>

          {data.scenariosError ? (
            <ErrorBanner>
              Scenarios could not be loaded: {data.scenariosError}
            </ErrorBanner>
          ) : null}

          <ScenariosPanel
            scenarios={data.activeScenarios}
            baseline={data.assumptions}
            inputs={data.inputs}
            baselineOutputs={data.outputs}
            comparison={data.comparison}
          />

          {/* Capacity board (merged-in). It owns the single "Suggested to
              multiply" panel — that panel is derived from capacity data, not the
              leader pipeline, so it stays visible even when the pipeline read
              (which only gates the multiplication planner below) fails. */}
          {data.capacityError ? (
            <ErrorBanner>
              The capacity board could not be loaded: {data.capacityError}
            </ErrorBanner>
          ) : (
            <CapacityBoard model={data.capacityModel} />
          )}

          {/* Multiplication planner (merged-in). Suggestions render in the
              capacity section above, so they are suppressed here. */}
          {data.multiplicationError ? (
            <ErrorBanner>
              The multiplication pipeline could not be loaded:{" "}
              {data.multiplicationError}
            </ErrorBanner>
          ) : (
            <MultiplicationPlanner
              segments={data.segments}
              availableGroups={data.availableGroups}
              apprenticesByGroup={data.apprenticesByGroup}
              suggestions={[]}
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
