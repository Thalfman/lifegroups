"use client";

import { useState, useTransition } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminCreateMultiplicationCandidate } from "@/app/(protected)/admin/launch-planning/actions";
import {
  CANDIDATE_STATUS_LABEL,
  type PipelinePotentialCandidate,
} from "@/lib/admin/multiplication";
import type { MultiplicationCandidateStatus } from "@/types/enums";
import { ReadinessChecklist } from "@/components/admin/multiply/readiness-checklist";
import {
  fieldLabelClassName as LABEL,
  fieldInputBaseClassName as INPUT,
  errorTextClassName as ERROR,
} from "@/components/admin/forms/field-styles";

// ADR 0030 — the auto-listed active groups of a pipelined type that have no
// saved candidate row yet (the potential-candidate pool, partitioned by
// buildPipelineView). #757 wires the lock-in flow: selecting a potential opens
// its five-box readiness checklist (+ status + target year); saving locks it in
// through the audited admin_create_multiplication_candidate RPC, which moves the
// group to the locked-in list (the server re-partitions through
// buildPipelineView after revalidatePath("/admin/multiply")).
//
// Lock-in is a deliberate assessment, never a gate: a group can be locked in
// with any number of checklist boxes ticked, even zero. So Save is never gated
// on the checklist.

const STATUS_OPTIONS: MultiplicationCandidateStatus[] = [
  "watching",
  "planned",
  "launched",
  "deferred",
];

export function PipelinePotentialCandidates({
  candidates,
}: {
  candidates: readonly PipelinePotentialCandidate[];
}) {
  // At most one potential is expanded into its lock-in form at a time, keyed by
  // groupId. null = none open.
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);

  return (
    <div className="grid gap-1">
      <p className="m-0 font-sans text-xs font-semibold uppercase tracking-wide text-ink3">
        Potential candidates
      </p>
      {candidates.length === 0 ? (
        <p className="m-0 font-sans text-sm text-ink3">
          No active groups of this type yet.
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {candidates.map((g) => {
            const open = openGroupId === g.groupId;
            return (
              <li
                key={g.groupId}
                className="grid gap-2 rounded-sm border border-line bg-bg px-2.5 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-sans text-sm text-ink">
                    {g.groupName}
                  </span>
                  <PButton
                    type="button"
                    tone={open ? "ghost" : "terra"}
                    size="sm"
                    aria-expanded={open}
                    aria-label={
                      open
                        ? `Cancel lock-in for ${g.groupName}`
                        : `Lock in ${g.groupName}`
                    }
                    onClick={() =>
                      setOpenGroupId((cur) =>
                        cur === g.groupId ? null : g.groupId
                      )
                    }
                  >
                    {open ? "Cancel" : "Lock in"}
                  </PButton>
                </div>
                {open ? (
                  <LockInForm
                    groupId={g.groupId}
                    onLocked={() => setOpenGroupId(null)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// The inline lock-in form for one potential candidate. Posts the group id, the
// status + target year, and the five readiness checkboxes through the audited
// create action (mirroring pipeline-view's adminSetGroupTypeInPipeline call:
// build a FormData, fire under useTransition, surface any error). The dormant
// fields (meeting_time, manual_member_count, successor_designate,
// leader_pipeline_id, notes) are deliberately omitted — the create action reads
// each by name, so an absent key collapses to null (ADR 0030 dropped the
// member-count and meeting-time inputs from this form).
function LockInForm({
  groupId,
  onLocked,
}: {
  groupId: string;
  onLocked: () => void;
}) {
  const [status, setStatus] =
    useState<MultiplicationCandidateStatus>("watching");
  const [targetYear, setTargetYear] = useState("");
  // The five readiness checkboxes are uncontrolled (defaultChecked via the
  // shared ReadinessChecklist) and read straight off the form element on submit.
  const [formEl, setFormEl] = useState<HTMLFormElement | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  const idPrefix = `pipeline-lockin-${groupId}`;

  function lockIn() {
    if (!formEl) return;
    setError(undefined);
    // Snapshot the checkbox state from the live form (presence = true, the
    // create action's input.has(name) read maps an absent box to false).
    const checklist = new FormData(formEl);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("group_id", groupId);
      formData.set("status", status);
      if (targetYear.trim() !== "") formData.set("target_year", targetYear);
      for (const name of [
        "enough_members",
        "established_long_enough",
        "co_shepherd_tenured",
        "shepherd_willing",
        "needs_similar_stage",
      ] as const) {
        if (checklist.get(name) != null) formData.set(name, "on");
      }
      const result = await adminCreateMultiplicationCandidate(
        undefined,
        formData
      );
      if (!result.ok) {
        setError(result.errors[0] ?? "That wasn't saved. Try again.");
        return;
      }
      // revalidatePath("/admin/multiply") in the action re-partitions this group
      // onto the locked-in list; collapse the form.
      onLocked();
    });
  }

  return (
    <form
      ref={setFormEl}
      onSubmit={(e) => {
        e.preventDefault();
        lockIn();
      }}
      className="grid gap-2.5 rounded-sm border border-line bg-surface p-2.5"
    >
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-status`} className={LABEL}>
            Status
          </label>
          <select
            id={`${idPrefix}-status`}
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as MultiplicationCandidateStatus)
            }
            className={INPUT}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {CANDIDATE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${idPrefix}-target_year`} className={LABEL}>
            Target year
          </label>
          <input
            id={`${idPrefix}-target_year`}
            type="number"
            min={2024}
            max={2100}
            inputMode="numeric"
            value={targetYear}
            onChange={(e) => setTargetYear(e.target.value)}
            placeholder="2026"
            className={INPUT}
          />
        </div>
      </div>

      <ReadinessChecklist idPrefix={idPrefix} />

      <div className="flex items-center gap-2.5">
        <PButton type="submit" tone="terra" size="sm" disabled={pending}>
          {pending ? "Locking in…" : "Save"}
        </PButton>
        <span className="font-sans text-xs text-ink3">
          A group can be locked in with any number of boxes ticked.
        </span>
      </div>

      {error ? (
        <p role="alert" className={ERROR}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
