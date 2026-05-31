"use server";

import {
  validateCreateLaunchPlanningScenarioPayload,
  validateScenarioIdPayload,
  validateUpdateLaunchPlanningScenarioPayload,
  type CreateLaunchPlanningScenarioPayload,
  type ScenarioIdPayload,
  type UpdateLaunchPlanningScenarioPayload,
} from "@/lib/admin/validation";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import {
  rpcAdminArchiveLaunchPlanningScenario,
  rpcAdminCreateLaunchPlanningScenario,
  rpcAdminSetCurrentLaunchPlanningScenario,
  rpcAdminUpdateLaunchPlanningScenario,
} from "@/lib/admin/rpc";

const REVALIDATE_PATH_LAUNCH_PLANNING = "/admin/launch-planning";
const REVALIDATE_PATH_ADMIN = "/admin";
const SCENARIO_REVALIDATE_PATHS = [
  REVALIDATE_PATH_LAUNCH_PLANNING,
  REVALIDATE_PATH_ADMIN,
] as const;

// Mirrors the LP.1 assumption form fields so the scenario create / edit
// form can POST with the same input names. Numeric fields are passed as
// strings — the validator's number readers accept either form. Empty
// strings collapse to defaults for numbers; nullable string fields treat
// "" as an explicit null clear.
const SCENARIO_ASSUMPTION_FIELDS = [
  "current_church_attendance",
  "expected_growth",
  "expected_growth_date",
  "target_group_participation_pct",
  "average_group_size",
  "launch_buffer_pct",
  "leaders_per_new_group",
  "notes",
] as const;

function readScenarioAssumptionsFromForm(
  form: FormData
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of SCENARIO_ASSUMPTION_FIELDS) {
    if (!form.has(key)) continue;
    const value = form.get(key);
    if (value === null) continue;
    const str = String(value);
    if (key === "expected_growth_date" || key === "notes") {
      out[key] = str.trim() === "" ? null : str;
    } else if (str.trim() === "") {
      continue;
    } else {
      out[key] = str;
    }
  }
  return out;
}

// Translate a scenario create / edit FormData (or plain object) into the
// validator's expected shape: a nested `assumptions` record plus the
// scenario's own name / description / make_current fields.
function readScenarioFormPayload(input: unknown): Record<string, unknown> {
  if (!(input instanceof FormData)) {
    return typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
  }
  const payload: Record<string, unknown> = {
    assumptions: readScenarioAssumptionsFromForm(input),
  };
  if (input.has("scenario_id")) {
    payload.scenario_id = String(input.get("scenario_id") ?? "");
  }
  if (input.has("name")) {
    payload.name = String(input.get("name") ?? "");
  }
  if (input.has("description")) {
    const desc = input.get("description");
    payload.description = desc === null ? null : String(desc);
  }
  if (input.has("make_current")) {
    payload.make_current = input.get("make_current");
  }
  return payload;
}

function readScenarioId(input: unknown): Record<string, unknown> {
  return input instanceof FormData
    ? { scenario_id: String(input.get("scenario_id") ?? "") }
    : typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
}

// Diagnostic counts only — never log notes contents or descriptions. These
// only appear on the success line, matching the create/update RPCs that
// carry an assumptions body.
function scenarioOkFields(
  value:
    | CreateLaunchPlanningScenarioPayload
    | UpdateLaunchPlanningScenarioPayload
) {
  return {
    has_description: value.description !== null,
    make_current: value.make_current,
    has_notes_field: Object.prototype.hasOwnProperty.call(
      value.assumptions,
      "notes"
    ),
  };
}

// ----- adminCreateLaunchPlanningScenario -----------------------------------

const CREATE_SCENARIO_SPEC: AdminWriteActionSpec<
  CreateLaunchPlanningScenarioPayload,
  { id: string }
> = {
  name: "admin.launch_planning.create_scenario",
  read: readScenarioFormPayload,
  validate: validateCreateLaunchPlanningScenarioPayload,
  okFields: (value) => scenarioOkFields(value),
  rpc: (client, value) =>
    rpcAdminCreateLaunchPlanningScenario(client, {
      p_name: value.name,
      p_description: value.description,
      p_assumptions: value.assumptions as Record<string, unknown>,
      p_make_current: value.make_current,
    }),
  revalidate: () => SCENARIO_REVALIDATE_PATHS,
  noDataError: "The scenario was not saved. Please try again.",
};

export async function adminCreateLaunchPlanningScenario(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(CREATE_SCENARIO_SPEC, prev, input);
}

// ----- adminUpdateLaunchPlanningScenario -----------------------------------

const UPDATE_SCENARIO_SPEC: AdminWriteActionSpec<
  UpdateLaunchPlanningScenarioPayload,
  { id: string }
> = {
  name: "admin.launch_planning.update_scenario",
  read: readScenarioFormPayload,
  validate: validateUpdateLaunchPlanningScenarioPayload,
  okFields: (value) => scenarioOkFields(value),
  rpc: (client, value) =>
    rpcAdminUpdateLaunchPlanningScenario(client, {
      p_scenario_id: value.scenario_id,
      p_name: value.name,
      p_description: value.description,
      p_assumptions: value.assumptions as Record<string, unknown>,
      p_make_current: value.make_current,
    }),
  revalidate: () => SCENARIO_REVALIDATE_PATHS,
  noDataError: "The scenario was not saved. Please try again.",
};

export async function adminUpdateLaunchPlanningScenario(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(UPDATE_SCENARIO_SPEC, prev, input);
}

// ----- adminArchiveLaunchPlanningScenario ----------------------------------

const ARCHIVE_SCENARIO_SPEC: AdminWriteActionSpec<
  ScenarioIdPayload,
  { id: string }
> = {
  name: "admin.launch_planning.archive_scenario",
  read: readScenarioId,
  validate: validateScenarioIdPayload,
  rpc: (client, value) =>
    rpcAdminArchiveLaunchPlanningScenario(client, {
      p_scenario_id: value.scenario_id,
    }),
  revalidate: () => SCENARIO_REVALIDATE_PATHS,
  noDataError: "The scenario was not archived. Please try again.",
};

export async function adminArchiveLaunchPlanningScenario(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(ARCHIVE_SCENARIO_SPEC, prev, input);
}

// ----- adminSetCurrentLaunchPlanningScenario -------------------------------

const SET_CURRENT_SCENARIO_SPEC: AdminWriteActionSpec<
  ScenarioIdPayload,
  { id: string }
> = {
  name: "admin.launch_planning.set_current_scenario",
  read: readScenarioId,
  validate: validateScenarioIdPayload,
  rpc: (client, value) =>
    rpcAdminSetCurrentLaunchPlanningScenario(client, {
      p_scenario_id: value.scenario_id,
    }),
  revalidate: () => SCENARIO_REVALIDATE_PATHS,
  noDataError: "The scenario was not made current. Please try again.",
};

export async function adminSetCurrentLaunchPlanningScenario(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(SET_CURRENT_SCENARIO_SPEC, prev, input);
}
