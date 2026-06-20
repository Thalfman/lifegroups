"use client";

import { useState, useTransition } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminSetGroupTypeInPipeline } from "@/app/(protected)/admin/multiply/actions";
import {
  fieldLabelClassName as LABEL,
  fieldInputBaseClassName as INPUT,
  errorTextClassName as ERROR,
} from "@/components/admin/forms/field-styles";

// Multiply Pipeline (ADR 0030, minimal slice #755): the type-level intent
// surface. The admin pipelines a group type — recording the intent to launch
// another of it — before any concrete existing group is the one spawning it.
// This section lists every pipelined type (even with nothing under it yet) and
// lets the admin add or remove one. Removal is a soft, audited flag flip (the
// type's config row is kept). The candidates/shepherds that nest under each
// pipelined type are later PRD #751 slices, not this one.
export function PipelineIntent({
  pipelinedTypes,
  groupTypes,
}: {
  pipelinedTypes: readonly string[];
  groupTypes: readonly string[];
}) {
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  // Types not already pipelined, for the add control.
  const pipelinedKeys = new Set(pipelinedTypes.map((t) => t.toLowerCase()));
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
          specific group is the one multiplying.
        </p>
      </div>

      {pipelinedTypes.length === 0 ? (
        <p className="m-0 font-sans text-sm text-ink3">
          No types are in the pipeline yet. Add one below to start planning by
          type.
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {pipelinedTypes.map((type) => (
            <li
              key={type}
              className="flex items-center justify-between gap-3 rounded-sm border border-line bg-surface px-3 py-2"
            >
              <span className="font-sans text-sm text-ink">{type}</span>
              <PButton
                type="button"
                tone="ghost"
                size="sm"
                onClick={() => setInPipeline(type, false)}
                disabled={pending}
              >
                Remove
              </PButton>
            </li>
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
