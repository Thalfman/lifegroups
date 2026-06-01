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
import {
  rpcAdminAdvanceApprenticeStage,
  rpcAdminArchiveApprentice,
  rpcAdminCreateApprentice,
  rpcAdminUpdateApprentice,
} from "@/lib/admin/rpc";

// The pipeline is the supply side of the Capacity Board (#185) and the
// staffing forecast (#186); revalidate those surfaces so a stage advance shows
// up everywhere it counts. The Capacity Board and Multiplication views now live
// inside /admin/launch-planning (ADR 0010 consolidation; their old routes only
// redirect), so launch-planning is the one surface to revalidate.
const REVALIDATE_PATH_PIPELINE = "/admin/leader-pipeline";
const REVALIDATE_PATH_LAUNCH_PLANNING = "/admin/launch-planning";

const APPRENTICE_REVALIDATE = [
  REVALIDATE_PATH_PIPELINE,
  REVALIDATE_PATH_LAUNCH_PLANNING,
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

// ----- adminCreateApprentice ----------------------------------------------

const CREATE_APPRENTICE_SPEC: AdminWriteActionSpec<
  CreateApprenticePayload,
  { id: string }
> = {
  name: "admin.leader_pipeline.create_apprentice",
  read: readApprenticeForm,
  validate: validateCreateApprenticePayload,
  rpc: (client, value) =>
    rpcAdminCreateApprentice(client, {
      p_group_id: value.group_id,
      p_display_name: value.display_name,
      p_member_id: value.member_id,
      p_readiness_stage: value.readiness_stage,
      p_expected_ready_on: value.expected_ready_on,
      p_notes: value.notes,
    }),
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
    rpcAdminUpdateApprentice(client, {
      p_apprentice_id: value.apprentice_id,
      p_display_name: value.display_name,
      p_member_id: value.member_id,
      p_readiness_stage: value.readiness_stage,
      p_expected_ready_on: value.expected_ready_on,
      p_notes: value.notes,
    }),
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
    rpcAdminAdvanceApprenticeStage(client, {
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
    rpcAdminArchiveApprentice(client, { p_apprentice_id: value.apprentice_id }),
  revalidate: () => APPRENTICE_REVALIDATE,
  noDataError: "The apprentice was not removed. Please try again.",
};

export async function adminArchiveApprentice(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(ARCHIVE_APPRENTICE_SPEC, prev, input);
}
