"use server";

import {
  validateCandidateIdPayload,
  validateCreateMultiplicationCandidatePayload,
  validateLaunchPlanningAssumptionsPayload,
  validateRecordChurchAttendancePayload,
  validateUpdateMultiplicationCandidatePayload,
  type CandidateIdPayload,
  type CreateMultiplicationCandidatePayload,
  type LaunchPlanningAssumptionsPayload,
  type RecordChurchAttendancePayload,
  type UpdateMultiplicationCandidatePayload,
} from "@/lib/admin/validation";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import {
  rpcAdminArchiveMultiplicationCandidate,
  rpcAdminCreateMultiplicationCandidate,
  rpcAdminRecordChurchAttendanceSnapshot,
  rpcAdminUpdateLaunchPlanningAssumptions,
  rpcAdminUpdateMultiplicationCandidate,
} from "@/lib/admin/rpc";

const REVALIDATE_PATH_LAUNCH_PLANNING = "/admin/launch-planning";
const REVALIDATE_PATH_ADMIN = "/admin";
// Julian #145: the multiplication pipeline now lives on its own surface; the
// candidate writes below revalidate it so edits show up there immediately.
const REVALIDATE_PATH_MULTIPLICATION = "/admin/multiplication";
// #185: candidate flags/ids drive the Capacity Board's suggestion annotations
// and de-duping, so candidate writes must refresh it too.
const REVALIDATE_PATH_CAPACITY = "/admin/capacity-board";

// Candidate writes touch the multiplication plan, launch planning, and the
// capacity board's suggestions.
const CANDIDATE_REVALIDATE = [
  REVALIDATE_PATH_MULTIPLICATION,
  REVALIDATE_PATH_LAUNCH_PLANNING,
  REVALIDATE_PATH_CAPACITY,
] as const;

// Keep this list in lockstep with the validator's whitelist. The form
// only POSTs keys that were actually submitted (we read each by name),
// so a missing input collapses to "don't change this key" rather than
// being interpreted as a clear.
const LAUNCH_PLANNING_FIELDS = [
  "current_church_attendance",
  "expected_growth",
  "expected_growth_date",
  "target_group_participation_pct",
  "average_group_size",
  "launch_buffer_pct",
  "leaders_per_new_group",
  "notes",
] as const;

// Translate a FormData (or plain object) into the validator's expected
// shape. Numeric fields are passed as strings -- the validator's number
// readers accept either form. Empty strings collapse the field out of the
// patch so the stored value is preserved, except `expected_growth_date`
// and `notes`, where an empty string is treated as `null` so the operator
// can reset the stored value back to "no growth date" / "no notes".
function readLaunchPlanningForm(input: unknown): Record<string, unknown> {
  if (!(input instanceof FormData)) {
    return typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
  }
  const out: Record<string, unknown> = {};
  for (const key of LAUNCH_PLANNING_FIELDS) {
    if (!input.has(key)) continue;
    const value = input.get(key);
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

function readCandidateForm(input: unknown): Record<string, unknown> {
  if (!(input instanceof FormData)) {
    return typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
  }
  return {
    group_id: input.get("group_id") ?? undefined,
    candidate_id: input.get("candidate_id") ?? undefined,
    target_year: input.get("target_year") ?? undefined,
    status: input.get("status") ?? undefined,
    // Checkboxes: presence = true, absence = false.
    shepherd_willing: input.has("shepherd_willing"),
    needs_similar_stage: input.has("needs_similar_stage"),
    notes: input.get("notes") ?? undefined,
    successor_designate: input.get("successor_designate") ?? undefined,
    meeting_time: input.get("meeting_time") ?? undefined,
    // Empty string = "no apprentice linked"; collapse to undefined so the
    // validator reads it as unset (null) rather than a malformed uuid.
    leader_pipeline_id: readBlankableField(input.get("leader_pipeline_id")),
  };
}

// A form field where an empty string means "unset". Returns undefined for null
// or blank so the validator treats it as absent.
function readBlankableField(
  value: FormDataEntryValue | null
): string | undefined {
  if (value === null) return undefined;
  const s = String(value);
  return s.trim() === "" ? undefined : s;
}

// ----- adminUpdateLaunchPlanningAssumptions --------------------------------

const UPDATE_ASSUMPTIONS_SPEC: AdminWriteActionSpec<
  LaunchPlanningAssumptionsPayload,
  { id: string }
> = {
  name: "admin.launch_planning.update_assumptions",
  read: readLaunchPlanningForm,
  validate: validateLaunchPlanningAssumptionsPayload,
  guard: (_actor, value) =>
    Object.keys(value).length === 0
      ? {
          error: "Nothing to change. Adjust a field before saving.",
          code: "empty_diff",
          outcome: "fail",
        }
      : null,
  // Diagnostic counts only -- never log notes or anything derived from the
  // notes body; the audit row already records `has_notes`.
  okFields: (value) => ({
    changed_field_count: Object.keys(value).length,
    has_notes_field: Object.prototype.hasOwnProperty.call(value, "notes"),
  }),
  rpc: (client, value) =>
    rpcAdminUpdateLaunchPlanningAssumptions(client, {
      p_settings: value as Record<string, unknown>,
    }),
  revalidate: () => [REVALIDATE_PATH_LAUNCH_PLANNING, REVALIDATE_PATH_ADMIN],
  noDataError: "The assumptions were not saved. Please try again.",
};

export async function adminUpdateLaunchPlanningAssumptions(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(UPDATE_ASSUMPTIONS_SPEC, prev, input);
}

// ----- adminRecordChurchAttendanceSnapshot ---------------------------------
// Julian P2: record an actual church-attendance count for a date. Upserts by
// date so re-entering a date corrects the prior figure.

const RECORD_ATTENDANCE_SPEC: AdminWriteActionSpec<
  RecordChurchAttendancePayload,
  { id: string }
> = {
  name: "admin.launch_planning.record_church_attendance",
  read: (input) =>
    input instanceof FormData
      ? {
          snapshot_date: input.get("snapshot_date"),
          attendance_count: input.get("attendance_count"),
          note: input.get("note"),
        }
      : (input as Record<string, unknown>),
  validate: validateRecordChurchAttendancePayload,
  rpc: (client, value) =>
    rpcAdminRecordChurchAttendanceSnapshot(client, {
      p_snapshot_date: value.snapshot_date,
      p_attendance_count: value.attendance_count,
      p_note: value.note,
    }),
  revalidate: () => [REVALIDATE_PATH_LAUNCH_PLANNING, REVALIDATE_PATH_ADMIN],
  noDataError: "The attendance snapshot was not saved. Please try again.",
};

export async function adminRecordChurchAttendanceSnapshot(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(RECORD_ATTENDANCE_SPEC, prev, input);
}

// ----- Julian P4: multiplication candidate actions ------------------------

const CREATE_CANDIDATE_SPEC: AdminWriteActionSpec<
  CreateMultiplicationCandidatePayload,
  { id: string }
> = {
  name: "admin.launch_planning.create_multiplication_candidate",
  read: readCandidateForm,
  validate: validateCreateMultiplicationCandidatePayload,
  rpc: (client, value) =>
    rpcAdminCreateMultiplicationCandidate(client, {
      p_group_id: value.group_id,
      p_target_year: value.target_year,
      p_status: value.status,
      p_shepherd_willing: value.shepherd_willing,
      p_needs_similar_stage: value.needs_similar_stage,
      p_notes: value.notes,
      p_successor_designate: value.successor_designate,
      p_meeting_time: value.meeting_time,
      p_leader_pipeline_id: value.leader_pipeline_id,
    }),
  revalidate: () => CANDIDATE_REVALIDATE,
  noDataError: "The candidate was not saved. Please try again.",
};

export async function adminCreateMultiplicationCandidate(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(CREATE_CANDIDATE_SPEC, prev, input);
}

const UPDATE_CANDIDATE_SPEC: AdminWriteActionSpec<
  UpdateMultiplicationCandidatePayload,
  { id: string }
> = {
  name: "admin.launch_planning.update_multiplication_candidate",
  read: readCandidateForm,
  validate: validateUpdateMultiplicationCandidatePayload,
  rpc: (client, value) =>
    rpcAdminUpdateMultiplicationCandidate(client, {
      p_candidate_id: value.candidate_id,
      p_target_year: value.target_year,
      p_status: value.status,
      p_shepherd_willing: value.shepherd_willing,
      p_needs_similar_stage: value.needs_similar_stage,
      p_notes: value.notes,
      p_successor_designate: value.successor_designate,
      p_meeting_time: value.meeting_time,
      p_leader_pipeline_id: value.leader_pipeline_id,
    }),
  revalidate: () => CANDIDATE_REVALIDATE,
  noDataError: "The candidate was not saved. Please try again.",
};

export async function adminUpdateMultiplicationCandidate(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(UPDATE_CANDIDATE_SPEC, prev, input);
}

const ARCHIVE_CANDIDATE_SPEC: AdminWriteActionSpec<
  CandidateIdPayload,
  { id: string }
> = {
  name: "admin.launch_planning.archive_multiplication_candidate",
  read: (input) =>
    input instanceof FormData
      ? { candidate_id: input.get("candidate_id") ?? undefined }
      : (input as Record<string, unknown>),
  validate: validateCandidateIdPayload,
  rpc: (client, value) =>
    rpcAdminArchiveMultiplicationCandidate(client, {
      p_candidate_id: value.candidate_id,
    }),
  revalidate: () => CANDIDATE_REVALIDATE,
  noDataError: "The candidate was not archived. Please try again.",
};

export async function adminArchiveMultiplicationCandidate(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(ARCHIVE_CANDIDATE_SPEC, prev, input);
}
