"use server";

// Canonical home — do NOT retire or warn-log on invoke (ADR 0033). Although this
// file lives in the pre-pivot-named /admin/launch-planning folder, these actions
// are imported by the canonical Multiply surface
// (components/admin/multiply/*, components/admin/multiplication/*), so any
// deprecation here would fire on canonical use.

import {
  validateCandidateIdPayload,
  validateCreateMultiplicationCandidatePayload,
  validateLaunchPlanningAssumptionsPayload,
  validateRecordChurchAttendancePayload,
  validateSetGroupCapacityTargetPayload,
  validateUpdateMultiplicationCandidatePayload,
  type CandidateIdPayload,
  type CreateMultiplicationCandidatePayload,
  type LaunchPlanningAssumptionsPayload,
  type RecordChurchAttendancePayload,
  type SetGroupCapacityTargetPayload,
  type UpdateMultiplicationCandidatePayload,
} from "@/lib/admin/validation";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import { adminRpc } from "@/lib/admin/rpc";
import { toRpcArgs } from "@/lib/shared/rpc-args";

const REVALIDATE_PATH_LAUNCH_PLANNING = "/admin/launch-planning";
const REVALIDATE_PATH_ADMIN = "/admin";
// The Planning area (#303) hosts these launch/capacity/multiplication forms as
// tabs, so saves made from /admin/planning must revalidate it too — otherwise
// the tab keeps showing stale server-rendered data until a full reload.
const REVALIDATE_PATH_PLANNING = "/admin/planning";

// The former /admin/multiplication and /admin/capacity-board surfaces are now
// folded into /admin/launch-planning (ADR 0010 surface-budget consolidation;
// both old routes redirect here). The per-group multiplication planner is ALSO
// re-homed into the visible Multiply area's Plan tab (ADR 0022), so candidate
// writes must revalidate /admin/multiply too — otherwise the Plan tab keeps
// showing stale server-rendered candidates until a full reload.
const REVALIDATE_PATH_MULTIPLY = "/admin/multiply";
const CANDIDATE_REVALIDATE = [
  REVALIDATE_PATH_LAUNCH_PLANNING,
  REVALIDATE_PATH_PLANNING,
  REVALIDATE_PATH_MULTIPLY,
  REVALIDATE_PATH_ADMIN,
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
    // Type-first: the cell (audience × category) the candidate is anchored to.
    audience_category: input.get("audience_category") ?? undefined,
    category_id: input.get("category_id") ?? undefined,
    // The multiplying group is optional; an empty (type-only) submission
    // collapses to undefined so the validator reads it as null rather than a
    // malformed uuid.
    group_id: readBlankableField(input.get("group_id")),
    candidate_id: input.get("candidate_id") ?? undefined,
    target_year: input.get("target_year") ?? undefined,
    status: input.get("status") ?? undefined,
    // Checkboxes: presence = true, absence = false.
    shepherd_willing: input.has("shepherd_willing"),
    needs_similar_stage: input.has("needs_similar_stage"),
    // ADR 0029: the three manually-ticked readiness flags (no UI yet — wired
    // through the write path so a later slice only adds the checkboxes).
    enough_members: input.has("enough_members"),
    established_long_enough: input.has("established_long_enough"),
    co_shepherd_tenured: input.has("co_shepherd_tenured"),
    notes: input.get("notes") ?? undefined,
    successor_designate: input.get("successor_designate") ?? undefined,
    meeting_time: input.get("meeting_time") ?? undefined,
    // Empty string = "no apprentice linked"; collapse to undefined so the
    // validator reads it as unset (null) rather than a malformed uuid.
    leader_pipeline_id: readBlankableField(input.get("leader_pipeline_id")),
    // ADR 0022: Julian-fed headcount; blank collapses to undefined so the
    // validator reads it as unset (null = fall back to the roster count).
    manual_member_count: readBlankableField(input.get("manual_member_count")),
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
    adminRpc(client, "admin_update_launch_planning_assumptions", {
      p_settings: value as Record<string, unknown>,
    }),
  revalidate: () => [
    REVALIDATE_PATH_LAUNCH_PLANNING,
    REVALIDATE_PATH_PLANNING,
    REVALIDATE_PATH_ADMIN,
  ],
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
    adminRpc(client, "admin_record_church_attendance_snapshot", {
      p_snapshot_date: value.snapshot_date,
      p_attendance_count: value.attendance_count,
      p_note: value.note,
    }),
  revalidate: () => [
    REVALIDATE_PATH_LAUNCH_PLANNING,
    REVALIDATE_PATH_PLANNING,
    REVALIDATE_PATH_ADMIN,
  ],
  noDataError: "The attendance snapshot was not saved. Please try again.",
};

export async function adminRecordChurchAttendanceSnapshot(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(RECORD_ATTENDANCE_SPEC, prev, input);
}

// ----- Julian P4: multiplication candidate actions ------------------------

// toRpcArgs key lists: the candidate RPC args are exactly these payload
// fields, p_-prefixed (checked against the args map at the adminRpc call
// sites).
const CANDIDATE_FIELD_ARG_KEYS = [
  "group_id",
  "target_year",
  "status",
  "shepherd_willing",
  "needs_similar_stage",
  "notes",
  "successor_designate",
  "meeting_time",
  "leader_pipeline_id",
  "manual_member_count",
  "enough_members",
  "established_long_enough",
  "co_shepherd_tenured",
] as const;

const UPDATE_CANDIDATE_ARG_KEYS = [
  "candidate_id",
  ...CANDIDATE_FIELD_ARG_KEYS,
] as const;

const CREATE_CANDIDATE_SPEC: AdminWriteActionSpec<
  CreateMultiplicationCandidatePayload,
  { id: string }
> = {
  name: "admin.launch_planning.create_multiplication_candidate",
  read: readCandidateForm,
  validate: validateCreateMultiplicationCandidatePayload,
  rpc: (client, value) =>
    adminRpc(
      client,
      "admin_create_multiplication_candidate",
      toRpcArgs(value, CANDIDATE_FIELD_ARG_KEYS)
    ),
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
    adminRpc(
      client,
      "admin_update_multiplication_candidate",
      toRpcArgs(value, UPDATE_CANDIDATE_ARG_KEYS)
    ),
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
    adminRpc(client, "admin_archive_multiplication_candidate", {
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

// ----- adminSetGroupCapacityTarget ----------------------------------------
// Relocated from the merged-away /admin/capacity-board surface (ADR 0010
// consolidation). The Capacity board now renders inside /admin/launch-planning,
// so its per-group target editor lives here. Behaviour is unchanged.

const SET_TARGET_SPEC: AdminWriteActionSpec<
  SetGroupCapacityTargetPayload,
  { id: string }
> = {
  name: "admin.capacity_board.set_group_target",
  read: (input) =>
    input instanceof FormData
      ? {
          group_id: input.get("group_id") ?? undefined,
          // Blank clears the per-group target (falls back to the default).
          target: input.get("target") ?? undefined,
        }
      : (input as Record<string, unknown>),
  validate: validateSetGroupCapacityTargetPayload,
  rpc: (client, value) =>
    adminRpc(client, "admin_set_group_capacity_target", {
      p_group_id: value.group_id,
      p_target: value.target,
    }),
  revalidate: () => CANDIDATE_REVALIDATE,
  noDataError: "The target was not saved. Please try again.",
};

export async function adminSetGroupCapacityTarget(
  prev: ActionResult<{ id: string }> | undefined,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(SET_TARGET_SPEC, prev, input);
}
