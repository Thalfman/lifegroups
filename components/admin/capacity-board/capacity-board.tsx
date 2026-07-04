"use client";

import { useMemo, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminSetGroupCapacityTarget } from "@/app/(protected)/admin/launch-planning/actions";
import {
  CAPACITY_STATUS_LABEL,
  filterBoard,
  type CapacityBoardModel,
  type CapacityBoardRow,
  type SuggestedMultiplicationGroup,
} from "@/lib/admin/capacity-board";
import { STAGE_LABEL } from "@/lib/admin/leader-pipeline";
import { cn } from "@/lib/utils";
import {
  fieldInputClassName,
  fieldLabelClassName,
  fieldSelectClassName,
} from "@/components/admin/forms/field-styles";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import type { CapacityStatus } from "@/lib/admin/metrics";

// The small uppercase eyebrow label sitting above a section title.
const EYEBROW =
  "font-sans text-[10px] font-semibold uppercase tracking-[1.5px] text-ink3";

// Status → swatch colour. Full reads "action implied" (terra); Open by choice
// is intentional (sage); Filling is the warning band; Room is calm.
const STATUS_STYLE: Record<CapacityStatus, string> = {
  ok: "border-line bg-bg text-ink2",
  warning: "border-amber bg-amberSoft text-amberText",
  full: "border-clay bg-claySoft text-clayDeep",
  open_by_choice: "border-sage bg-sageSoft text-sageDeep",
  unknown: "border-line bg-bg text-ink3",
  excluded: "border-line bg-bg text-ink3",
};

function StatusPill({ status }: { status: CapacityStatus }) {
  return (
    <span
      className={`whitespace-nowrap rounded-pill border px-2 py-0.5 font-sans text-2xs ${STATUS_STYLE[status]}`}
    >
      {CAPACITY_STATUS_LABEL[status]}
    </span>
  );
}

function ReadyToMultiplyBadge() {
  return (
    <span className="whitespace-nowrap rounded-pill border border-sage bg-sageSoft px-2 py-0.5 font-sans text-2xs font-semibold text-sageDeep">
      ✓ Ready to multiply
    </span>
  );
}

function TargetEditor({ row }: { row: CapacityBoardRow }) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminSetGroupCapacityTarget
  );
  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="group_id" value={row.groupId} />
      <input
        name="target"
        type="number"
        min={1}
        max={500}
        inputMode="numeric"
        defaultValue={row.effectiveTarget ?? ""}
        aria-label={`Target size for ${row.groupName}`}
        className={cn(fieldInputClassName, "w-[72px] px-2 py-1.5")}
      />
      <PButton type="submit" tone="ghost" size="sm" disabled={pending}>
        {pending ? "…" : "Set"}
      </PButton>
      <FormStatus state={state} />
    </form>
  );
}

function BoardRow({ row }: { row: CapacityBoardRow }) {
  return (
    <div className="grid gap-2 rounded-sm border border-line px-3.5 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2.5">
        <strong className="font-sans text-base text-ink">
          {row.groupName}
        </strong>
        <span className="font-sans text-xs text-ink3">{row.segment}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="font-sans text-sm text-ink">
          {row.activeMemberCount} / {row.effectiveTarget ?? "—"} members
        </span>
        <StatusPill status={row.status} />
        {row.readyToMultiply ? <ReadyToMultiplyBadge /> : null}
        {row.readyApprentice ? (
          <span className="font-sans text-xs text-ink2">
            Apprentice: {row.readyApprentice.displayName} (
            {STAGE_LABEL[row.readyApprentice.stage]})
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className={fieldLabelClassName}>Target</span>
        <TargetEditor row={row} />
      </div>
    </div>
  );
}

function SuggestionRow({ s }: { s: SuggestedMultiplicationGroup }) {
  return (
    <div className="grid gap-1 rounded-sm border border-sage bg-sageSoft px-3.5 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2.5">
        <strong className="font-sans text-base text-ink">{s.groupName}</strong>
        {/* ADR 0029 decision 3: no "meets X/5" — a pre-candidate group has no
            stored readiness flags to assess, so the annotation is suppressed
            rather than reporting a false zero. */}
      </div>
      <span className="font-sans text-xs text-ink2">
        {s.segment} · {s.activeMemberCount}/{s.effectiveTarget ?? "—"} ·{" "}
        {CAPACITY_STATUS_LABEL[s.status]} · {s.readyApprentice.displayName}{" "}
        ready to lead
        {s.alreadyCandidate ? " · already in the plan" : ""}
      </span>
    </div>
  );
}

const STATUS_OPTIONS: CapacityStatus[] = [
  "ok",
  "warning",
  "full",
  "open_by_choice",
  "unknown",
  "excluded",
];

export function CapacityBoard({ model }: { model: CapacityBoardModel }) {
  const [segment, setSegment] = useState<string>("all");
  const [status, setStatus] = useState<CapacityStatus | "all">("all");

  const visible = useMemo(
    () =>
      filterBoard(model.rows, {
        segment: segment === "all" ? null : segment,
        status: status === "all" ? null : status,
      }),
    [model.rows, segment, status]
  );

  return (
    <div className="grid gap-6">
      {model.suggestions.length > 0 ? (
        <section className="grid gap-3 rounded-lg border border-line bg-surface px-[22px] py-5">
          <header>
            <span className={EYEBROW}>Suggested to multiply</span>
            <p className="m-0 mt-1.5 font-sans text-xs leading-normal text-ink3">
              Groups at or over target with an apprentice ready to lead. The
              5-criterion readiness is shown as context (&ldquo;meets
              N/5&rdquo;), not a gate.
            </p>
          </header>
          {model.suggestions.map((s) => (
            <SuggestionRow key={s.groupId} s={s} />
          ))}
        </section>
      ) : null}

      <section className="grid gap-4 rounded-lg border border-line bg-surface px-6 py-[22px]">
        <header>
          <span className={EYEBROW}>Capacity board</span>
          <h2 className="m-0 mt-1 font-sans text-[18px] font-semibold text-ink">
            All active groups · {model.rows.length}
          </h2>
        </header>

        <div className="lg-m-grid-stack grid grid-cols-2 gap-2.5">
          <div>
            <label htmlFor="cb-segment" className={fieldLabelClassName}>
              Group type
            </label>
            <select
              id="cb-segment"
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
              className={fieldSelectClassName}
            >
              <option value="all">All group types</option>
              {model.segments.map((seg) => (
                <option key={seg} value={seg}>
                  {seg}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cb-status" className={fieldLabelClassName}>
              Status
            </label>
            <select
              id="cb-status"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as CapacityStatus | "all")
              }
              className={fieldSelectClassName}
            >
              <option value="all">All statuses</option>
              {STATUS_OPTIONS.map((st) => (
                <option key={st} value={st}>
                  {CAPACITY_STATUS_LABEL[st]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="m-0 font-sans text-sm text-ink2">
            No groups match these filters.
          </p>
        ) : (
          visible.map((row) => <BoardRow key={row.groupId} row={row} />)
        )}
      </section>
    </div>
  );
}
