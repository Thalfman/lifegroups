"use client";

import { useMemo, useState } from "react";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import { Button } from "@/components/ui/button";
import { adminSetGroupRubricGrade } from "@/app/(protected)/admin/group-health/grade-actions";
import { resolveGroupRubricGrade } from "@/lib/admin/group-rubric-grade";
import type { RubricCriterion } from "@/lib/admin/health-rubric";
import type {
  GroupHealthLetter,
  GroupHealthOverrideScope,
} from "@/types/enums";
import {
  fieldLabelTextClassName as FIELD_LABEL,
  fieldInputBaseClassName,
} from "@/components/admin/forms/field-styles";

// Care Group-Health Grade entry (#377 / ADR 0018, Pivot slice 4). A grader scores
// a group against the configured Health Rubric — one 0–100 input per criterion —
// and the A–F letter updates FLUIDLY in the browser as inputs change (no fixed
// cadence), recomputed with the SAME pure facade the server uses, so the live
// preview matches what the audited RPC will persist. A manual override can force
// the letter under this-month / until-cleared scope. The grade is keyed to the
// current Ministry Year (passed in). The write goes through the audited action.

const LETTERS: GroupHealthLetter[] = ["A", "B", "C", "D", "F"];

const WRAP =
  "grid gap-3 rounded-sm border border-lineSoft bg-surface px-3.5 py-3";

// `lg-m-input` is the shared mobile input shim; `leading-snug` keeps the small
// numeric score inputs tight. Both wrap the shared field-input base.
const FIELD_INPUT = `lg-m-input ${fieldInputBaseClassName} leading-snug`;

export function GroupRubricGradeEntry({
  groupId,
  groupName,
  ministryYear,
  criteria,
  initialScores,
  initialOverrideLetter,
  initialOverrideScope,
}: {
  groupId: string;
  groupName: string;
  ministryYear: number;
  criteria: RubricCriterion[];
  initialScores: Record<string, number>;
  initialOverrideLetter: GroupHealthLetter | null;
  initialOverrideScope: GroupHealthOverrideScope | null;
}) {
  // Pull formRef out of the returned object: reading a ref member during render
  // (here, to bind the <form>) otherwise trips react-hooks/refs for every access
  // on the object. The rest keeps the `form.state` / `.pending` call sites.
  const { formRef, ...form } = useActionForm(adminSetGroupRubricGrade);

  const [scores, setScores] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const c of criteria) {
      const v = initialScores[c.key];
      out[c.key] = typeof v === "number" ? String(v) : "";
    }
    return out;
  });
  const [overrideLetter, setOverrideLetter] = useState<string>(
    initialOverrideLetter ?? ""
  );
  const [overrideScope, setOverrideScope] = useState<string>(
    initialOverrideScope ?? "this_month"
  );

  // The numeric scores object the facade grades (drop blanks; non-numeric → skip).
  const numericScores = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [key, raw] of Object.entries(scores)) {
      if (raw.trim() === "") continue;
      const n = Number(raw);
      if (Number.isFinite(n)) out[key] = n;
    }
    return out;
  }, [scores]);

  // Live grade preview — recomputed with the same pure facade the server uses.
  // periodMonth only matters for this-month expiry on resolution; for the live
  // preview we resolve as-of "now" so an active override shows immediately.
  const periodMonthIso = useMemo(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10);
  }, []);

  const live = useMemo(
    () =>
      resolveGroupRubricGrade({
        rubric: { criteria },
        scores: numericScores,
        override:
          overrideLetter !== "" && overrideScope !== ""
            ? {
                letter: overrideLetter as GroupHealthLetter,
                scope: overrideScope as GroupHealthOverrideScope,
              }
            : null,
        periodMonth: periodMonthIso,
      }),
    [criteria, numericScores, overrideLetter, overrideScope, periodMonthIso]
  );

  if (criteria.length === 0) {
    return (
      <div className={`${WRAP} font-sans text-sm text-ink3`}>
        No group Health Rubric is configured yet. Build one in Settings to grade
        this group.
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={form.formAction}
      className={WRAP}
      aria-label={`Group-Health Grade for ${groupName}`}
    >
      <input type="hidden" name="group_id" value={groupId} />
      <input type="hidden" name="ministry_year" value={ministryYear} />
      {/* The serialized scores the action validates — kept in sync with the
          per-criterion inputs so the server grades exactly what's previewed. */}
      <input
        type="hidden"
        name="criterion_scores"
        value={JSON.stringify(numericScores)}
      />

      <div className="flex items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <span className="font-sans text-sm font-medium text-ink3">
            Group-Health Grade
          </span>
          <span className="font-sans text-xs text-ink3">
            Ministry year {ministryYear}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-2xl leading-none text-sageDeep">
            {live.effective_letter ?? "—"}
          </span>
          {live.overridden ? (
            <span className="font-sans text-xs text-ink3">
              override (computed {live.computed_letter ?? "—"})
            </span>
          ) : (
            <span className="font-sans text-xs text-ink3">
              {live.numeric === null
                ? "no scores yet"
                : `${live.numeric.toFixed(1)} / 100`}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-2.5">
        {criteria.map((c) => {
          const inputId = `grg-${groupId}-${c.key}`;
          return (
            <div
              key={c.key}
              className="flex items-center justify-between gap-3"
            >
              <label htmlFor={inputId} className={FIELD_LABEL}>
                {c.label}{" "}
                <span className="font-normal text-ink3">(w{c.weight})</span>
              </label>
              <input
                id={inputId}
                className={`${FIELD_INPUT} max-w-24`}
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                value={scores[c.key] ?? ""}
                onChange={(e) =>
                  setScores((prev) => ({ ...prev, [c.key]: e.target.value }))
                }
                aria-label={`${c.label} score (0–100)`}
              />
            </div>
          );
        })}
      </div>

      <div className="grid gap-2 border-t border-line pt-2.5">
        <span className={FIELD_LABEL}>Manual override</span>
        <div className="flex flex-wrap gap-2">
          <select
            name="override_letter"
            className={`${FIELD_INPUT} max-w-36`}
            value={overrideLetter}
            onChange={(e) => setOverrideLetter(e.target.value)}
            aria-label="Override letter"
          >
            <option value="">No override</option>
            {LETTERS.map((l) => (
              <option key={l} value={l}>
                Force {l}
              </option>
            ))}
          </select>
          <select
            name="override_scope"
            className={`${FIELD_INPUT} max-w-44`}
            value={overrideScope}
            onChange={(e) => setOverrideScope(e.target.value)}
            disabled={overrideLetter === ""}
            aria-label="Override scope"
          >
            <option value="this_month">This month</option>
            <option value="until_cleared">Until cleared</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          disabled={form.pending}
          // The entry repeats per group (multi-group leaders; the Care
          // accordion, ADR 0023): start with the visible label (axe
          // label-in-name), then add the group.
          aria-label={`Save grade for ${groupName}`}
        >
          {form.pending ? "Saving…" : "Save grade"}
        </Button>
        <FormStatus state={form.state} successText="Grade saved." />
      </div>
    </form>
  );
}
