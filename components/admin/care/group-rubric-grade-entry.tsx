"use client";

import { useMemo, useState } from "react";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import {
  fieldInputClass,
  fieldInputStyle,
  fieldLabelStyle,
} from "@/components/admin/forms/field-styles";
import { adminSetGroupRubricGrade } from "@/app/(protected)/admin/group-health/grade-actions";
import { resolveGroupRubricGrade } from "@/lib/admin/group-rubric-grade";
import type { RubricCriterion } from "@/lib/admin/health-rubric";
import type {
  GroupHealthLetter,
  GroupHealthOverrideScope,
} from "@/types/enums";
import { P, fontBody, fontSans } from "@/lib/pastoral";

// Care Group-Health Grade entry (#377 / ADR 0018, Pivot slice 4). A grader scores
// a group against the configured Health Rubric — one 0–100 input per criterion —
// and the A–F letter updates FLUIDLY in the browser as inputs change (no fixed
// cadence), recomputed with the SAME pure facade the server uses, so the live
// preview matches what the audited RPC will persist. A manual override can force
// the letter under this-month / until-cleared scope. The grade is keyed to the
// current Ministry Year (passed in). The write goes through the audited action.

const LETTERS: GroupHealthLetter[] = ["A", "B", "C", "D", "F"];

const wrapStyle = {
  display: "grid",
  gap: 12,
  background: P.surface,
  border: `1px solid ${P.line2}`,
  borderRadius: 10,
  padding: "12px 14px",
} as const;

const letterBadgeStyle = {
  fontFamily: fontSans,
  fontSize: 24,
  fontWeight: 800,
  lineHeight: 1,
  color: P.sageTextStrong,
} as const;

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
  const form = useActionForm(adminSetGroupRubricGrade);

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
      <div
        style={{
          ...wrapStyle,
          fontFamily: fontBody,
          fontSize: 12.5,
          color: P.ink3,
        }}
      >
        No group Health Rubric is configured yet. Build one in Settings to grade
        this group.
      </div>
    );
  }

  return (
    <form
      ref={form.formRef}
      action={form.formAction}
      style={wrapStyle}
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

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "grid", gap: 2 }}>
          <span style={fieldLabelStyle}>Group-Health Grade</span>
          <span style={{ fontFamily: fontBody, fontSize: 11.5, color: P.ink3 }}>
            Ministry year {ministryYear}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={letterBadgeStyle}>{live.effective_letter ?? "—"}</span>
          {live.overridden ? (
            <span
              style={{
                fontFamily: fontBody,
                fontSize: 11,
                color: P.ink3,
              }}
            >
              override (computed {live.computed_letter ?? "—"})
            </span>
          ) : (
            <span style={{ fontFamily: fontBody, fontSize: 11, color: P.ink3 }}>
              {live.numeric === null
                ? "no scores yet"
                : `${live.numeric.toFixed(1)} / 100`}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {criteria.map((c) => {
          const inputId = `grg-${groupId}-${c.key}`;
          return (
            <div
              key={c.key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <label
                htmlFor={inputId}
                style={{ ...fieldLabelStyle, marginBottom: 0 }}
              >
                {c.label}{" "}
                <span style={{ color: P.ink3, fontWeight: 400 }}>
                  (w{c.weight})
                </span>
              </label>
              <input
                id={inputId}
                className={fieldInputClass}
                style={{ ...fieldInputStyle, maxWidth: 96 }}
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

      <div
        style={{
          display: "grid",
          gap: 8,
          borderTop: `1px solid ${P.line}`,
          paddingTop: 10,
        }}
      >
        <span style={fieldLabelStyle}>Manual override</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            name="override_letter"
            className={fieldInputClass}
            style={{ ...fieldInputStyle, maxWidth: 140 }}
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
            className={fieldInputClass}
            style={{ ...fieldInputStyle, maxWidth: 180 }}
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

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="submit"
          disabled={form.pending}
          className={fieldInputClass}
          style={{
            ...fieldInputStyle,
            cursor: form.pending ? "default" : "pointer",
            fontFamily: fontSans,
            fontWeight: 600,
            background: P.sageSoft,
            color: P.sageTextStrong,
            border: `1px solid ${P.sage}`,
            maxWidth: 160,
          }}
        >
          {form.pending ? "Saving…" : "Save grade"}
        </button>
        <FormStatus state={form.state} successText="Grade saved." />
      </div>
    </form>
  );
}
