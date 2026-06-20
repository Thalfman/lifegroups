"use client";

import {
  CRITERION_LABEL,
  type MultiplicationCriterion,
} from "@/lib/admin/multiplication";
import { fieldLabelClassName as LABEL } from "@/components/admin/forms/field-styles";

// ADR 0029 / 0030: the Multiplication Readiness Checklist — all five criteria as
// a contiguous block of plain checkboxes (12+ members · 3+ years · Co-Shepherd
// 1+ yr · Shepherd willing · Need for similar group). Every box is a
// Julian-ticked manual flag; the thresholds in the labels are advisory text.
//
// Lock-in is a deliberate assessment, never a gate (ADR 0030): a group can be
// locked in with any number of boxes ticked, even zero — "a group does not need
// to meet each." So this component never enforces a minimum.
//
// Each box posts by presence: the action's `input.has(name)` read maps an
// absent checkbox to false. Uncontrolled (defaultChecked), seeded on edit.
// Extracted here (was inline in multiplication-planner.tsx) so both the legacy
// planner and the Pipeline lock-in form share one checklist.

const CHECKBOX_LABEL = "flex items-center gap-2 font-sans text-sm text-ink";

const CRITERIA_ORDER: MultiplicationCriterion[] = [
  "enough_members",
  "established_long_enough",
  "co_shepherd_tenured",
  "shepherd_willing",
  "needs_similar_stage",
];

const READINESS_CHECKLIST_FIELDS: {
  name: string;
  criterion: MultiplicationCriterion;
}[] = CRITERIA_ORDER.map((criterion) => ({ name: criterion, criterion }));

// Scope a field's element id to the form it renders in, so several checklists
// can render at once without their label↔control associations colliding.
function fieldId(prefix: string, name: string): string {
  return `${prefix}-${name}`;
}

export function ReadinessChecklist({
  idPrefix,
  defaults,
}: {
  idPrefix: string;
  defaults?: Partial<Record<MultiplicationCriterion, boolean>>;
}) {
  return (
    <fieldset className="m-0 grid gap-2 border-0 p-0">
      <legend className={LABEL}>Readiness checklist</legend>
      {READINESS_CHECKLIST_FIELDS.map((f) => (
        <label
          key={f.name}
          htmlFor={fieldId(idPrefix, f.name)}
          className={CHECKBOX_LABEL}
        >
          <input
            id={fieldId(idPrefix, f.name)}
            type="checkbox"
            name={f.name}
            defaultChecked={defaults?.[f.criterion] ?? false}
          />
          {CRITERION_LABEL[f.criterion]}
        </label>
      ))}
    </fieldset>
  );
}
