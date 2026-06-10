"use client";

import { useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminSetLeaderRubricGrade } from "@/app/(protected)/admin/shepherd-care/leader-grade-actions";
import {
  computeGrade,
  type Rubric,
  type RubricCriterion,
} from "@/lib/admin/health-rubric";
import type {
  GroupHealthOverrideScope,
  LeaderHealthLetter,
} from "@/types/enums";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import {
  fieldInputClassName as FIELD_INPUT,
  fieldLabelClassName as FIELD_LABEL,
  fieldLabelTextClassName as FIELD_LABEL_TEXT,
} from "@/components/admin/forms/field-styles";

// Care Leader-Health Grade entry (#378 / ADR 0018, pivot slice 5). A leader's
// per-criterion 0–100 scores roll up live to an A–F Leader-Health Grade (via the
// SAME pure engine the server recomputes with), with an optional manual override.
// The grade is keyed to the Ministry Year and posted to adminSetLeaderRubricGrade,
// which recomputes server-side before the audited write.
//
// Deliberately styled as its OWN card with a distinct "Leader-Health Grade"
// heading and a blue (informational) letter chip — visually and semantically
// separate from the Leader Care Status badge (a pastoral signal) shown elsewhere
// on the Care surface. The two are different concepts and must not read as the
// same thing.

const LETTERS: LeaderHealthLetter[] = ["A", "B", "C", "D", "F"];

const NOTE = "m-0 font-sans text-sm leading-relaxed text-ink2";

type ScoreRow = {
  key: string;
  label: string;
  // Held as a string so an in-progress / cleared edit doesn't snap to 0.
  score: string;
};

export function LeaderHealthGradeEditor({
  profileId,
  leaderName,
  ministryYear,
  criteria,
  initialScores,
  initialOverrideLetter,
  initialOverrideScope,
}: {
  profileId: string;
  leaderName: string;
  // The Ministry Year the grade is keyed to (its August-start calendar year).
  // Null in the Jun/Jul off-season — grading is closed then.
  ministryYear: number | null;
  criteria: RubricCriterion[];
  initialScores: Record<string, number>;
  initialOverrideLetter: LeaderHealthLetter | null;
  initialOverrideScope: GroupHealthOverrideScope | null;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminSetLeaderRubricGrade
  );

  const [rows, setRows] = useState<ScoreRow[]>(() =>
    criteria.map((c) => ({
      key: c.key,
      label: c.label,
      score:
        typeof initialScores[c.key] === "number"
          ? String(initialScores[c.key])
          : "",
    }))
  );
  const [overrideLetter, setOverrideLetter] = useState<string>(
    initialOverrideLetter ?? ""
  );
  const [overrideScope, setOverrideScope] = useState<string>(
    initialOverrideScope ?? "this_month"
  );

  const updateScore = (key: string, score: string) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, score } : r)));

  // Build the scores map for the live preview + the posted payload, skipping
  // blank (unscored) criteria so the engine renormalizes over what's present.
  const scores: Record<string, number> = {};
  for (const r of rows) {
    const n = Number(r.score);
    if (r.score.trim() !== "" && Number.isFinite(n)) scores[r.key] = n;
  }

  const rubric: Rubric = { criteria };
  // Live rubric letter — the SAME computeGrade the server recomputes with, so the
  // preview never lies about what will be persisted.
  const computed = computeGrade(rubric, scores);
  const hasOverride = overrideLetter !== "";
  const effectiveLetter = hasOverride
    ? (overrideLetter as LeaderHealthLetter)
    : computed.letter;

  const scoresJson = JSON.stringify(scores);
  const noRubric = criteria.length === 0;
  const offSeason = ministryYear === null;
  const canSave = !noRubric && !offSeason && !pending;

  if (offSeason) {
    return (
      <p className={NOTE}>
        Grading is closed during the June–July off-season — it resumes in the
        new ministry year (August).
      </p>
    );
  }

  if (noRubric) {
    return (
      <p className={NOTE}>
        No Leader-Health Rubric has been built yet. An admin can create one in
        Settings → Leader Health Rubric, then grade {leaderName} here.
      </p>
    );
  }

  return (
    <form
      action={formAction}
      className="grid gap-4"
      aria-label={`Leader-Health Grade for ${leaderName}`}
    >
      <input type="hidden" name="profile_id" value={profileId} />
      <input type="hidden" name="ministry_year" value={String(ministryYear)} />
      <input type="hidden" name="criterion_scores" value={scoresJson} />
      <input type="hidden" name="override_letter" value={overrideLetter} />
      <input
        type="hidden"
        name="override_scope"
        value={hasOverride ? overrideScope : ""}
      />

      <p className={NOTE}>
        Score {leaderName} on each criterion (0–100). The scores roll up to a
        Leader-Health Grade for the {ministryYear}–{(ministryYear ?? 0) + 1}{" "}
        ministry year. This is distinct from their Care Status.
      </p>

      <div className="grid gap-3">
        {rows.map((row) => (
          <div
            key={row.key}
            className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr,110px]"
          >
            <div>
              {/* Ids include the profile so repeated editors (one per Leader
                  in the Care accordion, ADR 0023) never collide. */}
              <label
                htmlFor={`leader-crit-${profileId}-${row.key}`}
                className={FIELD_LABEL}
              >
                {row.label}
              </label>
            </div>
            <div>
              <input
                id={`leader-crit-${profileId}-${row.key}`}
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                value={row.score}
                onChange={(e) => updateScore(row.key, e.target.value)}
                className={FIELD_INPUT}
                aria-label={`Score for ${row.label}`}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Live grade chip — blue (informational tint), deliberately NOT the Care
          Status badge's palette, so the Leader-Health Grade reads as its own
          thing. */}
      <div className="flex items-center gap-3 rounded-md bg-blueSoft px-3.5 py-3">
        <span className="font-sans text-sm font-medium text-blue">
          Leader-Health Grade
        </span>
        <span
          className="min-w-6 text-center font-display text-2xl leading-none text-blue"
          aria-label={
            effectiveLetter
              ? `Leader-Health Grade ${effectiveLetter}`
              : "Leader-Health Grade not yet scored"
          }
        >
          {effectiveLetter ?? "—"}
        </span>
        {hasOverride && computed.letter ? (
          <span className="font-sans text-xs text-blue">
            (overridden — rubric says {computed.letter})
          </span>
        ) : null}
      </div>

      <div className="grid gap-2">
        <span className={FIELD_LABEL_TEXT}>Override (optional)</span>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[160px,1fr]">
          <select
            name="override_letter_display"
            value={overrideLetter}
            onChange={(e) => setOverrideLetter(e.target.value)}
            className={FIELD_INPUT}
            aria-label="Override letter"
          >
            <option value="">No override (use rubric)</option>
            {LETTERS.map((l) => (
              <option key={l} value={l}>
                Force {l}
              </option>
            ))}
          </select>
          <select
            value={overrideScope}
            onChange={(e) => setOverrideScope(e.target.value)}
            disabled={!hasOverride}
            className={FIELD_INPUT}
            aria-label="Override scope"
          >
            <option value="this_month">This month only</option>
            <option value="until_cleared">Until cleared</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <PButton
          type="submit"
          tone="terra"
          size="md"
          disabled={!canSave}
          // Repeated per Leader in the Care accordion (ADR 0023): start with
          // the visible label (axe label-in-name), then add the leader.
          aria-label={`Save grade for ${leaderName}`}
        >
          {pending ? "Saving…" : "Save grade"}
        </PButton>
        <FormStatus state={state} successText="Leader-Health Grade saved." />
      </div>
    </form>
  );
}
