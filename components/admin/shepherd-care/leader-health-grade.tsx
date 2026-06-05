"use client";

import { useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminSetLeaderRubricGrade } from "@/app/(protected)/admin/shepherd-care/leader-grade-actions";
import { P, fontBody, fontSans } from "@/lib/pastoral";
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
  fieldInputStyle,
  fieldLabelStyle,
} from "@/components/admin/forms/field-styles";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";

// Care Leader-Health Grade entry (#378 / ADR 0018, pivot slice 5). A leader's
// per-criterion 0–100 scores roll up live to an A–F Leader-Health Grade (via the
// SAME pure engine the server recomputes with), with an optional manual override.
// The grade is keyed to the Ministry Year and posted to adminSetLeaderRubricGrade,
// which recomputes server-side before the audited write.
//
// Deliberately styled as its OWN card with a distinct "Leader-Health Grade"
// heading and an indigo letter chip — visually and semantically separate from the
// Leader Care Status badge (a pastoral signal) shown elsewhere on the Care
// surface. The two are different concepts and must not read as the same thing.

const LETTERS: LeaderHealthLetter[] = ["A", "B", "C", "D", "F"];

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
      <p style={noteStyle}>
        Grading is closed during the June–July off-season — it resumes in the
        new ministry year (August).
      </p>
    );
  }

  if (noRubric) {
    return (
      <p style={noteStyle}>
        No Leader-Health Rubric has been built yet. An admin can create one in
        Settings → Leader Health Rubric, then grade {leaderName} here.
      </p>
    );
  }

  return (
    <form action={formAction} style={{ display: "grid", gap: 16 }}>
      <input type="hidden" name="profile_id" value={profileId} />
      <input type="hidden" name="ministry_year" value={String(ministryYear)} />
      <input type="hidden" name="criterion_scores" value={scoresJson} />
      <input type="hidden" name="override_letter" value={overrideLetter} />
      <input
        type="hidden"
        name="override_scope"
        value={hasOverride ? overrideScope : ""}
      />

      <p style={noteStyle}>
        Score {leaderName} on each criterion (0–100). The scores roll up to a
        Leader-Health Grade for the {ministryYear}–{(ministryYear ?? 0) + 1}{" "}
        ministry year. This is distinct from their Care Status.
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        {rows.map((row) => (
          <div
            key={row.key}
            className="lg-m-grid-stack"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 110px",
              gap: 12,
              alignItems: "end",
            }}
          >
            <div>
              <label htmlFor={`leader-crit-${row.key}`} style={fieldLabelStyle}>
                {row.label}
              </label>
            </div>
            <div>
              <input
                id={`leader-crit-${row.key}`}
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                value={row.score}
                onChange={(e) => updateScore(row.key, e.target.value)}
                style={fieldInputStyle}
                aria-label={`Score for ${row.label}`}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Live grade chip — indigo, deliberately NOT the Care Status badge's
          palette, so the Leader-Health Grade reads as its own thing. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 14px",
          borderRadius: 10,
          background: "#eef0fb",
          border: "1px solid #c8cdf0",
        }}
      >
        <span
          style={{
            fontFamily: fontSans,
            fontSize: 10,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            color: "#3a3f7a",
            fontWeight: 700,
          }}
        >
          Leader-Health Grade
        </span>
        <span
          style={{
            fontFamily: fontSans,
            fontSize: 22,
            fontWeight: 800,
            color: "#2b2f63",
            minWidth: 24,
            textAlign: "center",
          }}
          aria-label={
            effectiveLetter
              ? `Leader-Health Grade ${effectiveLetter}`
              : "Leader-Health Grade not yet scored"
          }
        >
          {effectiveLetter ?? "—"}
        </span>
        {hasOverride && computed.letter ? (
          <span
            style={{
              fontFamily: fontBody,
              fontSize: 12,
              color: "#3a3f7a",
            }}
          >
            (overridden — rubric says {computed.letter})
          </span>
        ) : null}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <span style={fieldLabelStyle}>Override (optional)</span>
        <div
          className="lg-m-grid-stack"
          style={{
            display: "grid",
            gridTemplateColumns: "160px 1fr",
            gap: 12,
          }}
        >
          <select
            name="override_letter_display"
            value={overrideLetter}
            onChange={(e) => setOverrideLetter(e.target.value)}
            style={fieldInputStyle}
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
            style={fieldInputStyle}
            aria-label="Override scope"
          >
            <option value="this_month">This month only</option>
            <option value="until_cleared">Until cleared</option>
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <PButton type="submit" tone="terra" size="md" disabled={!canSave}>
          {pending ? "Saving…" : "Save grade"}
        </PButton>
        <FormStatus state={state} successText="Leader-Health Grade saved." />
      </div>
    </form>
  );
}

const noteStyle = {
  fontFamily: fontBody,
  fontSize: 13,
  color: P.ink2,
  margin: 0,
  lineHeight: 1.55,
} as const;
