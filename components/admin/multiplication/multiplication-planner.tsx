"use client";

import { useMemo, useState } from "react";
import { NOTE_MAX_CHARS } from "@/lib/shared/limits";
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
import type { GroupOption } from "@/components/admin/launch-planning/launch-planning-data";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import { UNTYPED_SEGMENT } from "@/lib/admin/multiplication";
import type {
  MultiplicationCandidateStatus,
  MultiplicationMeetingTime,
} from "@/types/enums";
import {
  fieldLabelClassName as LABEL,
  fieldInputBaseClassName as INPUT,
} from "@/components/admin/forms/field-styles";
import { ReadinessChecklist } from "@/components/admin/multiply/readiness-checklist";

// Capacity & Multiplication #184: a same-group apprentice the candidate can be
// linked to. `label` already includes the readiness stage for the picker.
export type ApprenticeOption = { id: string; label: string };

// The planner's forms repeat a couple of small shared bits beyond the field
// input/label: a textarea variant for long notes plus helper-text and
// checkbox-label styles.
// Notes can run to 2000 chars; a single-line input hides all but a sliver of
// that, so notes use a multi-line, vertically resizable variant of INPUT.
const TEXTAREA = `${INPUT} min-h-[4.5rem] resize-y leading-normal`;
const HINT = "m-0 mt-1 font-sans text-xs text-ink3";

export type { CandidateView, SegmentGroup };

const STATUS_OPTIONS: MultiplicationCandidateStatus[] = [
  "watching",
  "planned",
  "launched",
  "deferred",
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
    <div className="flex flex-wrap gap-1.5">
      {CRITERIA_ORDER.map((c) => {
        const met = readiness.criteria[c];
        return (
          <Badge key={c} tone={met ? "sage" : "ghost"}>
            {met ? "✓ " : "· "}
            {CRITERION_LABEL[c]}
          </Badge>
        );
      })}
    </div>
  );
}

// Props the candidate forms share: the selectable groups (each carries its
// free-text type, which becomes the candidate's segment) and the full apprentice
// map (the apprentice picker keys off whichever group is chosen).
type TypeGroupProps = {
  groupOptions: GroupOption[];
  apprenticesByGroup: Record<string, ApprenticeOption[]>;
};

// The reactive heart of the candidate forms: a candidate anchors to a concrete
// group (its type is the group's group_type). The selected group drives which
// apprentices can be linked. Returns controlled state; a stale apprentice
// selection collapses to "" when the group changes out from under it.
function useCandidateTypeGroup(opts: {
  groupOptions: GroupOption[];
  apprenticesByGroup: Record<string, ApprenticeOption[]>;
  initialGroupId?: string | null;
  initialGroupName?: string | null;
  initialGroupType?: string | null;
  initialLeaderPipelineId?: string | null;
}) {
  const [groupId, setGroupId] = useState(opts.initialGroupId ?? "");
  const [leaderPipelineId, setLeaderPipelineId] = useState(
    opts.initialLeaderPipelineId ?? ""
  );

  // A candidate's own group is excluded from groupOptions server-side (it's
  // "used"), so inject it on edit to keep it selectable for its own candidate.
  const groupOptions = useMemo(() => {
    if (
      !opts.initialGroupId ||
      opts.groupOptions.some((g) => g.id === opts.initialGroupId)
    ) {
      return opts.groupOptions;
    }
    return [
      {
        id: opts.initialGroupId,
        name: opts.initialGroupName ?? "Current group",
        groupType: opts.initialGroupType ?? null,
      },
      ...opts.groupOptions,
    ];
  }, [
    opts.groupOptions,
    opts.initialGroupId,
    opts.initialGroupName,
    opts.initialGroupType,
  ]);

  const effectiveGroupId = groupOptions.some((g) => g.id === groupId)
    ? groupId
    : "";
  const apprenticeOptions = effectiveGroupId
    ? (opts.apprenticesByGroup[effectiveGroupId] ?? [])
    : [];
  const effectiveLeaderPipelineId = apprenticeOptions.some(
    (a) => a.id === leaderPipelineId
  )
    ? leaderPipelineId
    : "";

  return {
    groupId: effectiveGroupId,
    setGroupId,
    leaderPipelineId: effectiveLeaderPipelineId,
    setLeaderPipelineId,
    apprenticeOptions,
    groupOptions,
  };
}

type TypeGroupState = ReturnType<typeof useCandidateTypeGroup>;

// The "group candidate" picker — the concrete group this candidate anchors to.
// The candidate's type/segment is derived from the group's free-text group_type.
function GroupField({
  idPrefix,
  state,
}: {
  idPrefix: string;
  state: TypeGroupState;
}) {
  return (
    <div>
      <label htmlFor={`${idPrefix}-group`} className={LABEL}>
        Group multiplying
      </label>
      <select
        id={`${idPrefix}-group`}
        name="group_id"
        value={state.groupId}
        onChange={(e) => state.setGroupId(e.target.value)}
        className={INPUT}
      >
        <option value="" disabled>
          Select a group…
        </option>
        {state.groupOptions.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name} · {g.groupType ?? UNTYPED_SEGMENT}
          </option>
        ))}
      </select>
    </div>
  );
}

// ADR 0029 / 0030: the Multiplication Readiness Checklist now lives in the
// shared `@/components/admin/multiply/readiness-checklist` module (imported
// above), so both this legacy planner and the Pipeline lock-in form (#757)
// render the same five-checkbox block.

// Scope a field's element id to the form it renders in. The inline-edit form
// passes a per-candidate prefix so several edit forms can render at once without
// their label↔control associations colliding; the add form passes "mc-add".
function fieldId(prefix: string, name: string): string {
  return `${prefix}-${name}`;
}

// The candidate forms (add + inline edit) share these field blocks verbatim
// apart from their seeded values, so they live as one set of components rather
// than duplicated JSX in each form. Each ties its label to its control via a
// prefix-derived id.

function TargetYearField({
  idPrefix,
  defaultValue,
}: {
  idPrefix: string;
  defaultValue?: number | null;
}) {
  const id = fieldId(idPrefix, "target_year");
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        Target year
      </label>
      <input
        id={id}
        name="target_year"
        type="number"
        min={2024}
        max={2100}
        inputMode="numeric"
        defaultValue={defaultValue ?? ""}
        placeholder="2026"
        className={INPUT}
      />
    </div>
  );
}

function StatusField({
  idPrefix,
  defaultValue,
}: {
  idPrefix: string;
  defaultValue: MultiplicationCandidateStatus;
}) {
  const id = fieldId(idPrefix, "status");
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        Status
      </label>
      <select
        id={id}
        name="status"
        defaultValue={defaultValue}
        className={INPUT}
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {CANDIDATE_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    </div>
  );
}

function SuccessorField({
  idPrefix,
  defaultValue,
}: {
  idPrefix: string;
  defaultValue?: string | null;
}) {
  const id = fieldId(idPrefix, "successor_designate");
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        Successor / leader-designate
      </label>
      <input
        id={id}
        name="successor_designate"
        type="text"
        maxLength={120}
        defaultValue={defaultValue ?? ""}
        placeholder="e.g. Tony L."
        className={INPUT}
      />
    </div>
  );
}

function NotesField({
  idPrefix,
  defaultValue,
}: {
  idPrefix: string;
  defaultValue?: string | null;
}) {
  const id = fieldId(idPrefix, "notes");
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        Notes
      </label>
      <textarea
        id={id}
        name="notes"
        maxLength={NOTE_MAX_CHARS}
        rows={3}
        defaultValue={defaultValue ?? ""}
        className={TEXTAREA}
      />
    </div>
  );
}

function CandidateEditForm({
  c,
  groupOptions,
  apprenticesByGroup,
}: { c: CandidateView } & TypeGroupProps) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminUpdateMultiplicationCandidate
  );
  const typeGroup = useCandidateTypeGroup({
    groupOptions,
    apprenticesByGroup,
    initialGroupId: c.groupId,
    initialGroupName: c.groupName,
    initialGroupType: c.groupType,
    initialLeaderPipelineId: c.leaderPipelineId,
  });
  const {
    state: archiveState,
    formAction: archiveAction,
    pending: archivePending,
  } = useActionForm<{ id: string }>(adminArchiveMultiplicationCandidate);
  // Per-candidate field-id prefix so each inline-edit label is programmatically
  // tied to its control even when several candidates render their edit forms at
  // once.
  const idPrefix = `mc-edit-${c.candidateId}`;
  return (
    <div className="mt-2.5 grid gap-2.5">
      <form action={formAction} className="grid gap-2.5">
        <input type="hidden" name="candidate_id" value={c.candidateId} />
        {/* ADR 0030: the Meeting time and Members-entered controls left the
            form, but their columns stay (dormant — no data deletion). The
            update RPC writes both unconditionally, so without these the next
            edit-save would null out a candidate's existing values. Re-post them
            unchanged (matching the old form's round-trip: a set value is
            preserved, an unset one stays null). */}
        <input type="hidden" name="meeting_time" value={c.meetingTime ?? ""} />
        <input
          type="hidden"
          name="manual_member_count"
          value={c.manualMemberCount ?? ""}
        />
        <GroupField idPrefix={idPrefix} state={typeGroup} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-2.5">
          <TargetYearField idPrefix={idPrefix} defaultValue={c.targetYear} />
          <StatusField idPrefix={idPrefix} defaultValue={c.status} />
        </div>
        <SuccessorField
          idPrefix={idPrefix}
          defaultValue={c.successorDesignate}
        />
        <div>
          <label
            htmlFor={fieldId(idPrefix, "leader_pipeline_id")}
            className={LABEL}
          >
            Linked apprentice
          </label>
          <select
            id={fieldId(idPrefix, "leader_pipeline_id")}
            name="leader_pipeline_id"
            value={typeGroup.leaderPipelineId}
            onChange={(e) => typeGroup.setLeaderPipelineId(e.target.value)}
            disabled={!typeGroup.groupId}
            className={INPUT}
          >
            <option value="">No apprentice linked</option>
            {typeGroup.apprenticeOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <p className={HINT}>
            {typeGroup.groupId
              ? "Only apprentices in the multiplying group can lead its next group. Add one in People → Apprentices."
              : "Pick the multiplying group above to link one of its apprentices."}
          </p>
        </div>
        <NotesField idPrefix={idPrefix} defaultValue={c.notes} />
        <ReadinessChecklist
          idPrefix={idPrefix}
          defaults={{
            enough_members: c.enoughMembers,
            established_long_enough: c.establishedLongEnough,
            co_shepherd_tenured: c.coShepherdTenured,
            shepherd_willing: c.shepherdWilling,
            needs_similar_stage: c.needsSimilarStage,
          }}
        />
        <div className="flex items-center gap-2.5">
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
  groupOptions,
  apprenticesByGroup,
}: { c: CandidateView } & TypeGroupProps) {
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
    <div className="grid gap-2 rounded-sm border border-line px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-2.5">
        <strong className="font-sans text-base text-ink">{c.groupName}</strong>
        <span className="font-sans text-sm text-ink2">
          {CANDIDATE_STATUS_LABEL[c.status]}
          {c.targetYear ? ` · target ${c.targetYear}` : " · year TBD"} ·{" "}
          {c.memberCount} members
          {c.manualMemberCount != null ? " (entered)" : ""} ·{" "}
          {c.readiness.metCount}/{c.readiness.totalCount} criteria
        </span>
      </div>
      {facts.length > 0 ? (
        <span className="font-sans text-sm text-ink3">{facts.join(" · ")}</span>
      ) : null}
      <ReadinessChips readiness={c.readiness} />
      <Button
        type="button"
        variant="subtle"
        size="sm"
        className="justify-self-start"
        onClick={() => setEditing((v) => !v)}
      >
        {editing ? "Close" : "Edit"}
      </Button>
      {editing ? (
        <CandidateEditForm
          c={c}
          groupOptions={groupOptions}
          apprenticesByGroup={apprenticesByGroup}
        />
      ) : null}
    </div>
  );
}

function AddCandidateForm({
  groupOptions,
  apprenticesByGroup,
}: TypeGroupProps) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminCreateMultiplicationCandidate
  );
  const typeGroup = useCandidateTypeGroup({
    groupOptions,
    apprenticesByGroup,
  });
  const canSubmit = typeGroup.groupId !== "";
  if (groupOptions.length === 0) {
    return (
      <p className="m-0 font-sans text-sm text-ink3">
        No active groups available to add. Every active group is already in the
        pipeline, or none exist yet.
      </p>
    );
  }
  return (
    <form action={formAction} className="grid gap-2.5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_1fr] md:gap-2.5">
        <GroupField idPrefix="mc-add" state={typeGroup} />
        <TargetYearField idPrefix="mc-add" />
        <StatusField idPrefix="mc-add" defaultValue="watching" />
      </div>
      <SuccessorField idPrefix="mc-add" />
      <NotesField idPrefix="mc-add" />
      <ReadinessChecklist idPrefix="mc-add" />
      <div className="flex items-center gap-2.5">
        <PButton
          type="submit"
          tone="terra"
          size="md"
          disabled={pending || !canSubmit}
        >
          {pending ? "Adding…" : "Add to pipeline"}
        </PButton>
        {!canSubmit ? (
          <p className={HINT}>Select a group to enable Add to pipeline.</p>
        ) : null}
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
      className="flex flex-wrap gap-2"
    >
      {chips.map((chip) => {
        const isActive = chip.value === active;
        return (
          <button
            key={chip.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(chip.value)}
            className={cn(
              "cursor-pointer rounded-pill border px-3 py-1 font-sans text-xs transition-colors duration-150",
              isActive
                ? "border-clay bg-claySoft font-semibold text-clayDeep"
                : "border-line bg-surface font-normal text-ink2 hover:bg-surfaceAlt"
            )}
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
    <section className="grid gap-3 rounded-lg border border-line bg-surface p-card">
      <header>
        <span className="font-sans text-xs text-ink3">
          Suggested candidates
        </span>
        <p className="m-0 mt-1.5 font-sans text-sm leading-normal text-ink3">
          Groups at or over target with an apprentice ready to lead. Lock one in
          on the Pipeline below to assess its readiness checklist &mdash; a
          group does not need to meet each criterion.
        </p>
      </header>
      {suggestions.map((s) => (
        // Tone (well/ready) rides a leading sage dot — the card itself stays
        // neutral (no tinted surface).
        <div
          key={s.groupId}
          className="grid gap-1 rounded-sm border border-line bg-surface px-3.5 py-2.5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2.5">
            <strong className="flex items-baseline gap-2 font-sans text-base text-ink">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 self-center rounded-pill bg-sage"
              />
              {s.groupName}
            </strong>
          </div>
          <span className="font-sans text-sm text-ink2">
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
  groupOptions,
  apprenticesByGroup,
  suggestions,
}: {
  segments: SegmentGroup[];
  suggestions: SuggestedMultiplicationGroup[];
} & TypeGroupProps) {
  const [yearFilter, setYearFilter] = useState<TargetYearFilter>("all");
  const visible = useMemo(
    () => filterSegmentsByYear(segments, yearFilter),
    [segments, yearFilter]
  );
  return (
    <div className="grid gap-6">
      <SuggestionsPanel suggestions={suggestions} />
      <section className="grid gap-5 rounded-lg border border-line bg-surface p-card">
        <header>
          <span className="font-sans text-xs text-ink3">Multiplication</span>
          <h2 className="m-0 mt-1 font-display text-lg font-medium text-ink">
            Candidate pipeline
          </h2>
          <p className="m-0 mt-1.5 font-sans text-sm leading-normal text-ink3">
            Groups slated to multiply, grouped by group type. Readiness chips
            reflect Julian&rsquo;s criteria; a group does not need to meet all
            of them. Filter by target year to resolve the 2026 / 2027 split.
          </p>
        </header>

        <AddCandidateForm
          groupOptions={groupOptions}
          apprenticesByGroup={apprenticesByGroup}
        />

        {segments.length === 0 ? null : (
          <YearFilterBar
            segments={segments}
            active={yearFilter}
            onChange={setYearFilter}
          />
        )}

        {segments.length === 0 ? (
          <p className="m-0 font-sans text-sm text-ink2">
            No candidates yet. Add a group above to start the pipeline.
          </p>
        ) : visible.length === 0 ? (
          <p className="m-0 font-sans text-sm text-ink2">
            No candidates match this target year.
          </p>
        ) : (
          visible.map((seg) => (
            <div
              key={seg.segment}
              id={segmentAnchorId(seg.segment)}
              // Leave room above the anchor so a deep-linked segment isn't
              // jammed against the viewport top after the hash scroll.
              className="grid scroll-mt-24 gap-2"
            >
              <h3 className="m-0 font-sans text-xs font-semibold text-ink2">
                {seg.segment}
                <span className="font-normal tabular-nums text-ink3">
                  {" "}
                  · {seg.candidates.length}
                </span>
              </h3>
              {seg.candidates.map((c) => (
                <CandidateRow
                  key={c.candidateId}
                  c={c}
                  groupOptions={groupOptions}
                  apprenticesByGroup={apprenticesByGroup}
                />
              ))}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
