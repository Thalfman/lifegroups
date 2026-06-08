import type {
  MultiplicationCandidateStatus,
  MultiplicationMeetingTime,
} from "@/types/enums";
import { isUuid } from "@/lib/shared/uuid";
import type { ValidationResult } from "./shared";
import {
  isRecord,
  trimString,
  readOptionalString,
  normalizeUuid,
  readOptionalInteger,
  isIsoDate,
  readBooleanFlag,
} from "./shared";

// ---------------------------------------------------------------------------
// LP.1 — launch-planning assumptions
// ---------------------------------------------------------------------------
//
// PATCH-style payload: every field is optional. The RPC merges submitted
// keys onto the stored row, so omitting a key leaves the existing default
// in place. Bounds here mirror the RPC body in
// supabase/migrations/20260518190000_phase_lp1_launch_planning.sql so the
// reject path can use friendlier messages while the RPC stays the trust
// boundary.

export type LaunchPlanningAssumptionsPayload = {
  current_church_attendance?: number;
  expected_growth?: number;
  expected_growth_date?: string | null;
  target_group_participation_pct?: number;
  average_group_size?: number;
  launch_buffer_pct?: number;
  leaders_per_new_group?: number;
  notes?: string | null;
  // Capacity & Multiplication #186: the explicit "launch N by <season>" plan a
  // scenario carries on top of the demand assumptions. Drives the staffing gap.
  planned_launch_count?: number;
  // Julian's planting seasons: January (1) or August (8). Null = no target set.
  target_launch_month?: number | null;
  target_launch_year?: number | null;
};

const LAUNCH_PLANNING_KEYS: ReadonlySet<string> = new Set([
  "current_church_attendance",
  "expected_growth",
  "expected_growth_date",
  "target_group_participation_pct",
  "average_group_size",
  "launch_buffer_pct",
  "leaders_per_new_group",
  "notes",
  "planned_launch_count",
  "target_launch_month",
  "target_launch_year",
]);

// Local numeric parser that accepts `number | numeric string` and rejects
// NaN / Infinity. Mirrors `readOptionalInteger` but allows non-integer
// values (percentages are fractions like 0.6).
function readOptionalNumber(value: unknown): number | undefined | "invalid" {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : "invalid";
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return "invalid";
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : "invalid";
  }
  return "invalid";
}

// Strict ISO calendar-date check: regex format + real-date verification.
// Catches Feb 30, Apr 31, etc. that the regex alone would accept.
function isRealIsoDate(value: string): boolean {
  if (!isIsoDate(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  // Round-trip: serialize back and compare so the calendar arithmetic
  // matches (e.g. 2026-02-30 -> 2026-03-02 round-trips differently).
  return d.toISOString().slice(0, 10) === value;
}

export function validateLaunchPlanningAssumptionsPayload(
  input: unknown
): ValidationResult<LaunchPlanningAssumptionsPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  for (const key of Object.keys(input)) {
    if (!LAUNCH_PLANNING_KEYS.has(key)) {
      errors.push(`Unknown setting key: ${key}`);
    }
  }

  const value: LaunchPlanningAssumptionsPayload = {};

  if ("current_church_attendance" in input) {
    const n = readOptionalInteger(input.current_church_attendance);
    if (n === "invalid")
      errors.push("Current church attendance must be a whole number.");
    else if (n !== undefined && (n < 0 || n > 100000))
      errors.push("Current church attendance must be between 0 and 100000.");
    else if (n !== undefined) value.current_church_attendance = n;
  }

  if ("expected_growth" in input) {
    const n = readOptionalInteger(input.expected_growth);
    if (n === "invalid") errors.push("Expected growth must be a whole number.");
    else if (n !== undefined && (n < -100000 || n > 100000))
      errors.push("Expected growth must be between -100000 and 100000.");
    else if (n !== undefined) value.expected_growth = n;
  }

  if ("expected_growth_date" in input) {
    const raw = input.expected_growth_date;
    if (raw === null) {
      value.expected_growth_date = null;
    } else if (raw === "" || raw === undefined) {
      // Form posts "" for a cleared date input -> treat as null.
      value.expected_growth_date = null;
    } else if (typeof raw !== "string") {
      errors.push("Expected growth date must be a YYYY-MM-DD string or null.");
    } else if (!isRealIsoDate(raw)) {
      errors.push("Expected growth date must be a valid YYYY-MM-DD date.");
    } else {
      value.expected_growth_date = raw;
    }
  }

  if ("target_group_participation_pct" in input) {
    const n = readOptionalNumber(input.target_group_participation_pct);
    if (n === "invalid")
      errors.push(
        "Target group participation % must be a number between 0 and 1."
      );
    else if (n !== undefined && (n < 0 || n > 1))
      errors.push("Target group participation % must be between 0 and 1.");
    else if (n !== undefined) value.target_group_participation_pct = n;
  }

  if ("average_group_size" in input) {
    const n = readOptionalInteger(input.average_group_size);
    if (n === "invalid")
      errors.push("Average group size must be a whole number.");
    else if (n !== undefined && (n < 1 || n > 500))
      errors.push("Average group size must be between 1 and 500.");
    else if (n !== undefined) value.average_group_size = n;
  }

  if ("launch_buffer_pct" in input) {
    const n = readOptionalNumber(input.launch_buffer_pct);
    if (n === "invalid")
      errors.push("Launch buffer % must be a number between 0 and 0.95.");
    else if (n !== undefined && (n < 0 || n > 0.95))
      // Cap below 1 so the (1 - buffer) denominator in computeLaunchPlan
      // can never reach zero.
      errors.push("Launch buffer % must be between 0 and 0.95.");
    else if (n !== undefined) value.launch_buffer_pct = n;
  }

  if ("leaders_per_new_group" in input) {
    const n = readOptionalInteger(input.leaders_per_new_group);
    if (n === "invalid")
      errors.push("Leaders per new group must be a whole number.");
    else if (n !== undefined && (n < 0 || n > 10))
      errors.push("Leaders per new group must be between 0 and 10.");
    else if (n !== undefined) value.leaders_per_new_group = n;
  }

  if ("notes" in input) {
    const raw = input.notes;
    if (raw === null || raw === undefined) {
      value.notes = null;
    } else if (typeof raw !== "string") {
      errors.push("Notes must be a string or null.");
    } else {
      const trimmed = raw.trim();
      if (trimmed.length === 0) {
        value.notes = null;
      } else if (trimmed.length > 2000) {
        errors.push("Notes must be 2000 characters or fewer.");
      } else {
        value.notes = trimmed;
      }
    }
  }

  // Capacity & Multiplication #186 — explicit launch plan.
  if ("planned_launch_count" in input) {
    const n = readOptionalInteger(input.planned_launch_count);
    if (n === "invalid")
      errors.push("Planned launch count must be a whole number.");
    else if (n !== undefined && (n < 0 || n > 100))
      errors.push("Planned launch count must be between 0 and 100.");
    else if (n !== undefined) value.planned_launch_count = n;
  }

  if ("target_launch_month" in input) {
    const raw = input.target_launch_month;
    if (raw === null || raw === "" || raw === undefined) {
      value.target_launch_month = null;
    } else {
      const n = readOptionalInteger(raw);
      // Julian's planting seasons only: January (1) or August (8).
      if (n === "invalid" || n === undefined || (n !== 1 && n !== 8))
        errors.push("Target launch month must be January (1) or August (8).");
      else value.target_launch_month = n;
    }
  }

  if ("target_launch_year" in input) {
    const raw = input.target_launch_year;
    if (raw === null || raw === "" || raw === undefined) {
      value.target_launch_year = null;
    } else {
      const n = readOptionalInteger(raw);
      if (n === "invalid" || n === undefined || n < 2024 || n > 2100)
        errors.push("Target launch year must be between 2024 and 2100.");
      else value.target_launch_year = n;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value };
}

// ---------------------------------------------------------------------------
// LP.2 — Launch planning scenario payloads
// ---------------------------------------------------------------------------
//
// Scenarios reuse the LP.1 assumption shape. The create / update payloads
// add `name`, optional `description`, optional `make_current`, and (for
// update / archive / set-current) the scenario id. Notes redaction lives
// at the audit boundary — see `redactNotesForAudit` and the SQL
// `lp2_redact_assumptions_for_audit` helper.

const SCENARIO_NAME_MAX = 120;
const SCENARIO_DESCRIPTION_MAX = 1000;

function validateScenarioCommon(
  input: Record<string, unknown>,
  errors: string[]
): {
  name: string;
  description: string | null;
  assumptions: LaunchPlanningAssumptionsPayload;
  make_current: boolean;
} {
  const name = trimString(input.name) ?? "";
  if (name.length === 0) {
    errors.push("Scenario name is required.");
  } else if (name.length > SCENARIO_NAME_MAX) {
    errors.push(
      `Scenario name is too long (max ${SCENARIO_NAME_MAX} characters).`
    );
  }

  const descriptionRaw = readOptionalString(input.description);
  let description: string | null = null;
  if (descriptionRaw !== undefined) {
    if (descriptionRaw.length > SCENARIO_DESCRIPTION_MAX) {
      errors.push(
        `Description is too long (max ${SCENARIO_DESCRIPTION_MAX} characters).`
      );
    } else {
      description = descriptionRaw;
    }
  }

  // Reuse the LP.1 assumptions validator so the scenario form's bounds
  // match the baseline form's bounds exactly. Bubble up any per-field
  // errors into the scenario payload's error list.
  const assumptionsInput = isRecord(input.assumptions) ? input.assumptions : {};
  const assumptions =
    validateLaunchPlanningAssumptionsPayload(assumptionsInput);
  let value: LaunchPlanningAssumptionsPayload = {};
  if (!assumptions.ok) {
    for (const e of assumptions.errors) errors.push(e);
  } else {
    value = assumptions.value;
  }

  const make_current = readBooleanFlag(input.make_current);

  return {
    name,
    description,
    assumptions: value,
    make_current,
  };
}

export type CreateLaunchPlanningScenarioPayload = {
  name: string;
  description: string | null;
  assumptions: LaunchPlanningAssumptionsPayload;
  make_current: boolean;
};

export function validateCreateLaunchPlanningScenarioPayload(
  input: unknown
): ValidationResult<CreateLaunchPlanningScenarioPayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  const errors: string[] = [];
  const fields = validateScenarioCommon(input, errors);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: fields };
}

export type UpdateLaunchPlanningScenarioPayload = {
  scenario_id: string;
  name: string;
  description: string | null;
  assumptions: LaunchPlanningAssumptionsPayload;
  make_current: boolean;
};

export function validateUpdateLaunchPlanningScenarioPayload(
  input: unknown
): ValidationResult<UpdateLaunchPlanningScenarioPayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  const errors: string[] = [];
  if (!isUuid(input.scenario_id)) errors.push("scenario_id must be a uuid");
  const fields = validateScenarioCommon(input, errors);
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      scenario_id: normalizeUuid(input.scenario_id as string),
      ...fields,
    },
  };
}

export type ScenarioIdPayload = { scenario_id: string };

export function validateScenarioIdPayload(
  input: unknown
): ValidationResult<ScenarioIdPayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  if (!isUuid(input.scenario_id))
    return { ok: false, errors: ["scenario_id must be a uuid"] };
  return {
    ok: true,
    value: { scenario_id: normalizeUuid(input.scenario_id as string) },
  };
}

// ---------------------------------------------------------------------------
// Julian P2 — church attendance snapshot payload.
// ---------------------------------------------------------------------------

export type RecordChurchAttendancePayload = {
  snapshot_date: string;
  attendance_count: number;
  note: string | null;
};

export function validateRecordChurchAttendancePayload(
  input: unknown
): ValidationResult<RecordChurchAttendancePayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  const snapshotDate = trimString(input.snapshot_date) ?? "";
  if (snapshotDate.length === 0) {
    errors.push("Snapshot date is required.");
  } else if (!isIsoDate(snapshotDate)) {
    errors.push("Snapshot date must be YYYY-MM-DD.");
  }

  const count = readOptionalInteger(input.attendance_count);
  let attendanceCount = 0;
  if (count === "invalid" || count === undefined) {
    errors.push("Attendance count must be a whole number.");
  } else if (count < 0 || count > 1000000) {
    errors.push("Attendance count must be between 0 and 1,000,000.");
  } else {
    attendanceCount = count;
  }

  const note = readOptionalString(input.note);
  if (note !== undefined && note.length > 1000) {
    errors.push("Note is too long (max 1000 characters).");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      snapshot_date: snapshotDate,
      attendance_count: attendanceCount,
      note: note ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Julian P4 — multiplication candidate payloads.
// ---------------------------------------------------------------------------

const MULTIPLICATION_CANDIDATE_STATUSES: ReadonlySet<MultiplicationCandidateStatus> =
  new Set(["watching", "planned", "launched", "deferred"]);

function isMultiplicationStatus(
  value: unknown
): value is MultiplicationCandidateStatus {
  return (
    typeof value === "string" &&
    MULTIPLICATION_CANDIDATE_STATUSES.has(
      value as MultiplicationCandidateStatus
    )
  );
}

const MULTIPLICATION_MEETING_TIMES: ReadonlySet<MultiplicationMeetingTime> =
  new Set(["during_the_day", "evening"]);

function isMultiplicationMeetingTime(
  value: unknown
): value is MultiplicationMeetingTime {
  return (
    typeof value === "string" &&
    MULTIPLICATION_MEETING_TIMES.has(value as MultiplicationMeetingTime)
  );
}

// Julian #143: the successor/leader-designate is a free-text name, bounded
// like the other admin text fields (e.g. group name) so a stray paste can't
// balloon the row.
const MULTIPLICATION_SUCCESSOR_MAX = 120;

type MultiplicationCandidateFields = {
  target_year: number | null;
  status: MultiplicationCandidateStatus;
  shepherd_willing: boolean;
  needs_similar_stage: boolean;
  notes: string | null;
  // Julian #143: net-new, manually-entered designation — distinct from the
  // derived co-shepherd readiness signal; it does not feed readiness.
  successor_designate: string | null;
  meeting_time: MultiplicationMeetingTime | null;
  // Capacity & Multiplication #184: the linked apprentice (leader_pipeline).
  // Same-group enforcement lives server-side (RPC + trigger).
  leader_pipeline_id: string | null;
  // ADR 0022: Julian-fed headcount. Null = use the in-app roster count instead.
  manual_member_count: number | null;
};

function validateMultiplicationCandidateFields(
  input: Record<string, unknown>,
  errors: string[]
): MultiplicationCandidateFields {
  let targetYear: number | null = null;
  const yearRaw = readOptionalString(input.target_year);
  if (yearRaw !== undefined) {
    const n = readOptionalInteger(yearRaw);
    if (n === "invalid" || n === undefined) {
      errors.push("Target year must be a whole number.");
    } else if (n < 2024 || n > 2100) {
      errors.push("Target year must be between 2024 and 2100.");
    } else {
      targetYear = n;
    }
  }

  let status: MultiplicationCandidateStatus = "watching";
  if (
    input.status !== undefined &&
    input.status !== null &&
    input.status !== ""
  ) {
    if (!isMultiplicationStatus(input.status)) {
      errors.push("Status must be watching, planned, launched, or deferred.");
    } else {
      status = input.status;
    }
  }

  const notes = readOptionalString(input.notes);
  if (notes !== undefined && notes.length > 2000) {
    errors.push("Notes are too long (max 2000 characters).");
  }

  const successor = readOptionalString(input.successor_designate);
  if (
    successor !== undefined &&
    successor.length > MULTIPLICATION_SUCCESSOR_MAX
  ) {
    errors.push(
      `Successor / leader-designate is too long (max ${MULTIPLICATION_SUCCESSOR_MAX} characters).`
    );
  }

  const meetingTimeRaw = readOptionalString(input.meeting_time);
  let meetingTime: MultiplicationMeetingTime | null = null;
  if (meetingTimeRaw !== undefined) {
    if (!isMultiplicationMeetingTime(meetingTimeRaw)) {
      errors.push("Meeting time must be during the day or evening.");
    } else {
      meetingTime = meetingTimeRaw;
    }
  }

  let leaderPipelineId: string | null = null;
  const linkRaw = readOptionalString(input.leader_pipeline_id);
  if (linkRaw !== undefined) {
    if (!isUuid(linkRaw)) {
      errors.push("leader_pipeline_id must be a uuid.");
    } else {
      leaderPipelineId = normalizeUuid(linkRaw);
    }
  }

  // ADR 0022: Julian-fed headcount. Blank/absent reads as null (= fall back to
  // the in-app roster count); a value must be a whole number in [0, 1000],
  // matching the RPC's bounds check.
  let manualMemberCount: number | null = null;
  const countRaw = readOptionalString(input.manual_member_count);
  if (countRaw !== undefined) {
    const n = readOptionalInteger(countRaw);
    if (n === "invalid" || n === undefined) {
      errors.push("Members (entered) must be a whole number.");
    } else if (n < 0 || n > 1000) {
      errors.push("Members (entered) must be between 0 and 1000.");
    } else {
      manualMemberCount = n;
    }
  }

  return {
    target_year: targetYear,
    status,
    shepherd_willing: readBooleanFlag(input.shepherd_willing),
    needs_similar_stage: readBooleanFlag(input.needs_similar_stage),
    notes: notes ?? null,
    successor_designate: successor ?? null,
    meeting_time: meetingTime,
    leader_pipeline_id: leaderPipelineId,
    manual_member_count: manualMemberCount,
  };
}

export type CreateMultiplicationCandidatePayload =
  MultiplicationCandidateFields & {
    group_id: string;
  };

export function validateCreateMultiplicationCandidatePayload(
  input: unknown
): ValidationResult<CreateMultiplicationCandidatePayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  const errors: string[] = [];
  if (!isUuid(input.group_id)) errors.push("group_id must be a uuid");
  const fields = validateMultiplicationCandidateFields(input, errors);
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { group_id: normalizeUuid(input.group_id as string), ...fields },
  };
}

export type UpdateMultiplicationCandidatePayload =
  MultiplicationCandidateFields & {
    candidate_id: string;
  };

export function validateUpdateMultiplicationCandidatePayload(
  input: unknown
): ValidationResult<UpdateMultiplicationCandidatePayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  const errors: string[] = [];
  if (!isUuid(input.candidate_id)) errors.push("candidate_id must be a uuid");
  const fields = validateMultiplicationCandidateFields(input, errors);
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      candidate_id: normalizeUuid(input.candidate_id as string),
      ...fields,
    },
  };
}

// Capacity & Multiplication #185: set a group's target size. `target` may be a
// whole number in [1, 500] or null/blank to clear (fall back to the ministry
// default). The RPC writes the effective target source (groups.capacity) and
// clears any override so there is one visible source of truth.
export type SetGroupCapacityTargetPayload = {
  group_id: string;
  target: number | null;
};

export function validateSetGroupCapacityTargetPayload(
  input: unknown
): ValidationResult<SetGroupCapacityTargetPayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  const errors: string[] = [];
  if (!isUuid(input.group_id)) errors.push("group_id must be a uuid");

  let target: number | null = null;
  const raw = readOptionalString(input.target);
  if (raw !== undefined) {
    const n = readOptionalInteger(raw);
    if (n === "invalid" || n === undefined) {
      errors.push("Target size must be a whole number.");
    } else if (n < 1 || n > 500) {
      errors.push("Target size must be between 1 and 500.");
    } else {
      target = n;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { group_id: normalizeUuid(input.group_id as string), target },
  };
}

export type CandidateIdPayload = { candidate_id: string };

export function validateCandidateIdPayload(
  input: unknown
): ValidationResult<CandidateIdPayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  if (!isUuid(input.candidate_id))
    return { ok: false, errors: ["candidate_id must be a uuid"] };
  return {
    ok: true,
    value: { candidate_id: normalizeUuid(input.candidate_id as string) },
  };
}
