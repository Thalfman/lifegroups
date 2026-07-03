import type { ReactNode } from "react";
import { fieldInputClassName, fieldSelectClassName } from "./field-styles";
import {
  MEETING_DAYS_ORDERED,
  MEETING_FREQUENCY_OPTIONS,
  MEETING_PARITY_OPTIONS,
} from "./meeting-schedule-options";
import type { MeetingFrequency } from "@/types/enums";
import { FormField } from "./form-field";

/**
 * Maps a field name to its DOM id. The create form uses static ids
 * (`group-meeting_day`); the edit form scopes them per group
 * (`edit-meeting_day-<id>`) since several drawers can mount at once.
 */
export type FieldIdFor = (field: string) => string;

/**
 * The meeting day + time pair shared by the group create/edit forms. Renders
 * two grid cells for the parent's form grid. Defaults are uncontrolled — the
 * caller seeds them from its draft and/or the stored group.
 */
export function MeetingDayTimeFields({
  idFor,
  optionalLabels = false,
  dayDefault,
  timeDefault,
}: {
  idFor: FieldIdFor;
  optionalLabels?: boolean;
  dayDefault: string;
  timeDefault: string;
}) {
  const suffix = optionalLabels ? " (optional)" : "";
  return (
    <>
      <FormField htmlFor={idFor("meeting_day")} label={`Meeting day${suffix}`}>
        <select
          id={idFor("meeting_day")}
          name="meeting_day"
          defaultValue={dayDefault}
          className={fieldSelectClassName}
        >
          <option value="">Not set</option>
          {MEETING_DAYS_ORDERED.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
      </FormField>
      <FormField
        htmlFor={idFor("meeting_time")}
        label={`Meeting time${suffix}`}
      >
        <input
          id={idFor("meeting_time")}
          name="meeting_time"
          type="time"
          defaultValue={timeDefault}
          autoComplete="off"
          className={fieldInputClassName}
        />
      </FormField>
    </>
  );
}

/**
 * The meeting frequency select plus the week-parity select that only applies
 * to biweekly groups. `frequency` stays lifted in the caller (the create form
 * resets it on success), but the "show parity only when biweekly" rule lives
 * here so the two forms can't drift.
 */
export function MeetingFrequencyParityFields({
  idFor,
  frequency,
  onFrequencyChange,
  parityDefault,
}: {
  idFor: FieldIdFor;
  frequency: MeetingFrequency;
  onFrequencyChange: (frequency: MeetingFrequency) => void;
  parityDefault: string;
}) {
  return (
    <>
      <FormField htmlFor={idFor("meeting_frequency")} label="Meeting frequency">
        <select
          id={idFor("meeting_frequency")}
          name="meeting_frequency"
          value={frequency}
          onChange={(e) =>
            onFrequencyChange(e.target.value as MeetingFrequency)
          }
          className={fieldSelectClassName}
        >
          {MEETING_FREQUENCY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </FormField>
      {frequency === "biweekly" ? (
        <FormField
          htmlFor={idFor("meeting_week_parity")}
          label="Which weeks does it meet?"
          hint="For groups that meet every other week. Odd and even weeks alternate through the year — pick the set this group gathers on."
        >
          <select
            id={idFor("meeting_week_parity")}
            name="meeting_week_parity"
            defaultValue={parityDefault}
            className={fieldSelectClassName}
          >
            <option value="">Choose weeks</option>
            {MEETING_PARITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </FormField>
      ) : null}
    </>
  );
}

/**
 * The group capacity field. `asNumber` controls the input type:
 *
 * - `true`: a real number control with range checks for inline feedback.
 * - `false`: a plain text field, used while the create form's "More details"
 *   section is collapsed, so NONE of the number control's native validation
 *   (range, step/whole-number, bad input) can block submission from a
 *   non-focusable, hidden element. The server validator then surfaces any
 *   visible "Capacity must be a whole number / can't be negative / over 1000"
 *   error. inputMode stays numeric for the mobile keypad.
 */
export function CapacityField({
  id,
  label,
  asNumber,
  defaultValue,
  placeholder,
  hint,
}: {
  id: string;
  label: ReactNode;
  asNumber: boolean;
  defaultValue: string | number;
  placeholder: string;
  hint?: ReactNode;
}) {
  return (
    <FormField htmlFor={id} label={label} hint={hint}>
      <input
        id={id}
        name="capacity"
        type={asNumber ? "number" : "text"}
        min={asNumber ? 0 : undefined}
        max={asNumber ? 1000 : undefined}
        inputMode="numeric"
        autoComplete="off"
        className={fieldInputClassName}
        defaultValue={defaultValue}
        placeholder={placeholder}
      />
    </FormField>
  );
}
