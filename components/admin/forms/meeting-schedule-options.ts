import type { MeetingFrequency, MeetingWeekParity } from "@/types/enums";

// Canonical order for the Sunday-Saturday dropdown. Matches the DB CHECK on
// public.groups.meeting_day.
export const MEETING_DAYS_ORDERED = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const MEETING_FREQUENCY_OPTIONS: ReadonlyArray<{
  value: MeetingFrequency;
  label: string;
}> = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "monthly", label: "Monthly" },
];

export const MEETING_PARITY_OPTIONS: ReadonlyArray<{
  value: MeetingWeekParity;
  label: string;
}> = [
  { value: "odd", label: "Odd weeks" },
  { value: "even", label: "Even weeks" },
];
