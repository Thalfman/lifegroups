"use client";

import { useState, useTransition } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminSetGroupTypeInPipeline } from "@/app/(protected)/admin/multiply/actions";
import { type PipelineTypeView } from "@/lib/admin/multiplication";
import {
  fieldLabelClassName as LABEL,
  fieldInputBaseClassName as INPUT,
  errorTextClassName as ERROR,
} from "@/components/admin/forms/field-styles";
import { PipelinePotentialCandidates } from "@/components/admin/multiply/pipeline-potential-candidates";
import { PipelineLockedInCandidates } from "@/components/admin/multiply/pipeline-locked-in-candidates";
import { PipelineMatchedShepherds } from "@/components/admin/multiply/pipeline-matched-shepherds";

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

// One pipelined type, composed from three sub-sections that each live in their
// own file so the wave-4 slices stay out of each other's way:
//   • PipelinePotentialCandidates / PipelineLockedInCandidates — the candidate
//     lifecycle (#757 wires lock-in + remove there).
//   • PipelineMatchedShepherds — the supply side (#758 fills it via
//     matchShepherdsToType).
// Each arm tolerates an empty list, so a freshly pipelined type with nothing
// under it still renders (never block).
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

      <PipelinePotentialCandidates candidates={type.potentialCandidates} />
      <PipelineLockedInCandidates candidates={type.lockedInCandidates} />
      <PipelineMatchedShepherds shepherds={type.matchedShepherds} />
    </li>
  );
}
