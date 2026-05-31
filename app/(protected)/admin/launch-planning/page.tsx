import Link from "next/link";
import { PageBody, PageHeader } from "@/components/lg/PageHeader";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchChurchAttendanceSnapshots,
  fetchLaunchPlanningAssumptions,
  fetchLaunchPlanningInputsForAdmin,
  fetchLaunchPlanningScenariosForAdmin,
  fetchLeaderPipelineForAdmin,
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
import { P, fontBody, fontSans } from "@/lib/pastoral";

export const dynamic = "force-dynamic";

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
};

function emptyData(): PageData {
  const inputsBundle: LaunchPlanningInputsBundle = {
    groups: [],
    groupMetricSettings: [],
    memberships: [],
    metricDefaultsRow: null,
    errors: {
      groups: "Database is not configured in this environment.",
      overrides: "Database is not configured in this environment.",
      memberships: "Database is not configured in this environment.",
      metricDefaults: "Database is not configured in this environment.",
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
    assumptionsError: "Database is not configured in this environment.",
    inputsBundle,
    inputs,
    outputs: computeLaunchPlan(BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS, inputs),
    activeScenarios: [],
    scenariosError: "Database is not configured in this environment.",
    comparison: [],
    churchAttendanceLatest: null,
    participationPct: null,
    staffingForecast: buildStaffingForecast(
      BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS,
      []
    ),
    staffingSourceLabel: "baseline",
  };
}

async function loadData(): Promise<PageData> {
  const client = await createSupabaseServerClient();
  if (!client) return emptyData();

  // Run the independent fetches in parallel so TTFB tracks the slowest
  // rather than their sum.
  const [assumptionsRes, inputsBundle, scenariosRes, churchRes, pipelineRes] =
    await Promise.all([
      fetchLaunchPlanningAssumptions(client),
      fetchLaunchPlanningInputsForAdmin(client),
      fetchLaunchPlanningScenariosForAdmin(client),
      fetchChurchAttendanceSnapshots(client, { limit: 1 }),
      fetchLeaderPipelineForAdmin(client),
    ]);

  const metricDefaults = decodeMetricDefaults(inputsBundle.metricDefaultsRow);
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
  };
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
        lede="Plan group capacity, expected growth, and when new Life Groups may need to launch."
      />
      <PageBody>
        <div style={{ display: "grid", gap: 24 }}>
          {data.assumptionsError ? (
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
              Saved assumptions could not be loaded. Showing built-in defaults:{" "}
              {data.assumptionsError}
            </p>
          ) : null}

          {!data.assumptionsAvailable && !data.assumptionsError ? (
            <p
              style={{
                margin: 0,
                fontFamily: fontBody,
                fontSize: 13,
                color: P.ink2,
                background: P.bgDeep,
                borderRadius: 8,
                padding: "10px 14px",
              }}
            >
              No saved assumptions yet. The form below shows the built-in
              defaults — save once to persist them.
            </p>
          ) : null}

          <LaunchPlanningSummaryCards
            inputs={data.inputs}
            outputs={data.outputs}
          />

          <StaffingSupplyCard
            forecast={data.staffingForecast}
            inputs={data.inputs}
            sourceLabel={data.staffingSourceLabel}
          />

          <ChurchAttendanceCard
            latest={data.churchAttendanceLatest}
            currentParticipants={data.inputs.current_participants}
            participationPct={data.participationPct}
            todayIso={new Date().toISOString().slice(0, 10)}
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
              style={{
                background: P.surface,
                border: `1px solid ${P.line}`,
                borderRadius: 14,
                padding: "22px 24px",
              }}
            >
              <header style={{ marginBottom: 16 }}>
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
                  Assumptions
                </span>
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
              Scenarios could not be loaded: {data.scenariosError}
            </p>
          ) : null}

          <ScenariosPanel
            scenarios={data.activeScenarios}
            baseline={data.assumptions}
            inputs={data.inputs}
            baselineOutputs={data.outputs}
            comparison={data.comparison}
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
              href="/admin/multiplication"
              style={{ color: P.ink, textDecoration: "underline" }}
            >
              Multiplication
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
