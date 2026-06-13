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
import {
  AUDIENCE_LABEL,
  groupTypeKey,
  type GroupTypeOption,
  type GroupTypeRef,
} from "@/lib/admin/audience";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import type {
  GroupAudienceCategory,
  MultiplicationCandidateStatus,
  MultiplicationMeetingTime,
} from "@/types/enums";

// Capacity & Multiplication #184: a same-group apprentice the candidate can be
// linked to. `label` already includes the readiness stage for the picker.
export type ApprenticeOption = { id: string; label: string };

// Design-system form field classes (12px uppercase label → full-width input
// with the global focus ring), plus the small shared helper-text and
// checkbox-label styles the planner's forms repeat.
const LABEL =
  "mb-1.5 block font-sans text-xs font-semibold uppercase tracking-wide text-ink3";
const INPUT =
  "w-full rounded-sm border border-line bg-surface px-3 py-2.5 font-sans text-base text-ink";
// Notes can run to 2000 chars; a single-line input hides all but a sliver of
// that, so notes use a multi-line, vertically resizable variant of INPUT.
const TEXTAREA = `${INPUT} min-h-[4.5rem] resize-y leading-normal`;
const HINT = "m-0 mt-1 font-sans text-xs text-ink3";
const CHECKBOX_LABEL = "flex items-center gap-2 font-sans text-sm text-ink";

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

// Props the type-first forms share: the selectable group types, the active
// groups per type, and the full apprentice map (the apprentice picker keys off
// whichever group is chosen).
type TypeGroupProps = {
  typeOptions: GroupTypeOption[];
  groupsByType: Record<string, GroupTypeRef[]>;
  apprenticesByGroup: Record<string, ApprenticeOption[]>;
};

// The reactive heart of the type-first candidate forms: the selected type drives
// which groups the "willing to multiply" picker offers, and the selected group
// drives which apprentices can be linked. Returns controlled state plus the
// derived audience/category (posted as hidden fields) and the filtered option
// lists. `effectiveGroupId` / `effectiveLeaderPipelineId` collapse a stale
// selection to "" when the type/group changes out from under it.
function useCandidateTypeGroup(opts: {
  typeOptions: GroupTypeOption[];
  groupsByType: Record<string, GroupTypeRef[]>;
  apprenticesByGroup: Record<string, ApprenticeOption[]>;
  initialAudience?: GroupAudienceCategory | null;
  initialCategoryId?: string | null;
  initialWilling?: boolean;
  initialGroupId?: string | null;
  initialGroupName?: string | null;
  initialLeaderPipelineId?: string | null;
  initialTypeLabel?: string | null;
}) {
  const initialTypeKey =
    opts.initialAudience && opts.initialCategoryId
      ? groupTypeKey(opts.initialAudience, opts.initialCategoryId)
      : "";
  const [typeKey, setTypeKey] = useState(initialTypeKey);
  const [willing, setWilling] = useState(opts.initialWilling ?? false);
  const [groupId, setGroupId] = useState(opts.initialGroupId ?? "");
  const [leaderPipelineId, setLeaderPipelineId] = useState(
    opts.initialLeaderPipelineId ?? ""
  );

  // Degraded-read safety (edit): if a category read failed or the candidate's
  // cell was deactivated, its type is absent from the loaded options. Keep it
  // selectable so editing other fields doesn't blank the now-required type and
  // make the candidate unsaveable.
  const typeOptions = useMemo(() => {
    if (
      !opts.initialAudience ||
      !opts.initialCategoryId ||
      opts.typeOptions.some(
        (t) => groupTypeKey(t.audienceCategory, t.categoryId) === initialTypeKey
      )
    ) {
      return opts.typeOptions;
    }
    return [
      {
        audienceCategory: opts.initialAudience,
        categoryId: opts.initialCategoryId,
        label: opts.initialTypeLabel ?? "Current type",
      },
      ...opts.typeOptions,
    ];
  }, [
    opts.typeOptions,
    opts.initialAudience,
    opts.initialCategoryId,
    opts.initialTypeLabel,
    initialTypeKey,
  ]);

  const selectedType = typeOptions.find(
    (t) => groupTypeKey(t.audienceCategory, t.categoryId) === typeKey
  );

  const groupsForType = useMemo(() => {
    const base = typeKey ? (opts.groupsByType[typeKey] ?? []) : [];
    // A candidate's own group is excluded from groupsByType server-side (it's
    // "used"), so inject it on edit to keep it selectable for its own type.
    if (
      opts.initialGroupId &&
      typeKey === initialTypeKey &&
      !base.some((g) => g.id === opts.initialGroupId)
    ) {
      return [
        {
          id: opts.initialGroupId,
          name: opts.initialGroupName ?? "Current group",
        },
        ...base,
      ];
    }
    return base;
  }, [
    typeKey,
    opts.groupsByType,
    opts.initialGroupId,
    opts.initialGroupName,
    initialTypeKey,
  ]);

  // The group picker is revealed by the willing checkbox (the requested UX) —
  // but a candidate that ALREADY has a group keeps the picker shown regardless,
  // so editing an unrelated field on a not-yet-willing-but-grouped candidate
  // never silently detaches its group. Detaching is then explicit (pick "none").
  const showGroupPicker = willing || Boolean(opts.initialGroupId);
  const effectiveGroupId =
    showGroupPicker && groupsForType.some((g) => g.id === groupId)
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
    typeKey,
    setTypeKey,
    willing,
    setWilling,
    showGroupPicker,
    groupId: effectiveGroupId,
    setGroupId,
    leaderPipelineId: effectiveLeaderPipelineId,
    setLeaderPipelineId,
    audience: selectedType?.audienceCategory ?? null,
    categoryId: selectedType?.categoryId ?? null,
    groupsForType,
    apprenticeOptions,
    typeOptions,
  };
}

type TypeGroupState = ReturnType<typeof useCandidateTypeGroup>;

// The top "group candidate" picker — a group type (audience × category). Posts
// the audience_category + category_id the candidate is anchored to.
function TypeField({
  idPrefix,
  state,
}: {
  idPrefix: string;
  state: TypeGroupState;
}) {
  return (
    <div>
      <label htmlFor={`${idPrefix}-type`} className={LABEL}>
        Group type
      </label>
      <select
        id={`${idPrefix}-type`}
        value={state.typeKey}
        onChange={(e) => state.setTypeKey(e.target.value)}
        className={INPUT}
      >
        <option value="" disabled>
          Select a type…
        </option>
        {state.typeOptions.map((t) => {
          const key = groupTypeKey(t.audienceCategory, t.categoryId);
          return (
            <option key={key} value={key}>
              {AUDIENCE_LABEL[t.audienceCategory]} · {t.label}
            </option>
          );
        })}
      </select>
      <input
        type="hidden"
        name="audience_category"
        value={state.audience ?? ""}
      />
      <input type="hidden" name="category_id" value={state.categoryId ?? ""} />
    </div>
  );
}

// The "Leader willing to multiply" checkbox and the group picker it reveals —
// the groups that carry the selected type. With willing unchecked, no group_id
// posts, so the candidate is saved as a type-only watch.
function WillingGroupField({
  idPrefix,
  state,
}: {
  idPrefix: string;
  state: TypeGroupState;
}) {
  return (
    <div className="grid gap-2">
      <label className={CHECKBOX_LABEL}>
        <input
          type="checkbox"
          name="shepherd_willing"
          checked={state.willing}
          onChange={(e) => state.setWilling(e.target.checked)}
        />
        Leader willing to multiply
      </label>
      {state.showGroupPicker ? (
        <div>
          <label htmlFor={`${idPrefix}-group`} className={LABEL}>
            Group multiplying
          </label>
          <select
            id={`${idPrefix}-group`}
            name="group_id"
            value={state.groupId}
            onChange={(e) => state.setGroupId(e.target.value)}
            // Disabled only when there's genuinely nothing to pick — NOT merely
            // when no type is selected. A legacy candidate on an Uncategorized
            // group has no type but its current group is injected as an option;
            // a disabled control wouldn't submit, silently dropping the group.
            disabled={state.groupsForType.length === 0}
            className={INPUT}
          >
            <option value="">Select a group…</option>
            {state.groupsForType.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <p className={HINT}>
            {state.groupsForType.length > 0
              ? "Groups that carry the selected type. Leave unset to track the type only."
              : state.typeKey
                ? "No active groups carry this type yet — leave it as a type-only watch."
                : "Pick a group type first."}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function CandidateEditForm({
  c,
  typeOptions,
  groupsByType,
  apprenticesByGroup,
}: { c: CandidateView } & TypeGroupProps) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminUpdateMultiplicationCandidate
  );
  const typeGroup = useCandidateTypeGroup({
    typeOptions,
    groupsByType,
    apprenticesByGroup,
    initialAudience: c.audience,
    initialCategoryId: c.categoryId,
    initialWilling: c.shepherdWilling,
    initialGroupId: c.groupId,
    initialGroupName: c.groupName,
    initialLeaderPipelineId: c.leaderPipelineId,
    initialTypeLabel: c.categoryLabel,
  });
  const {
    state: archiveState,
    formAction: archiveAction,
    pending: archivePending,
  } = useActionForm<{ id: string }>(adminArchiveMultiplicationCandidate);
  // Per-candidate field ids so each inline-edit label is programmatically tied
  // to its control even when several candidates render their edit forms at once.
  const fid = (name: string) => `mc-edit-${c.candidateId}-${name}`;
  return (
    <div className="mt-2.5 grid gap-2.5">
      <form action={formAction} className="grid gap-2.5">
        <input type="hidden" name="candidate_id" value={c.candidateId} />
        <TypeField idPrefix={`mc-edit-${c.candidateId}`} state={typeGroup} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-2.5">
          <div>
            <label htmlFor={fid("target_year")} className={LABEL}>
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
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor={fid("status")} className={LABEL}>
              Status
            </label>
            <select
              id={fid("status")}
              name="status"
              defaultValue={c.status}
              className={INPUT}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {CANDIDATE_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-2.5">
          <div>
            <label htmlFor={fid("successor_designate")} className={LABEL}>
              Successor / leader-designate
            </label>
            <input
              id={fid("successor_designate")}
              name="successor_designate"
              type="text"
              maxLength={120}
              defaultValue={c.successorDesignate ?? ""}
              placeholder="e.g. Tony L."
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor={fid("meeting_time")} className={LABEL}>
              Meeting time
            </label>
            <select
              id={fid("meeting_time")}
              name="meeting_time"
              defaultValue={c.meetingTime ?? ""}
              className={INPUT}
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
          <label htmlFor={fid("manual_member_count")} className={LABEL}>
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
            className={INPUT}
          />
          <p className={HINT}>
            Julian&rsquo;s headcount for this group, used for the &ldquo;12+
            members&rdquo; signal. Leave blank to use the in-app roster count (
            {c.activeMemberCount}).
          </p>
        </div>
        <WillingGroupField
          idPrefix={`mc-edit-${c.candidateId}`}
          state={typeGroup}
        />
        <div>
          <label htmlFor={fid("leader_pipeline_id")} className={LABEL}>
            Linked apprentice
          </label>
          <select
            id={fid("leader_pipeline_id")}
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
        <label className={CHECKBOX_LABEL}>
          <input
            type="checkbox"
            name="needs_similar_stage"
            defaultChecked={c.needsSimilarStage}
          />
          Need for a similar-stage group
        </label>
        <div>
          <label htmlFor={fid("notes")} className={LABEL}>
            Notes
          </label>
          <textarea
            id={fid("notes")}
            name="notes"
            maxLength={2000}
            rows={3}
            defaultValue={c.notes ?? ""}
            className={TEXTAREA}
          />
        </div>
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
  typeOptions,
  groupsByType,
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
          typeOptions={typeOptions}
          groupsByType={groupsByType}
          apprenticesByGroup={apprenticesByGroup}
        />
      ) : null}
    </div>
  );
}

function AddCandidateForm({
  typeOptions,
  groupsByType,
  apprenticesByGroup,
}: TypeGroupProps) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminCreateMultiplicationCandidate
  );
  const typeGroup = useCandidateTypeGroup({
    typeOptions,
    groupsByType,
    apprenticesByGroup,
  });
  const canSubmit =
    typeGroup.audience !== null && typeGroup.categoryId !== null;
  if (typeOptions.length === 0) {
    return (
      <p className="m-0 font-sans text-sm text-ink3">
        No active group types yet. Add one in Settings → Groups, then it will be
        selectable here.
      </p>
    );
  }
  return (
    <form action={formAction} className="grid gap-2.5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_1fr] md:gap-2.5">
        <TypeField idPrefix="mc-add" state={typeGroup} />
        <div>
          <label htmlFor="mc-year" className={LABEL}>
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
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="mc-status" className={LABEL}>
            Status
          </label>
          <select
            id="mc-status"
            name="status"
            defaultValue="watching"
            className={INPUT}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {CANDIDATE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-2.5">
        <div>
          <label htmlFor="mc-successor" className={LABEL}>
            Successor / leader-designate
          </label>
          <input
            id="mc-successor"
            name="successor_designate"
            type="text"
            maxLength={120}
            placeholder="e.g. Tony L."
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="mc-meeting-time" className={LABEL}>
            Meeting time
          </label>
          <select
            id="mc-meeting-time"
            name="meeting_time"
            defaultValue=""
            className={INPUT}
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
        <label htmlFor="mc-members" className={LABEL}>
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
          className={INPUT}
        />
        <p className={HINT}>
          Julian&rsquo;s headcount for the multiplying group. Leave blank to use
          the in-app roster count.
        </p>
      </div>
      <WillingGroupField idPrefix="mc-add" state={typeGroup} />
      <label className={CHECKBOX_LABEL}>
        <input type="checkbox" name="needs_similar_stage" />
        Need for a similar-stage group
      </label>
      <div>
        <label htmlFor="mc-notes" className={LABEL}>
          Notes
        </label>
        <textarea
          id="mc-notes"
          name="notes"
          maxLength={2000}
          rows={3}
          className={TEXTAREA}
        />
      </div>
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
          <p className={HINT}>Select a group type to enable Add to pipeline.</p>
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
          Groups at or over target with an apprentice ready to lead. Readiness
          is shown as context (&ldquo;meets N/5&rdquo;), not a gate &mdash; a
          group does not need to meet each criterion.
        </p>
      </header>
      {suggestions.map((s) => (
        // Tone (well/ready) rides a leading sage dot and the sageDeep "meets
        // N/N" figure — the card itself stays neutral (no tinted surface).
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
            <span className="font-sans text-sm font-medium tabular-nums text-sageDeep">
              meets {s.metCount}/{s.totalCount}
            </span>
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
  typeOptions,
  groupsByType,
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
            Groups slated to multiply, grouped by audience and life stage.
            Readiness chips reflect Julian&rsquo;s criteria; a group does not
            need to meet all of them. Filter by target year to resolve the 2026
            / 2027 split.
          </p>
        </header>

        <AddCandidateForm
          typeOptions={typeOptions}
          groupsByType={groupsByType}
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
                  typeOptions={typeOptions}
                  groupsByType={groupsByType}
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
