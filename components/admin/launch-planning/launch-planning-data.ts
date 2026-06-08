import {
  fetchCapacityBoardExtras,
  fetchLaunchPlanningAssumptions,
  fetchLaunchPlanningInputsForAdmin,
  fetchLaunchPlanningScenariosForAdmin,
  fetchLeaderPipelineForAdmin,
  fetchMultiplicationCandidatesForAdmin,
  type ApprenticePickerRef,
  type LaunchPlanningInputsBundle,
} from "@/lib/supabase/read-models";
import {
  BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS,
  applyBaselineSilentDefaults,
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
import {
  AUDIENCE_CATEGORIES,
  groupTypeKey,
  type GroupTypeOption,
  type GroupTypeRef,
} from "@/lib/admin/audience";
import { fetchCategoriesForAudience } from "@/lib/supabase/group-categories-reads";
import { STAGE_LABEL } from "@/lib/admin/leader-pipeline";
import type { GroupAudienceCategory } from "@/types/enums";
import {
  BUILT_IN_METRIC_DEFAULTS,
  decodeMetricDefaults,
} from "@/lib/admin/metrics";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bindReads, type OmitClient } from "@/lib/supabase/reads-seam";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { ApprenticeOption } from "@/components/admin/multiplication/multiplication-planner";

// The reads this surface assembles, as one interface (ADR 0015). `loadX` binds
// the live client; a test binds an in-memory adapter. The two bundle reads
// (inputs, capacity extras) carry bespoke per-section error shapes the
// assembly's precedence depends on, so they stay raw rather than flattening
// through the readBatch combinator.
export type LaunchPlanningReads = {
  fetchLaunchPlanningAssumptions: OmitClient<
    typeof fetchLaunchPlanningAssumptions
  >;
  fetchLaunchPlanningInputsForAdmin: OmitClient<
    typeof fetchLaunchPlanningInputsForAdmin
  >;
  fetchLaunchPlanningScenariosForAdmin: OmitClient<
    typeof fetchLaunchPlanningScenariosForAdmin
  >;
  fetchLeaderPipelineForAdmin: OmitClient<typeof fetchLeaderPipelineForAdmin>;
  fetchMultiplicationCandidatesForAdmin: OmitClient<
    typeof fetchMultiplicationCandidatesForAdmin
  >;
  fetchCapacityBoardExtras: OmitClient<typeof fetchCapacityBoardExtras>;
  // Type-first planner: the active-cell category options per top type, for the
  // candidate form's group-type picker (same read the group create/edit form uses).
  fetchCategoriesForAudience: OmitClient<typeof fetchCategoriesForAudience>;
};

export function supabaseLaunchPlanningReads(
  client: AppSupabaseClient
): LaunchPlanningReads {
  return bindReads(client, {
    fetchLaunchPlanningAssumptions,
    fetchLaunchPlanningInputsForAdmin,
    fetchLaunchPlanningScenariosForAdmin,
    fetchLeaderPipelineForAdmin,
    fetchMultiplicationCandidatesForAdmin,
    fetchCapacityBoardExtras,
    fetchCategoriesForAudience,
  });
}

// ADR 0010 surface-budget consolidation: this single data set answers one job —
// "how many groups can we launch, and when" — and feeds both the frozen
// /admin/launch-planning route and the Planning area's launch tabs (#303). The
// loader lives here, shared by both, so the heavy parallel fetch is written once.
export type LaunchPlanningPageData = {
  assumptions: ReturnType<typeof decodeLaunchPlanningAssumptions>;
  assumptionsAvailable: boolean;
  assumptionsError: string | null;
  inputsBundle: LaunchPlanningInputsBundle;
  inputs: ReturnType<typeof buildLaunchPlanningInputs>;
  outputs: ReturnType<typeof computeLaunchPlan>;
  activeScenarios: LaunchPlanningScenario[];
  scenariosError: string | null;
  comparison: ReturnType<typeof buildScenarioComparison>;
  // L4 (#223): current_church_attendance is the single source of truth for both
  // the forecast and the "% of the church in a group" headline. The
  // church_attendance_snapshots time series is retained for history but is no
  // longer read by this surface.
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
  // Type-first: the group-type picker options, and the active groups per type
  // for the "willing to multiply" group picker.
  typeOptions: GroupTypeOption[];
  groupsByType: Record<string, GroupTypeRef[]>;
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

// GroupTypeOption / GroupTypeRef / groupTypeKey live in the pure @/lib/admin/
// audience leaf so the client planner can share them without bundling this
// server data module. Re-exported here as the shaping layer's public surface.
export type { GroupTypeOption, GroupTypeRef };

// Flatten the per-audience active-category reads into the flat type-picker list,
// in board order (men → women → mixed), then by the read's alphabetical labels.
export function buildGroupTypeOptions(
  byAudience: Record<GroupAudienceCategory, { id: string; label: string }[]>
): GroupTypeOption[] {
  const out: GroupTypeOption[] = [];
  for (const audience of AUDIENCE_CATEGORIES) {
    for (const c of byAudience[audience] ?? []) {
      out.push({
        audienceCategory: audience,
        categoryId: c.id,
        label: c.label,
      });
    }
  }
  return out;
}

// Exported so the Multiply area's thin Plan-tab loader
// (components/admin/multiply/multiply-plan-data.ts) can shape the same planner
// props without pulling in the heavy launch-planning forecast bundle.
export type MultiplicationView = {
  segments: SegmentGroup[];
  typeOptions: GroupTypeOption[];
  // Active groups of each type (key = groupTypeKey), excluding groups already
  // attached to a concrete candidate. Feeds the "willing to multiply" picker.
  groupsByType: Record<string, GroupTypeRef[]>;
  apprenticesByGroup: Record<string, ApprenticeOption[]>;
};

type CandidatesData = NonNullable<
  Awaited<ReturnType<typeof fetchMultiplicationCandidatesForAdmin>>["data"]
>;

// Shape the multiplication-candidate, group, and pipeline reads into the
// planner's props. Only called once its three source reads have succeeded.
// Shared by this loader and the Multiply Plan-tab loader. Both `allGroups` and
// `pipeline` are typed to only the fields this builder reads (id/name/lifecycle;
// apprentice id/group/name/stage), so callers may pass either the full rows
// (launch planning) or the lean fetchGroupRefs / fetchApprenticePickerRefs
// projections — the latter avoid pulling privacy-sensitive columns (group
// admin_notes, apprentice notes) into the always-on Plan read path.
export function buildMultiplicationView(
  candidates: CandidatesData,
  allGroups: readonly {
    id: string;
    name: string;
    lifecycle_status: string;
    audience_category: GroupAudienceCategory | null;
    category_id: string | null;
  }[],
  pipeline: readonly { apprentice: ApprenticePickerRef }[],
  typeOptions: GroupTypeOption[],
  todayIso: string
): MultiplicationView {
  const segments = buildPlannerSegments(candidates, todayIso);
  // A group already attached to a concrete candidate can't be picked again
  // (one active candidate per group). Type-only candidates hold no group, so
  // they remove nothing here.
  const usedGroupIds = new Set(
    candidates
      .map((e) => e.candidate.group_id)
      .filter((id): id is string => id != null)
  );
  const groupsByType: Record<string, GroupTypeRef[]> = {};
  for (const g of allGroups) {
    if (g.lifecycle_status !== "active") continue;
    if (g.audience_category == null || g.category_id == null) continue;
    if (usedGroupIds.has(g.id)) continue;
    const key = groupTypeKey(g.audience_category, g.category_id);
    (groupsByType[key] ??= []).push({ id: g.id, name: g.name });
  }
  for (const key of Object.keys(groupsByType)) {
    groupsByType[key].sort((a, b) => a.name.localeCompare(b.name));
  }
  const apprenticesByGroup: Record<string, ApprenticeOption[]> = {};
  for (const e of pipeline) {
    const list = (apprenticesByGroup[e.apprentice.group_id] ??= []);
    list.push({
      id: e.apprentice.id,
      label: `${e.apprentice.display_name} · ${STAGE_LABEL[e.apprentice.readiness_stage]}`,
    });
  }
  return { segments, typeOptions, groupsByType, apprenticesByGroup };
}

function emptyData(): LaunchPlanningPageData {
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
  // Same baseline normalization as loadData, for a consistent forecast when the
  // DB isn't configured (#224).
  const assumptions = applyBaselineSilentDefaults(
    BUILT_IN_LAUNCH_PLANNING_ASSUMPTIONS,
    BUILT_IN_METRIC_DEFAULTS
  );
  return {
    assumptions,
    assumptionsAvailable: false,
    assumptionsError: dbError,
    inputsBundle,
    inputs,
    outputs: computeLaunchPlan(assumptions, inputs),
    activeScenarios: [],
    scenariosError: dbError,
    comparison: [],
    participationPct: null,
    staffingForecast: buildStaffingForecast(assumptions, []),
    staffingSourceLabel: "baseline",
    pipelineError: dbError,
    capacityModel: EMPTY_CAPACITY_MODEL,
    capacityError: dbError,
    segments: [],
    typeOptions: [],
    groupsByType: {},
    apprenticesByGroup: {},
    multiplicationError: dbError,
    todayIso: new Date().toISOString().slice(0, 10),
  };
}

// Pure assembly: a function of the reads seam. Every degrade path (the
// per-section capacity gate, the pipeline-blocks-multiplication gate, the
// baseline normalization) is reachable from a test through an in-memory
// `reads` adapter, with no live client.
export async function buildLaunchPlanningData(
  reads: LaunchPlanningReads
): Promise<LaunchPlanningPageData> {
  // Run the independent fetches in parallel so TTFB tracks the slowest rather
  // than their sum. The three former surfaces shared inputs, the capacity
  // extras, and the leader pipeline, so each is fetched once here.
  //
  // The full groups list is NOT fetched separately: fetchLaunchPlanningInputs
  // ForAdmin already reads `groups` (as inputsBundle.groups), so a standalone
  // fetchAllGroups here would issue a second, identical `select * from groups`
  // round-trip on every render of this (the heaviest) surface. The
  // multiplication view reuses inputsBundle.groups instead.
  const [
    assumptionsRes,
    inputsBundle,
    scenariosRes,
    pipelineRes,
    candidatesRes,
    boardExtras,
    menCatsRes,
    womenCatsRes,
    mixedCatsRes,
  ] = await Promise.all([
    reads.fetchLaunchPlanningAssumptions(),
    reads.fetchLaunchPlanningInputsForAdmin(),
    reads.fetchLaunchPlanningScenariosForAdmin(),
    reads.fetchLeaderPipelineForAdmin(),
    reads.fetchMultiplicationCandidatesForAdmin(),
    reads.fetchCapacityBoardExtras(),
    reads.fetchCategoriesForAudience("men"),
    reads.fetchCategoriesForAudience("women"),
    reads.fetchCategoriesForAudience("mixed"),
  ]);

  const metricDefaults = decodeMetricDefaults(inputsBundle.metricDefaultsRow);
  const todayIso = new Date().toISOString().slice(0, 10);

  // --- Launch planning ---
  // L5 (#224): normalize the baseline forecast's silently-defaulted inputs
  // (growth → 0, average group size → ministry default capacity) so a stale
  // seeded row can't keep forecasting from values the form no longer exposes.
  // No data is written; scenarios keep their own decoded assumptions.
  const assumptions = applyBaselineSilentDefaults(
    decodeLaunchPlanningAssumptions(
      assumptionsRes.data ?? null,
      metricDefaults
    ),
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
        categoryLabelByGroup: new Map(
          Object.entries(boardExtras.categoryLabelByGroup)
        ),
        todayIso,
      });

  // --- Multiplication planner. The pipeline drives apprenticesByGroup; a
  // pipeline failure must block the planner (as the old /admin/multiplication
  // page did) so the apprentice picker can't render with no options and silently
  // clear leader_pipeline_id on save. boardExtras is NOT in this list — it only
  // feeds the capacity board's suggestions, which render in the capacity section. ---
  const multiplicationError =
    candidatesRes.error?.message ??
    inputsBundle.errors.groups ??
    pipelineRes.error?.message ??
    null;
  // The type picker degrades to empty rather than blocking the planner on a
  // category read failure — the edit form preserves a candidate's existing type.
  const typeOptions = buildGroupTypeOptions({
    men: (menCatsRes.data ?? []).map((c) => ({ id: c.id, label: c.label })),
    women: (womenCatsRes.data ?? []).map((c) => ({ id: c.id, label: c.label })),
    mixed: (mixedCatsRes.data ?? []).map((c) => ({ id: c.id, label: c.label })),
  });
  const { segments, groupsByType, apprenticesByGroup } = multiplicationError
    ? { segments: [], groupsByType: {}, apprenticesByGroup: {} }
    : buildMultiplicationView(
        candidatesRes.data ?? [],
        inputsBundle.groups,
        pipelineRes.data ?? [],
        typeOptions,
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
    // L4 (#223): the denominator is current_church_attendance (the editable
    // assumption), not the latest snapshot. For a church with existing
    // snapshots, the one-time backfill set current_church_attendance to the
    // latest snapshot count, so this percentage is unchanged at the switch.
    participationPct: participationPct(
      inputs.current_participants,
      assumptions.current_church_attendance
    ),
    staffingForecast,
    staffingSourceLabel,
    pipelineError: pipelineRes.error?.message ?? null,
    capacityModel,
    capacityError,
    segments,
    typeOptions,
    groupsByType,
    apprenticesByGroup,
    multiplicationError,
    todayIso,
  };
}

export async function loadLaunchPlanningData(): Promise<LaunchPlanningPageData> {
  const client = await createSupabaseServerClient();
  if (!client) return emptyData();
  return buildLaunchPlanningData(supabaseLaunchPlanningReads(client));
}
