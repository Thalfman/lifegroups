"use server";

import {
  validateAdvanceApprenticeStagePayload,
  validateApprenticeIdPayload,
  validateCreateApprenticePayload,
  validateUpdateApprenticePayload,
  type AdvanceApprenticeStagePayload,
  type ApprenticeIdPayload,
  type CreateApprenticePayload,
  type UpdateApprenticePayload,
} from "@/lib/admin/validation";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import { adminRpc } from "@/lib/admin/rpc";
import { toRpcArgs } from "@/lib/shared/rpc-args";

// The pipeline is the supply side of the Capacity Board (#185) and the
// staffing forecast (#186); revalidate those surfaces so a stage advance shows
// up everywhere it counts. The Capacity Board and Multiplication views now live
// inside /admin/launch-planning (ADR 0010 consolidation; their old routes only
// redirect), so launch-planning is the one surface to revalidate. The pipeline
// is also embedded as the Apprentices tab under /admin/people (#302), so a
// create/advance/archive run from there must refresh that surface too.
const REVALIDATE_PATH_PIPELINE = "/admin/leader-pipeline";
const REVALIDATE_PATH_LAUNCH_PLANNING = "/admin/launch-planning";
const REVALIDATE_PATH_PEOPLE = "/admin/people";
// The pipeline is also re-homed into the visible Multiply area's Leaders tab,
// and its Plan tab's apprentice picker reads the same data (ADR 0022), so an
// apprentice create/advance/archive must refresh /admin/multiply too.
const REVALIDATE_PATH_MULTIPLY = "/admin/multiply";
// The admin dashboard (/admin) renders the pipeline card, so a stage change
// must refresh it too (#810).
const REVALIDATE_PATH_ADMIN = "/admin";

const APPRENTICE_REVALIDATE = [
  REVALIDATE_PATH_PIPELINE,
  REVALIDATE_PATH_LAUNCH_PLANNING,
  REVALIDATE_PATH_PEOPLE,
  REVALIDATE_PATH_MULTIPLY,
  REVALIDATE_PATH_ADMIN,
] as const;

// Translate a FormData (or plain object) into the validator's expected shape.
// Empty strings collapse member/date to undefined so they read as "unset"; the
// validator treats absent fields as null.
function readApprenticeForm(input: unknown): Record<string, unknown> {
  if (!(input instanceof FormData)) {
    return typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
  }
  const blankToUndef = (v: FormDataEntryValue | null) => {
    if (v === null) return undefined;
    const s = String(v);
    return s.trim() === "" ? undefined : s;
  };
  return {
    group_id: input.get("group_id") ?? undefined,
    apprentice_id: input.get("apprentice_id") ?? undefined,
    display_name: input.get("display_name") ?? undefined,
    member_id: blankToUndef(input.get("member_id")),
    readiness_stage: input.get("readiness_stage") ?? undefined,
    expected_ready_on: blankToUndef(input.get("expected_ready_on")),
    notes: input.get("notes") ?? undefined,
  };
}

// toRpcArgs key lists: the apprentice RPC args are exactly these payload
// fields, p_-prefixed (create keys on the group, update on the apprentice).
const APPRENTICE_FIELD_ARG_KEYS = [
  "display_name",
  "member_id",
  "readiness_stage",
  "expected_ready_on",
  "notes",
] as const;

const CREATE_APPRENTICE_ARG_KEYS = [
  "group_id",
  ...APPRENTICE_FIELD_ARG_KEYS,
] as const;

const UPDATE_APPRENTICE_ARG_KEYS = [
  "apprentice_id",
  ...APPRENTICE_FIELD_ARG_KEYS,
] as const;

// ----- adminCreateApprentice ----------------------------------------------

const CREATE_APPRENTICE_SPEC: AdminWriteActionSpec<
  CreateApprenticePayload,
  { id: string }
> = {
  name: "admin.leader_pipeline.create_apprentice",
  read: readApprenticeForm,
  validate: validateCreateApprenticePayload,
  rpc: (client, value) =>
    adminRpc(
      client,
      "admin_create_apprentice",
      toRpcArgs(value, CREATE_APPRENTICE_ARG_KEYS)
    ),
  revalidate: () => APPRENTICE_REVALIDATE,
  noDataError: "The apprentice was not saved. Please try again.",
};

export async function adminCreateApprentice(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(CREATE_APPRENTICE_SPEC, prev, input);
}

// ----- adminUpdateApprentice ----------------------------------------------

const UPDATE_APPRENTICE_SPEC: AdminWriteActionSpec<
  UpdateApprenticePayload,
  { id: string }
> = {
  name: "admin.leader_pipeline.update_apprentice",
  read: readApprenticeForm,
  validate: validateUpdateApprenticePayload,
  rpc: (client, value) =>
    adminRpc(
      client,
      "admin_update_apprentice",
      toRpcArgs(value, UPDATE_APPRENTICE_ARG_KEYS)
    ),
  revalidate: () => APPRENTICE_REVALIDATE,
  noDataError: "The apprentice was not saved. Please try again.",
};

export async function adminUpdateApprentice(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(UPDATE_APPRENTICE_SPEC, prev, input);
}

// ----- adminAdvanceApprenticeStage ----------------------------------------

const ADVANCE_STAGE_SPEC: AdminWriteActionSpec<
  AdvanceApprenticeStagePayload,
  { id: string }
> = {
  name: "admin.leader_pipeline.advance_apprentice_stage",
  read: (input) =>
    input instanceof FormData
      ? {
          apprentice_id: input.get("apprentice_id") ?? undefined,
          readiness_stage: input.get("readiness_stage") ?? undefined,
        }
      : (input as Record<string, unknown>),
  validate: validateAdvanceApprenticeStagePayload,
  rpc: (client, value) =>
    adminRpc(client, "admin_advance_apprentice_stage", {
      p_apprentice_id: value.apprentice_id,
      p_readiness_stage: value.readiness_stage,
    }),
  revalidate: () => APPRENTICE_REVALIDATE,
  noDataError: "The stage was not updated. Please try again.",
};

export async function adminAdvanceApprenticeStage(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(ADVANCE_STAGE_SPEC, prev, input);
}

// ----- adminArchiveApprentice ---------------------------------------------

const ARCHIVE_APPRENTICE_SPEC: AdminWriteActionSpec<
  ApprenticeIdPayload,
  { id: string }
> = {
  name: "admin.leader_pipeline.archive_apprentice",
  read: (input) =>
    input instanceof FormData
      ? { apprentice_id: input.get("apprentice_id") ?? undefined }
      : (input as Record<string, unknown>),
  validate: validateApprenticeIdPayload,
  rpc: (client, value) =>
    adminRpc(client, "admin_archive_apprentice", {
      p_apprentice_id: value.apprentice_id,
    }),
  revalidate: () => APPRENTICE_REVALIDATE,
  noDataError: "The apprentice was not removed. Please try again.",
};

export async function adminArchiveApprentice(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(ARCHIVE_APPRENTICE_SPEC, prev, input);
}
