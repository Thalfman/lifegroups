"use client";

import { useMemo, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import {
  adminArchiveMultiplicationCandidate,
  adminCreateMultiplicationCandidate,
  adminUpdateMultiplicationCandidate,
} from "@/app/(protected)/admin/launch-planning/actions";
import {
  CANDIDATE_STATUS_LABEL,
  CRITERION_LABEL,
  filterSegmentsByYear,
  segmentAnchorId,
  summarizeTargetYears,
  type CandidateView,
  type MultiplicationCriterion,
  type ReadinessResult,
  type SegmentGroup,
  type TargetYearFilter,
} from "@/lib/admin/multiplication";
import { STAGE_LABEL } from "@/lib/admin/leader-pipeline";
import {
  CAPACITY_STATUS_LABEL,
  type SuggestedMultiplicationGroup,
} from "@/lib/admin/capacity-board";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import {
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
} from "@/components/admin/forms/field-styles";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import type {
  MultiplicationCandidateStatus,
  MultiplicationMeetingTime,
} from "@/types/enums";

// Capacity & Multiplication #184: a same-group apprentice the candidate can be
// linked to. `label` already includes the readiness stage for the picker.
export type ApprenticeOption = { id: string; label: string };

export type { CandidateView, SegmentGroup };

const STATUS_OPTIONS: MultiplicationCandidateStatus[] = [
  "watching",
  "planned",
  "launched",
  "deferred",
];

const MEETING_TIME_OPTIONS: MultiplicationMeetingTime[] = [
  "during_the_day",
  "evening",
];

const MEETING_TIME_LABEL: Record<MultiplicationMeetingTime, string> = {
  during_the_day: "During the day",
  evening: "Evening",
};

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

function CandidateEditForm({
  c,
  apprenticeOptions,
}: {
  c: CandidateView;
  apprenticeOptions: ApprenticeOption[];
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminUpdateMultiplicationCandidate
  );
  const {
    state: archiveState,
    formAction: archiveAction,
    pending: archivePending,
  } = useActionForm<{ id: string }>(adminArchiveMultiplicationCandidate);
  // Per-candidate field ids so each inline-edit label is programmatically tied
  // to its control even when several candidates render their edit forms at once.
  const fid = (name: string) => `mc-edit-${c.candidateId}-${name}`;
  return (
    <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
      <form action={formAction} style={{ display: "grid", gap: 10 }}>
        <input type="hidden" name="candidate_id" value={c.candidateId} />
        <div
          className="lg-m-grid-stack"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
        >
          <div>
            <label htmlFor={fid("target_year")} style={fieldLabelStyle}>
              Target year
            </label>
            <input
              id={fid("target_year")}
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
            <label htmlFor={fid("status")} style={fieldLabelStyle}>
              Status
            </label>
            <select
              id={fid("status")}
              name="status"
              defaultValue={c.status}
              style={fieldSelectStyle}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {CANDIDATE_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div
          className="lg-m-grid-stack"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
        >
          <div>
            <label htmlFor={fid("successor_designate")} style={fieldLabelStyle}>
              Successor / leader-designate
            </label>
            <input
              id={fid("successor_designate")}
              name="successor_designate"
              type="text"
              maxLength={120}
              defaultValue={c.successorDesignate ?? ""}
              placeholder="e.g. Tony L."
              style={fieldInputStyle}
            />
          </div>
          <div>
            <label htmlFor={fid("meeting_time")} style={fieldLabelStyle}>
              Meeting time
            </label>
            <select
              id={fid("meeting_time")}
              name="meeting_time"
              defaultValue={c.meetingTime ?? ""}
              style={fieldSelectStyle}
            >
              <option value="">Unset</option>
              {MEETING_TIME_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {MEETING_TIME_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor={fid("manual_member_count")} style={fieldLabelStyle}>
            Members (entered)
          </label>
          <input
            id={fid("manual_member_count")}
            name="manual_member_count"
            type="number"
            min={0}
            max={1000}
            inputMode="numeric"
            defaultValue={c.manualMemberCount ?? ""}
            placeholder={String(c.activeMemberCount)}
            style={fieldInputStyle}
          />
          <p
            style={{
              margin: "4px 0 0",
              fontFamily: fontBody,
              fontSize: 11,
              color: P.ink3,
            }}
          >
            Julian&rsquo;s headcount for this group, used for the &ldquo;12+
            members&rdquo; signal. Leave blank to use the in-app roster count (
            {c.activeMemberCount}).
          </p>
        </div>
        <div>
          <label htmlFor={fid("leader_pipeline_id")} style={fieldLabelStyle}>
            Linked apprentice
          </label>
          <select
            id={fid("leader_pipeline_id")}
            name="leader_pipeline_id"
            defaultValue={c.leaderPipelineId ?? ""}
            style={fieldSelectStyle}
          >
            <option value="">No apprentice linked</option>
            {apprenticeOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <p
            style={{
              margin: "4px 0 0",
              fontFamily: fontBody,
              fontSize: 11,
              color: P.ink3,
            }}
          >
            Only apprentices in this group can lead its next group. Add one in
            People → Apprentices.
          </p>
        </div>
        <label style={{ ...checkboxLabelStyle }}>
          <input
            type="checkbox"
            name="shepherd_willing"
            defaultChecked={c.shepherdWilling}
          />
          Leader willing to multiply
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
          <label htmlFor={fid("notes")} style={fieldLabelStyle}>
            Notes
          </label>
          <input
            id={fid("notes")}
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
          <FormStatus state={state} />
        </div>
      </form>
      <form action={archiveAction}>
        <input type="hidden" name="candidate_id" value={c.candidateId} />
        <PButton type="submit" tone="ghost" size="sm" disabled={archivePending}>
          {archivePending ? "Removing…" : "Remove from pipeline"}
        </PButton>
        <FormStatus state={archiveState} />
      </form>
    </div>
  );
}

function CandidateRow({
  c,
  apprenticeOptions,
}: {
  c: CandidateView;
  apprenticeOptions: ApprenticeOption[];
}) {
  const [editing, setEditing] = useState(false);
  // Doc-shaped read view: surface the planning facts Julian scans for — the
  // linked apprentice and its stage (R8), then successor/meeting time —
  // without opening the edit form.
  const facts: string[] = [];
  if (c.linkedApprentice) {
    facts.push(
      `Apprentice: ${c.linkedApprentice.displayName} (${STAGE_LABEL[c.linkedApprentice.stage]})`
    );
  } else if (c.successorDesignate) {
    facts.push(`Successor: ${c.successorDesignate}`);
  }
  if (c.meetingTime) facts.push(MEETING_TIME_LABEL[c.meetingTime]);
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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "baseline",
        }}
      >
        <strong style={{ fontFamily: fontBody, fontSize: 14, color: P.ink }}>
          {c.groupName}
        </strong>
        <span style={{ fontFamily: fontBody, fontSize: 12, color: P.ink2 }}>
          {CANDIDATE_STATUS_LABEL[c.status]}
          {c.targetYear ? ` · target ${c.targetYear}` : " · year TBD"} ·{" "}
          {c.memberCount} members
          {c.manualMemberCount != null ? " (entered)" : ""} ·{" "}
          {c.readiness.metCount}/{c.readiness.totalCount} criteria
        </span>
      </div>
      {facts.length > 0 ? (
        <span style={{ fontFamily: fontBody, fontSize: 12, color: P.ink3 }}>
          {facts.join(" · ")}
        </span>
      ) : null}
      <ReadinessChips readiness={c.readiness} />
      <button
        type="button"
        onClick={() => setEditing((v) => !v)}
        style={linkButtonStyle}
      >
        {editing ? "Close" : "Edit"}
      </button>
      {editing ? (
        <CandidateEditForm c={c} apprenticeOptions={apprenticeOptions} />
      ) : null}
    </div>
  );
}

function AddCandidateForm({
  availableGroups,
}: {
  availableGroups: { id: string; name: string }[];
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminCreateMultiplicationCandidate
  );
  if (availableGroups.length === 0) {
    return (
      <p
        style={{ fontFamily: fontBody, fontSize: 12, color: P.ink3, margin: 0 }}
      >
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
          <select
            id="mc-group"
            name="group_id"
            defaultValue=""
            style={fieldSelectStyle}
          >
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
          <select
            id="mc-status"
            name="status"
            defaultValue="watching"
            style={fieldSelectStyle}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {CANDIDATE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div
        className="lg-m-grid-stack"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
      >
        <div>
          <label htmlFor="mc-successor" style={fieldLabelStyle}>
            Successor / leader-designate
          </label>
          <input
            id="mc-successor"
            name="successor_designate"
            type="text"
            maxLength={120}
            placeholder="e.g. Tony L."
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label htmlFor="mc-meeting-time" style={fieldLabelStyle}>
            Meeting time
          </label>
          <select
            id="mc-meeting-time"
            name="meeting_time"
            defaultValue=""
            style={fieldSelectStyle}
          >
            <option value="">Unset</option>
            {MEETING_TIME_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {MEETING_TIME_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="mc-members" style={fieldLabelStyle}>
          Members (entered)
        </label>
        <input
          id="mc-members"
          name="manual_member_count"
          type="number"
          min={0}
          max={1000}
          inputMode="numeric"
          placeholder="e.g. 12"
          style={fieldInputStyle}
        />
        <p
          style={{
            margin: "4px 0 0",
            fontFamily: fontBody,
            fontSize: 11,
            color: P.ink3,
          }}
        >
          Julian&rsquo;s headcount for this group. Leave blank to use the in-app
          roster count.
        </p>
      </div>
      <label style={checkboxLabelStyle}>
        <input type="checkbox" name="shepherd_willing" />
        Leader willing to multiply
      </label>
      <label style={checkboxLabelStyle}>
        <input type="checkbox" name="needs_similar_stage" />
        Need for a similar-stage group
      </label>
      <div>
        <label htmlFor="mc-notes" style={fieldLabelStyle}>
          Notes
        </label>
        <input
          id="mc-notes"
          name="notes"
          type="text"
          maxLength={2000}
          style={fieldInputStyle}
        />
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <PButton type="submit" tone="terra" size="md" disabled={pending}>
          {pending ? "Adding…" : "Add to pipeline"}
        </PButton>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

function yearFilterLabel(year: number | null): string {
  return year === null ? "Year TBD" : String(year);
}

// R4: the target-year filter bar. Counts come from the full (unfiltered)
// segments so the split stays visible regardless of the active filter.
function YearFilterBar({
  segments,
  active,
  onChange,
}: {
  segments: SegmentGroup[];
  active: TargetYearFilter;
  onChange: (f: TargetYearFilter) => void;
}) {
  const tallies = useMemo(() => summarizeTargetYears(segments), [segments]);
  const total = tallies.reduce((sum, t) => sum + t.count, 0);
  const chips: { key: string; label: string; value: TargetYearFilter }[] = [
    { key: "all", label: `All · ${total}`, value: "all" },
    ...tallies.map((t) => ({
      key: t.year === null ? "tbd" : String(t.year),
      label: `${yearFilterLabel(t.year)} · ${t.count}`,
      value: t.year,
    })),
  ];
  return (
    <div
      role="group"
      aria-label="Filter by target year"
      style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
    >
      {chips.map((chip) => {
        const isActive = chip.value === active;
        return (
          <button
            key={chip.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(chip.value)}
            style={{
              fontFamily: fontBody,
              fontSize: 12,
              padding: "4px 12px",
              borderRadius: 999,
              cursor: "pointer",
              border: `1px solid ${isActive ? P.terra : P.line}`,
              background: isActive ? P.terraSoft : P.surface,
              color: isActive ? "#7d3621" : P.ink2,
              fontWeight: isActive ? 600 : 400,
            }}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}

function SuggestionsPanel({
  suggestions,
}: {
  suggestions: SuggestedMultiplicationGroup[];
}) {
  if (suggestions.length === 0) return null;
  return (
    <section
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 14,
        padding: "20px 22px",
        display: "grid",
        gap: 12,
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
          Suggested candidates
        </span>
        <p
          style={{
            margin: "6px 0 0",
            fontFamily: fontBody,
            fontSize: 12,
            color: P.ink3,
            lineHeight: 1.5,
          }}
        >
          Groups at or over target with an apprentice ready to lead. Readiness
          is shown as context (&ldquo;meets N/5&rdquo;), not a gate &mdash; a
          group does not need to meet each criterion.
        </p>
      </header>
      {suggestions.map((s) => (
        <div
          key={s.groupId}
          style={{
            border: `1px solid ${P.sage}`,
            background: P.sageSoft,
            borderRadius: 10,
            padding: "10px 14px",
            display: "grid",
            gap: 4,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              alignItems: "baseline",
              flexWrap: "wrap",
            }}
          >
            <strong
              style={{ fontFamily: fontBody, fontSize: 14, color: P.ink }}
            >
              {s.groupName}
            </strong>
            <span
              style={{ fontFamily: fontBody, fontSize: 12, color: "#3e4f29" }}
            >
              meets {s.metCount}/{s.totalCount}
            </span>
          </div>
          <span style={{ fontFamily: fontBody, fontSize: 12, color: P.ink2 }}>
            {s.segment} · {s.activeMemberCount}/{s.effectiveTarget ?? "—"} ·{" "}
            {CAPACITY_STATUS_LABEL[s.status]} · {s.readyApprentice.displayName}{" "}
            ready to lead
            {s.alreadyCandidate ? " · already in the plan" : ""}
          </span>
        </div>
      ))}
    </section>
  );
}

export function MultiplicationPlanner({
  segments,
  availableGroups,
  apprenticesByGroup,
  suggestions,
}: {
  segments: SegmentGroup[];
  availableGroups: { id: string; name: string }[];
  apprenticesByGroup: Record<string, ApprenticeOption[]>;
  suggestions: SuggestedMultiplicationGroup[];
}) {
  const [yearFilter, setYearFilter] = useState<TargetYearFilter>("all");
  const visible = useMemo(
    () => filterSegmentsByYear(segments, yearFilter),
    [segments, yearFilter]
  );
  return (
    <div style={{ display: "grid", gap: 24 }}>
      <SuggestionsPanel suggestions={suggestions} />
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
          <h2
            style={{
              margin: "4px 0 0",
              fontFamily: fontBody,
              fontSize: 18,
              color: P.ink,
              fontWeight: 600,
            }}
          >
            Candidate pipeline
          </h2>
          <p
            style={{
              margin: "6px 0 0",
              fontFamily: fontBody,
              fontSize: 12,
              color: P.ink3,
              lineHeight: 1.5,
            }}
          >
            Groups slated to multiply, grouped by audience and life stage.
            Readiness chips reflect Julian&rsquo;s criteria; a group does not
            need to meet all of them. Filter by target year to resolve the 2026
            / 2027 split.
          </p>
        </header>

        <AddCandidateForm availableGroups={availableGroups} />

        {segments.length === 0 ? null : (
          <YearFilterBar
            segments={segments}
            active={yearFilter}
            onChange={setYearFilter}
          />
        )}

        {segments.length === 0 ? (
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 13,
              color: P.ink2,
              margin: 0,
            }}
          >
            No candidates yet. Add a group above to start the pipeline.
          </p>
        ) : visible.length === 0 ? (
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 13,
              color: P.ink2,
              margin: 0,
            }}
          >
            No candidates match this target year.
          </p>
        ) : (
          visible.map((seg) => (
            <div
              key={seg.segment}
              id={segmentAnchorId(seg.segment)}
              // Leave room above the anchor so a deep-linked segment isn't
              // jammed against the viewport top after the hash scroll.
              style={{ display: "grid", gap: 8, scrollMarginTop: 96 }}
            >
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
                <CandidateRow
                  key={c.candidateId}
                  c={c}
                  apprenticeOptions={apprenticesByGroup[c.groupId] ?? []}
                />
              ))}
            </div>
          ))
        )}
      </section>
    </div>
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
