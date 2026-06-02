import type {
  GroupAudienceCategory,
  GroupLifeStage,
  MeetingFrequency,
  MeetingWeekParity,
} from "@/types/enums";
import { isUuid } from "@/lib/shared/uuid";
import type { ValidationResult } from "./shared";
import {
  isRecord,
  trimString,
  readOptionalString,
  normalizeUuid,
  isIsoDate,
} from "./shared";

// ---------------------------------------------------------------------------
// Phase 5A.2 — Group management payloads
// ---------------------------------------------------------------------------

// Accepts HH:mm or HH:mm:ss (24-hour). The server-side RPC takes a `time`
// value; we keep the string contract here so server actions never have to
// hand-parse timezone-aware strings.
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

function isTimeString(value: string): boolean {
  return TIME_RE.test(value);
}

function readOptionalCapacity(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") {
    // Reject NaN / Infinity / fractional values so programmatic callers
    // see the same "Capacity must be a whole number." failure that string
    // callers get when they submit "12.7".
    if (!Number.isFinite(value)) return Number.NaN;
    if (!Number.isInteger(value)) return Number.NaN;
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    if (!/^\d+$/.test(trimmed)) return Number.NaN;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  return Number.NaN;
}

// Phase 5A.5 canonical meeting schedule vocabularies. Stored verbatim in
// `public.groups.meeting_day` (Capitalized day name) and as Postgres enum
// values for frequency / parity. The DB also enforces these via CHECK +
// enum constraints; the TS validation layer surfaces friendlier errors.
export const MEETING_DAYS: ReadonlySet<string> = new Set([
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]);

const MEETING_FREQUENCIES: ReadonlySet<MeetingFrequency> = new Set([
  "weekly",
  "biweekly",
  "monthly",
]);

const MEETING_WEEK_PARITIES: ReadonlySet<MeetingWeekParity> = new Set([
  "odd",
  "even",
]);

const GROUP_AUDIENCE_CATEGORIES: ReadonlySet<GroupAudienceCategory> = new Set([
  "men",
  "women",
  "mixed",
]);

const GROUP_LIFE_STAGES: ReadonlySet<GroupLifeStage> = new Set([
  "young_professionals",
  "young_families",
  "families_with_kids",
  "families_with_adult_kids",
  "retirement",
  "multi_generational",
  "spanish_speaking",
]);

function isGroupAudienceCategory(
  value: unknown
): value is GroupAudienceCategory {
  return (
    typeof value === "string" &&
    GROUP_AUDIENCE_CATEGORIES.has(value as GroupAudienceCategory)
  );
}

function isGroupLifeStage(value: unknown): value is GroupLifeStage {
  return (
    typeof value === "string" && GROUP_LIFE_STAGES.has(value as GroupLifeStage)
  );
}

function isMeetingFrequency(value: unknown): value is MeetingFrequency {
  return (
    typeof value === "string" &&
    MEETING_FREQUENCIES.has(value as MeetingFrequency)
  );
}

function isMeetingWeekParity(value: unknown): value is MeetingWeekParity {
  return (
    typeof value === "string" &&
    MEETING_WEEK_PARITIES.has(value as MeetingWeekParity)
  );
}

export type GroupWritablePayload = {
  name: string;
  description?: string;
  meeting_day?: string;
  meeting_time?: string;
  meeting_frequency: MeetingFrequency;
  meeting_week_parity: MeetingWeekParity | null;
  location_area?: string;
  address_optional?: string;
  capacity?: number;
  audience_category?: GroupAudienceCategory | null;
  life_stage?: GroupLifeStage | null;
  launched_on?: string | null;
};

function validateGroupWritablePayload(
  input: unknown
): ValidationResult<GroupWritablePayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  const name = trimString(input.name) ?? "";
  const description = readOptionalString(input.description);
  const meetingDay = readOptionalString(input.meeting_day);
  const meetingTime = readOptionalString(input.meeting_time);
  const locationArea = readOptionalString(input.location_area);
  const addressOptional = readOptionalString(input.address_optional);
  const capacity = readOptionalCapacity(input.capacity);

  // Frequency defaults to 'weekly' when missing so the minimal-data "create
  // a group with just a name" path keeps working. An explicit but invalid
  // value still errors so a typo doesn't silently fall back.
  const rawFrequency = readOptionalString(input.meeting_frequency);
  let frequency: MeetingFrequency = "weekly";
  if (rawFrequency !== undefined) {
    if (!isMeetingFrequency(rawFrequency)) {
      errors.push("Meeting frequency must be weekly, biweekly, or monthly.");
    } else {
      frequency = rawFrequency;
    }
  }

  const rawParity = readOptionalString(input.meeting_week_parity);
  let parity: MeetingWeekParity | null = null;
  if (rawParity !== undefined) {
    if (!isMeetingWeekParity(rawParity)) {
      errors.push("Bi-weekly parity must be odd or even.");
    } else {
      parity = rawParity;
    }
  }
  // Parity is only meaningful for bi-weekly groups. Weekly/monthly groups
  // always submit null so a stale form value can't leak through.
  if (frequency !== "biweekly") {
    parity = null;
  }

  if (name.length === 0) errors.push("Group name is required.");
  if (name.length > 120)
    errors.push("Group name is too long (max 120 characters).");
  if (description !== undefined && description.length > 500)
    errors.push("Description is too long (max 500 characters).");
  if (meetingDay !== undefined && !MEETING_DAYS.has(meetingDay))
    errors.push("Meeting day must be Sunday through Saturday.");
  if (meetingTime !== undefined && !isTimeString(meetingTime))
    errors.push("Meeting time must look like 18:30.");
  if (locationArea !== undefined && locationArea.length > 80)
    errors.push("Location area is too long.");
  if (addressOptional !== undefined && addressOptional.length > 200)
    errors.push("Address is too long.");
  if (capacity !== undefined) {
    if (Number.isNaN(capacity)) errors.push("Capacity must be a whole number.");
    else if (capacity < 0) errors.push("Capacity can't be negative.");
    else if (capacity > 1000)
      errors.push("Capacity is unusually large (max 1000).");
  }

  // Julian P4 segmentation. All optional; an empty select submits "" which
  // readOptionalString collapses to undefined → "leave unset / clear on
  // update". A non-empty but invalid value errors so a stale value can't leak.
  const audienceRaw = readOptionalString(input.audience_category);
  let audienceCategory: GroupAudienceCategory | undefined;
  if (audienceRaw !== undefined) {
    if (!isGroupAudienceCategory(audienceRaw))
      errors.push("Audience category must be men, women, or mixed.");
    else audienceCategory = audienceRaw;
  }

  const lifeStageRaw = readOptionalString(input.life_stage);
  let lifeStage: GroupLifeStage | undefined;
  if (lifeStageRaw !== undefined) {
    if (!isGroupLifeStage(lifeStageRaw))
      errors.push("Life stage is not a valid value.");
    else lifeStage = lifeStageRaw;
  }

  const launchedOnRaw = readOptionalString(input.launched_on);
  let launchedOn: string | undefined;
  if (launchedOnRaw !== undefined) {
    if (!isIsoDate(launchedOnRaw))
      errors.push("Launch date must be YYYY-MM-DD.");
    else launchedOn = launchedOnRaw;
  }

  if (errors.length > 0) return { ok: false, errors };

  const value: GroupWritablePayload = {
    name,
    meeting_frequency: frequency,
    meeting_week_parity: parity,
  };
  if (description !== undefined) value.description = description;
  if (meetingDay !== undefined) value.meeting_day = meetingDay;
  if (meetingTime !== undefined) value.meeting_time = meetingTime;
  if (locationArea !== undefined) value.location_area = locationArea;
  if (addressOptional !== undefined) value.address_optional = addressOptional;
  if (capacity !== undefined) value.capacity = capacity;
  if (audienceCategory !== undefined)
    value.audience_category = audienceCategory;
  if (lifeStage !== undefined) value.life_stage = lifeStage;
  if (launchedOn !== undefined) value.launched_on = launchedOn;
  return { ok: true, value };
}

export type CreateGroupPayload = GroupWritablePayload;

export function validateCreateGroupPayload(
  input: unknown
): ValidationResult<CreateGroupPayload> {
  return validateGroupWritablePayload(input);
}

export type UpdateGroupPayload = GroupWritablePayload & { group_id: string };

export function validateUpdateGroupPayload(
  input: unknown
): ValidationResult<UpdateGroupPayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  if (!isUuid(input.group_id))
    return { ok: false, errors: ["group_id must be a uuid"] };
  const inner = validateGroupWritablePayload(input);
  if (!inner.ok) return inner;
  return {
    ok: true,
    value: {
      ...inner.value,
      group_id: normalizeUuid(input.group_id as string),
    },
  };
}

export type GroupIdPayload = { group_id: string };

export function validateGroupIdPayload(
  input: unknown
): ValidationResult<GroupIdPayload> {
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };
  if (!isUuid(input.group_id))
    return { ok: false, errors: ["group_id must be a uuid"] };
  return {
    ok: true,
    value: { group_id: normalizeUuid(input.group_id as string) },
  };
}
