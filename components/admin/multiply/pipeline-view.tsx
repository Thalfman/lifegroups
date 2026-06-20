"use client";

import { useState, useTransition } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminSetGroupTypeInPipeline } from "@/app/(protected)/admin/multiply/actions";
import {
  CANDIDATE_STATUS_LABEL,
  CRITERION_LABEL,
  type MultiplicationCriterion,
  type PipelineTypeView,
} from "@/lib/admin/multiplication";
import {
  fieldLabelClassName as LABEL,
  fieldInputBaseClassName as INPUT,
  errorTextClassName as ERROR,
} from "@/components/admin/forms/field-styles";

// Multiply Pipeline (ADR 0030, slices #755 + #756): the type-first Pipeline. The
// admin pipelines a group type — recording the intent to launch another of it —
// and the existing active groups of that type auto-appear beneath it as
// potential candidates, with any saved candidates shown as locked-in. Every
// pipelined type renders even with nothing under it yet (never block). Adding /
// removing a type is a soft, audited flag flip (the config row is kept).
//
// Read-only at this stage: selecting a potential candidate to lock it in (the
// five-box readiness flow) arrives in #757, and the matched shepherds under each
// type arrive in #758. Each section carries a stable anchor id so the Readiness
// grid can deep-link into it (#759).
export function PipelineView({
  pipeline,
  groupTypes,
}: {
  pipeline: readonly PipelineTypeView[];
  groupTypes: readonly string[];
}) {
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  // Types not already pipelined, for the add control.
  const pipelinedKeys = new Set(pipeline.map((t) => t.type.toLowerCase()));
  const available = groupTypes.filter(
    (t) => !pipelinedKeys.has(t.toLowerCase())
  );

  function setInPipeline(groupType: string, inPipeline: boolean) {
    setError(undefined);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("group_type", groupType);
      formData.set("in_pipeline", inPipeline ? "true" : "false");
      const result = await adminSetGroupTypeInPipeline(undefined, formData);
      if (!result.ok) {
        setError(result.errors[0] ?? "That change wasn't saved. Try again.");
        return;
      }
      if (inPipeline) setSelected("");
      // revalidatePath("/admin/multiply") in the action refreshes the list.
    });
  }

  return (
    <section
      aria-labelledby="pipeline-intent-heading"
      className="grid gap-3 rounded-md border border-line bg-bg p-4"
    >
      <div className="grid gap-1">
        <h3
          id="pipeline-intent-heading"
          className="m-0 font-sans text-sm font-semibold text-ink"
        >
          Pipelined types
        </h3>
        <p className="m-0 font-sans text-sm text-ink2">
          Record the intent to launch another group of a type — even before a
          specific group is the one multiplying. The active groups of that type
          appear below as potential candidates.
        </p>
      </div>

      {pipeline.length === 0 ? (
        <p className="m-0 font-sans text-sm text-ink3">
          No types are in the pipeline yet. Add one below to start planning by
          type.
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0">
          {pipeline.map((type) => (
            <PipelineTypeSection
              key={type.type}
              type={type}
              pending={pending}
              onRemove={() => setInPipeline(type.type, false)}
            />
          ))}
        </ul>
      )}

      <div className="grid gap-1.5">
        <label htmlFor="pipeline-add-type" className={LABEL}>
          Add a type to the pipeline
        </label>
        <div className="flex items-start gap-2">
          <select
            id="pipeline-add-type"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className={INPUT}
            disabled={available.length === 0}
          >
            <option value="">
              {available.length === 0
                ? "All types are pipelined"
                : "Select a type…"}
            </option>
            {available.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <PButton
            type="button"
            tone="terra"
            size="md"
            onClick={() => selected && setInPipeline(selected, true)}
            disabled={pending || selected.length === 0}
          >
            {pending ? "Saving…" : "Add"}
          </PButton>
        </div>
      </div>

      {error ? (
        <p role="alert" className={ERROR}>
          {error}
        </p>
      ) : null}
    </section>
  );
}

// One pipelined type: its potential candidates (auto-listed active groups with
// no saved candidate, read-only) and its locked-in candidates (saved candidates
// with status / target year / readiness chips).
//
// The canonical `seg-<type>` deep-link anchor (`type.anchorId`) is still owned
// by the legacy MultiplicationPlanner rendered below on this tab, so we do NOT
// emit it here too — a pipelined type that also has saved candidates would
// otherwise duplicate the planner's segment id and make `#seg-…` ambiguous.
// `buildPipelineView` keeps `anchorId` as the data seam; #757 retires the
// planner and #759 wires the Readiness deep-link to this type-first section as
// its sole owner.
function PipelineTypeSection({
  type,
  pending,
  onRemove,
}: {
  type: PipelineTypeView;
  pending: boolean;
  onRemove: () => void;
}) {
  return (
    <li className="grid gap-3 rounded-sm border border-line bg-surface p-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="m-0 font-sans text-sm font-semibold text-ink">
          {type.type}
        </h4>
        <PButton
          type="button"
          tone="ghost"
          size="sm"
          onClick={onRemove}
          disabled={pending}
        >
          Remove
        </PButton>
      </div>

      <div className="grid gap-1">
        <p className="m-0 font-sans text-xs font-semibold uppercase tracking-wide text-ink3">
          Potential candidates
        </p>
        {type.potentialCandidates.length === 0 ? (
          <p className="m-0 font-sans text-sm text-ink3">
            No active groups of this type yet.
          </p>
        ) : (
          <ul className="m-0 grid list-none gap-1 p-0">
            {type.potentialCandidates.map((g) => (
              <li
                key={g.groupId}
                className="rounded-sm border border-line bg-bg px-2.5 py-1.5 font-sans text-sm text-ink"
              >
                {g.groupName}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-1">
        <p className="m-0 font-sans text-xs font-semibold uppercase tracking-wide text-ink3">
          Locked-in candidates
        </p>
        {type.lockedInCandidates.length === 0 ? (
          <p className="m-0 font-sans text-sm text-ink3">None locked in yet.</p>
        ) : (
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {type.lockedInCandidates.map((c) => (
              <li
                key={c.candidateId}
                className="grid gap-1 rounded-sm border border-line bg-bg px-2.5 py-1.5"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-sans text-sm font-medium text-ink">
                    {c.groupName}
                  </span>
                  <span className="rounded-sm bg-surface px-1.5 py-0.5 font-sans text-xs text-ink2">
                    {CANDIDATE_STATUS_LABEL[c.status]}
                  </span>
                  {/* target_year is nullable (TBD is a valid state) — show it
                      explicitly so a candidate with no year set still reads as a
                      tracked fact, not a missing field. */}
                  <span className="rounded-sm bg-surface px-1.5 py-0.5 font-sans text-xs text-ink2">
                    {c.targetYear != null ? c.targetYear : "Year TBD"}
                  </span>
                  <span className="font-sans text-xs text-ink3">
                    {c.readiness.metCount}/{c.readiness.totalCount} ready
                  </span>
                </div>
                {/* Render all five criteria with met / unmet styling (not just
                    the ticked ones) so the summary carries the full readiness
                    state — a 0/5 candidate still shows which boxes are unchecked.
                    The ✓ / ○ prefix is a non-colour cue for the met/unmet split. */}
                <ul className="m-0 flex flex-wrap list-none gap-1 p-0">
                  {(
                    Object.entries(c.readiness.criteria) as [
                      MultiplicationCriterion,
                      boolean,
                    ][]
                  ).map(([criterion, met]) => (
                    <li
                      key={criterion}
                      className={
                        met
                          ? "rounded-sm bg-tealSoft px-1.5 py-0.5 font-sans text-xs text-ink2"
                          : "rounded-sm bg-surface px-1.5 py-0.5 font-sans text-xs text-ink3"
                      }
                    >
                      {met ? "✓" : "○"} {CRITERION_LABEL[criterion]}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
