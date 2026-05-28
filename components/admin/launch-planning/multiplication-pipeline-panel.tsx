"use client";

import { useActionState, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import {
  adminArchiveMultiplicationCandidate,
  adminCreateMultiplicationCandidate,
  adminUpdateMultiplicationCandidate,
} from "@/app/(protected)/admin/launch-planning/actions";
import {
  CANDIDATE_STATUS_LABEL,
  CRITERION_LABEL,
  type MultiplicationCriterion,
  type ReadinessResult,
} from "@/lib/admin/multiplication";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
} from "@/components/admin/forms/field-styles";
import type { ActionResult } from "@/lib/admin/action-result";
import type { MultiplicationCandidateStatus } from "@/types/enums";

type State = ActionResult<{ id: string }> | undefined;

export type CandidateView = {
  candidateId: string;
  groupName: string;
  segment: string;
  targetYear: number | null;
  status: MultiplicationCandidateStatus;
  shepherdWilling: boolean;
  needsSimilarStage: boolean;
  notes: string | null;
  activeMemberCount: number;
  readiness: ReadinessResult;
};

export type SegmentGroup = { segment: string; candidates: CandidateView[] };

const STATUS_OPTIONS: MultiplicationCandidateStatus[] = [
  "watching",
  "planned",
  "launched",
  "deferred",
];

const CRITERIA_ORDER: MultiplicationCriterion[] = [
  "enough_members",
  "established_long_enough",
  "co_shepherd_tenured",
  "shepherd_willing",
  "needs_similar_stage",
];

function ReadinessChips({ readiness }: { readiness: ReadinessResult }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {CRITERIA_ORDER.map((c) => {
        const met = readiness.criteria[c];
        return (
          <span
            key={c}
            style={{
              fontFamily: fontBody,
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 999,
              border: `1px solid ${met ? P.sage : P.line}`,
              background: met ? P.sageSoft : P.bg,
              color: met ? P.ink : P.ink3,
            }}
          >
            {met ? "✓ " : "· "}
            {CRITERION_LABEL[c]}
          </span>
        );
      })}
    </div>
  );
}

function CandidateEditForm({ c }: { c: CandidateView }) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminUpdateMultiplicationCandidate,
    undefined,
  );
  const [archiveState, archiveAction, archivePending] = useActionState<State, FormData>(
    adminArchiveMultiplicationCandidate,
    undefined,
  );
  return (
    <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
      <form action={formAction} style={{ display: "grid", gap: 10 }}>
        <input type="hidden" name="candidate_id" value={c.candidateId} />
        <div
          className="lg-m-grid-stack"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
        >
          <div>
            <label style={fieldLabelStyle}>Target year</label>
            <input
              name="target_year"
              type="number"
              min={2024}
              max={2100}
              inputMode="numeric"
              defaultValue={c.targetYear ?? ""}
              placeholder="2026"
              style={fieldInputStyle}
            />
          </div>
          <div>
            <label style={fieldLabelStyle}>Status</label>
            <select name="status" defaultValue={c.status} style={fieldSelectStyle}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {CANDIDATE_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label style={{ ...checkboxLabelStyle }}>
          <input type="checkbox" name="shepherd_willing" defaultChecked={c.shepherdWilling} />
          Shepherd willing to multiply
        </label>
        <label style={{ ...checkboxLabelStyle }}>
          <input
            type="checkbox"
            name="needs_similar_stage"
            defaultChecked={c.needsSimilarStage}
          />
          Need for a similar-stage group
        </label>
        <div>
          <label style={fieldLabelStyle}>Notes</label>
          <input
            name="notes"
            type="text"
            maxLength={2000}
            defaultValue={c.notes ?? ""}
            style={fieldInputStyle}
          />
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <PButton type="submit" tone="terra" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </PButton>
          {state && !state.ok ? (
            <span style={errorTextStyle}>{state.errors[0]}</span>
          ) : null}
        </div>
      </form>
      <form action={archiveAction}>
        <input type="hidden" name="candidate_id" value={c.candidateId} />
        <PButton type="submit" tone="ghost" size="sm" disabled={archivePending}>
          {archivePending ? "Removing…" : "Remove from pipeline"}
        </PButton>
        {archiveState && !archiveState.ok ? (
          <span style={errorTextStyle}>{archiveState.errors[0]}</span>
        ) : null}
      </form>
    </div>
  );
}

function CandidateRow({ c }: { c: CandidateView }) {
  const [editing, setEditing] = useState(false);
  return (
    <div
      style={{
        border: `1px solid ${P.line}`,
        borderRadius: 10,
        padding: "12px 14px",
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <strong style={{ fontFamily: fontBody, fontSize: 14, color: P.ink }}>
          {c.groupName}
        </strong>
        <span style={{ fontFamily: fontBody, fontSize: 12, color: P.ink2 }}>
          {CANDIDATE_STATUS_LABEL[c.status]}
          {c.targetYear ? ` · target ${c.targetYear}` : ""} · {c.activeMemberCount} members ·{" "}
          {c.readiness.metCount}/{c.readiness.totalCount} criteria
        </span>
      </div>
      <ReadinessChips readiness={c.readiness} />
      <button
        type="button"
        onClick={() => setEditing((v) => !v)}
        style={linkButtonStyle}
      >
        {editing ? "Close" : "Edit"}
      </button>
      {editing ? <CandidateEditForm c={c} /> : null}
    </div>
  );
}

function AddCandidateForm({ availableGroups }: { availableGroups: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminCreateMultiplicationCandidate,
    undefined,
  );
  if (availableGroups.length === 0) {
    return (
      <p style={{ fontFamily: fontBody, fontSize: 12, color: P.ink3, margin: 0 }}>
        Every active group is already in the pipeline.
      </p>
    );
  }
  return (
    <form action={formAction} style={{ display: "grid", gap: 10 }}>
      <div
        className="lg-m-grid-stack"
        style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}
      >
        <div>
          <label htmlFor="mc-group" style={fieldLabelStyle}>
            Group
          </label>
          <select id="mc-group" name="group_id" defaultValue="" style={fieldSelectStyle}>
            <option value="" disabled>
              Select a group…
            </option>
            {availableGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mc-year" style={fieldLabelStyle}>
            Target year
          </label>
          <input
            id="mc-year"
            name="target_year"
            type="number"
            min={2024}
            max={2100}
            inputMode="numeric"
            placeholder="2026"
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label htmlFor="mc-status" style={fieldLabelStyle}>
            Status
          </label>
          <select id="mc-status" name="status" defaultValue="watching" style={fieldSelectStyle}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {CANDIDATE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label style={checkboxLabelStyle}>
        <input type="checkbox" name="shepherd_willing" />
        Shepherd willing to multiply
      </label>
      <label style={checkboxLabelStyle}>
        <input type="checkbox" name="needs_similar_stage" />
        Need for a similar-stage group
      </label>
      <div>
        <label htmlFor="mc-notes" style={fieldLabelStyle}>
          Notes
        </label>
        <input id="mc-notes" name="notes" type="text" maxLength={2000} style={fieldInputStyle} />
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <PButton type="submit" tone="terra" size="md" disabled={pending}>
          {pending ? "Adding…" : "Add to pipeline"}
        </PButton>
        {state && !state.ok ? <span style={errorTextStyle}>{state.errors[0]}</span> : null}
      </div>
    </form>
  );
}

export function MultiplicationPipelinePanel({
  segments,
  availableGroups,
}: {
  segments: SegmentGroup[];
  availableGroups: { id: string; name: string }[];
}) {
  return (
    <section
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 14,
        padding: "22px 24px",
        display: "grid",
        gap: 18,
      }}
    >
      <header>
        <span
          style={{
            fontFamily: fontSans,
            fontSize: 10,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            color: P.ink3,
            fontWeight: 600,
          }}
        >
          Multiplication
        </span>
        <h2 style={{ margin: "4px 0 0", fontFamily: fontBody, fontSize: 18, color: P.ink, fontWeight: 600 }}>
          Candidate pipeline
        </h2>
        <p style={{ margin: "6px 0 0", fontFamily: fontBody, fontSize: 12, color: P.ink3, lineHeight: 1.5 }}>
          Groups slated to multiply, grouped by audience and life stage.
          Readiness chips reflect Julian&rsquo;s criteria; a group does not need
          to meet all of them.
        </p>
      </header>

      <AddCandidateForm availableGroups={availableGroups} />

      {segments.length === 0 ? (
        <p style={{ fontFamily: fontBody, fontSize: 13, color: P.ink2, margin: 0 }}>
          No candidates yet. Add a group above to start the pipeline.
        </p>
      ) : (
        segments.map((seg) => (
          <div key={seg.segment} style={{ display: "grid", gap: 8 }}>
            <h3
              style={{
                margin: 0,
                fontFamily: fontSans,
                fontSize: 11,
                letterSpacing: 0.8,
                textTransform: "uppercase",
                color: P.ink2,
                fontWeight: 600,
              }}
            >
              {seg.segment}
              <span style={{ color: P.ink3, fontWeight: 400 }}>
                {" "}
                · {seg.candidates.length}
              </span>
            </h3>
            {seg.candidates.map((c) => (
              <CandidateRow key={c.candidateId} c={c} />
            ))}
          </div>
        ))
      )}
    </section>
  );
}

const checkboxLabelStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontFamily: fontBody,
  fontSize: 13,
  color: P.ink,
} as const;

const linkButtonStyle = {
  justifySelf: "start",
  fontFamily: fontBody,
  fontSize: 12,
  color: P.terra,
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  textDecoration: "underline",
} as const;
