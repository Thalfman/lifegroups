"use client";

import { useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminSetHealthRubric } from "@/app/(protected)/admin/settings/actions";
import { P, fontBody } from "@/lib/pastoral";
import {
  RUBRIC_WEIGHT_TOTAL,
  type RubricCriterion,
} from "@/lib/admin/health-rubric";
import {
  fieldInputStyle,
  fieldLabelStyle,
} from "@/components/admin/forms/field-styles";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";

// Settings Health Rubric editor (#374 / ADR 0018). A client component that lets
// Julian add/remove/rename the group rubric's criteria and set each criterion's
// weight. Save is disabled until the weights total exactly 100 — the same gate
// validateRubric enforces server-side, so the client and the audited RPC reject
// identically. The criteria array is posted as a single `criteria` JSON string
// plus the rubric `kind` (group).

type DraftCriterion = {
  // A stable client-side id so React keys + rename survive reordering. NOT the
  // persisted `key` (which the operator never sees and we derive on submit).
  id: string;
  key: string;
  label: string;
  // Held as a string so an in-progress edit (empty / partial) doesn't snap to 0.
  weight: string;
};

let nextId = 0;
function freshId(): string {
  nextId += 1;
  return `c${nextId}`;
}

function toDraft(criteria: RubricCriterion[]): DraftCriterion[] {
  if (criteria.length === 0) {
    return [{ id: freshId(), key: "", label: "", weight: "" }];
  }
  return criteria.map((c) => ({
    id: freshId(),
    key: c.key,
    label: c.label,
    weight: String(c.weight),
  }));
}

// Derive a storage key from the label when the criterion has none yet, so the
// operator only ever types a human label. Slugged, lowercased, stable enough for
// a small hand-built list; the server re-validates uniqueness.
function deriveKey(draft: DraftCriterion, index: number): string {
  if (draft.key.trim().length > 0) return draft.key.trim();
  const slug = draft.label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug.length > 0 ? slug : `criterion_${index + 1}`;
}

export function HealthRubricEditor({
  criteria,
  // The rubric kind this editor edits. Defaults to "group" so existing callers
  // (the Group Health Rubric section) are unchanged; the Leader-Health Rubric
  // section passes "leader". The kind is posted as a hidden field and gates which
  // health_rubrics row admin_set_health_rubric upserts — one editor, both kinds.
  kind = "group",
  // The noun shown in the editor's blurb (e.g. "group" / "leader"), so the same
  // component reads naturally for either rubric.
  subjectLabel = "group",
}: {
  criteria: RubricCriterion[];
  kind?: "group" | "leader";
  subjectLabel?: string;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminSetHealthRubric
  );
  const [rows, setRows] = useState<DraftCriterion[]>(() => toDraft(criteria));

  const update = (id: string, patch: Partial<DraftCriterion>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));
  const add = () =>
    setRows((rs) => [...rs, { id: freshId(), key: "", label: "", weight: "" }]);

  const total = rows.reduce((sum, r) => {
    const n = Number(r.weight);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);

  const allLabelled = rows.every((r) => r.label.trim().length > 0);
  const weightsOk = total === RUBRIC_WEIGHT_TOTAL;
  const canSave = rows.length > 0 && allLabelled && weightsOk && !pending;

  // The criteria payload the server validates: derive each persisted key and
  // coerce the weight to a number. Posted as a hidden JSON field.
  const criteriaJson = JSON.stringify(
    rows.map((r, i) => ({
      key: deriveKey(r, i),
      label: r.label.trim(),
      weight: Number(r.weight) || 0,
    }))
  );

  return (
    <form action={formAction} style={{ display: "grid", gap: 16 }}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="criteria" value={criteriaJson} />

      <p style={noteStyle}>
        Build how a {subjectLabel} is graded: name each criterion and set its
        weight. The weights must total {RUBRIC_WEIGHT_TOTAL} before you can
        save.
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        {rows.map((row, idx) => (
          <div
            key={row.id}
            className="lg-m-grid-stack"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 110px auto",
              gap: 12,
              alignItems: "end",
            }}
          >
            <div>
              <label htmlFor={`crit-label-${row.id}`} style={fieldLabelStyle}>
                Criterion
              </label>
              <input
                id={`crit-label-${row.id}`}
                type="text"
                value={row.label}
                placeholder="e.g. Attendance"
                onChange={(e) => update(row.id, { label: e.target.value })}
                style={fieldInputStyle}
              />
            </div>
            <div>
              <label htmlFor={`crit-weight-${row.id}`} style={fieldLabelStyle}>
                Weight
              </label>
              <input
                id={`crit-weight-${row.id}`}
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                value={row.weight}
                onChange={(e) => update(row.id, { weight: e.target.value })}
                style={fieldInputStyle}
              />
            </div>
            <PButton
              type="button"
              tone="ghost"
              size="sm"
              onClick={() => remove(row.id)}
              disabled={rows.length <= 1}
              // Record context so the repeated control isn't a bare "Remove"
              // (Admin Interaction Model req 4 / a11y accessible-names gate).
              aria-label={`Remove ${
                row.label.trim() || `criterion ${idx + 1}`
              }`}
            >
              Remove
            </PButton>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <PButton type="button" tone="ghost" size="sm" onClick={add}>
          + Add criterion
        </PButton>
        <span
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: weightsOk ? "#3e4f29" : "#923220",
            fontWeight: 600,
          }}
        >
          Total: {total} / {RUBRIC_WEIGHT_TOTAL}
        </span>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <PButton type="submit" tone="terra" size="md" disabled={!canSave}>
          {pending ? "Saving…" : "Save rubric"}
        </PButton>
        <FormStatus state={state} successText="Rubric saved." />
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
