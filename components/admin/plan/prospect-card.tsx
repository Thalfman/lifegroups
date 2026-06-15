"use client";

import { useState } from "react";
import type { ProspectState } from "@/types/enums";
import { cn } from "@/lib/utils";
import { PButton } from "@/components/pastoral/button";
import {
  adminTransitionProspect,
  adminSetProspectNextStep,
  adminUpdateProspect,
  adminArchiveProspect,
} from "@/app/(protected)/admin/plan/actions";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import { ConfirmActionButton } from "@/components/admin/forms/confirm-action-button";
import {
  PROSPECT_STATE_LABEL,
  canTransition,
  stateRequiresGroup,
} from "@/lib/admin/prospect-funnel";
import {
  NEXT_STEP_TYPES,
  NEXT_STEP_TYPE_LABEL,
  type NextStepType,
} from "@/lib/admin/prospect-next-step";
import type { ProspectBoardEntry } from "@/lib/supabase/prospect-reads";
import type { PlanGroupOption } from "@/components/admin/plan/plan-data";
import { fieldInputBaseClassName as INPUT } from "@/components/admin/forms/field-styles";

// A tighter label than the shared field label (mb-0.5 vs mb-1.5) so the card's
// three collapsed editors stay compact; the input adopts the shared base.
const LABEL =
  "mb-0.5 block font-sans text-xs font-semibold uppercase tracking-wide text-ink3";

// All states a Prospect can be moved to (the four-state funnel). The card
// offers exactly the legal targets for its current state, with a group picker
// shown when the target requires one (Matched / Joined).
const ALL_STATES: readonly ProspectState[] = [
  "interested",
  "matched",
  "joined",
  "not_at_this_time",
];

export function ProspectCard({
  prospect,
  groupName,
  activeGroups,
}: {
  prospect: ProspectBoardEntry;
  // The Prospect's current group name, when attached (e.g. a Matched prospect).
  groupName: string | null;
  activeGroups: PlanGroupOption[];
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminTransitionProspect
  );

  const legalTargets = ALL_STATES.filter((to) =>
    canTransition(prospect.state, to)
  );
  const [target, setTarget] = useState<ProspectState | "">("");
  const needsGroup = target !== "" && stateRequiresGroup(target);
  // The destination actually submitted, snapshotted on submit so the success
  // line reflects where the prospect went — not a later, unsubmitted change to
  // the dropdown.
  const [movedTo, setMovedTo] = useState<ProspectState | "">("");

  return (
    <div className="grid gap-2 rounded-sm border border-line bg-surface px-3.5 py-3">
      <div>
        <div className="font-sans text-base font-semibold text-ink">
          {prospect.full_name}
        </div>
        {prospect.email || prospect.phone ? (
          <div className="font-sans text-sm text-ink3">
            {[prospect.email, prospect.phone].filter(Boolean).join(" · ")}
          </div>
        ) : null}
        {groupName ? (
          <div className="mt-0.5 font-sans text-sm text-ink2">
            Group: {groupName}
          </div>
        ) : null}
      </div>

      {legalTargets.length > 0 ? (
        <form
          action={formAction}
          onSubmit={() => setMovedTo(target)}
          className="grid gap-1.5"
        >
          <input type="hidden" name="prospect_id" value={prospect.id} />
          <label htmlFor={`move-${prospect.id}`} className={LABEL}>
            Move to
          </label>
          <select
            id={`move-${prospect.id}`}
            name="state"
            value={target}
            onChange={(e) => setTarget(e.target.value as ProspectState | "")}
            className={INPUT}
          >
            <option value="">—</option>
            {legalTargets.map((to) => (
              <option key={to} value={to}>
                {PROSPECT_STATE_LABEL[to]}
              </option>
            ))}
          </select>
          {needsGroup ? (
            <select
              name="group_id"
              defaultValue={prospect.group_id ?? ""}
              required
              className={INPUT}
            >
              <option value="">Pick a group…</option>
              {activeGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          ) : null}
          <div>
            <PButton
              type="submit"
              tone="ghost"
              size="sm"
              disabled={pending || target === ""}
            >
              {pending ? "Moving…" : "Apply"}
            </PButton>
          </div>
          {/* Operation-specific confirmation so the message says where the
              prospect went ("Moved to Not at this time.") rather than a bare
              "Moved." */}
          <FormStatus
            state={state}
            successText={
              movedTo === ""
                ? "Moved."
                : `Moved to ${PROSPECT_STATE_LABEL[movedTo]}.`
            }
          />
        </form>
      ) : null}

      <EditProspectDetails prospect={prospect} />

      <NextStepEditor prospect={prospect} />

      <ArchiveProspectControl prospect={prospect} />
    </div>
  );
}

// Inline "Edit details" editor for a Prospect's identity fields (name / email /
// phone). A collapsed <details> like the Next-step editor so the card stays
// compact; saving corrects the record in place without a state change.
function EditProspectDetails({ prospect }: { prospect: ProspectBoardEntry }) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminUpdateProspect
  );

  return (
    <details className="mt-0.5 border-t border-line pt-2">
      <summary className="cursor-pointer font-sans text-xs font-semibold text-ink2 hover:text-ink">
        Edit details
      </summary>

      <form action={formAction} className="mt-2 grid gap-1.5">
        <input type="hidden" name="prospect_id" value={prospect.id} />

        <label htmlFor={`edit-name-${prospect.id}`} className={LABEL}>
          Full name
        </label>
        <input
          id={`edit-name-${prospect.id}`}
          name="full_name"
          type="text"
          required
          maxLength={120}
          defaultValue={prospect.full_name}
          className={INPUT}
        />

        <label htmlFor={`edit-email-${prospect.id}`} className={LABEL}>
          Email (optional)
        </label>
        <input
          id={`edit-email-${prospect.id}`}
          name="email"
          type="email"
          defaultValue={prospect.email ?? ""}
          className={INPUT}
        />

        <label htmlFor={`edit-phone-${prospect.id}`} className={LABEL}>
          Phone (optional)
        </label>
        <input
          id={`edit-phone-${prospect.id}`}
          name="phone"
          type="tel"
          defaultValue={prospect.phone ?? ""}
          className={INPUT}
        />

        <div>
          <PButton type="submit" tone="ghost" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save details"}
          </PButton>
        </div>
        <FormStatus state={state} successText="Details saved." />
      </form>
    </details>
  );
}

// Archive (soft-delete) a Prospect for cleanup. Archiving removes it from the
// board entirely (it is not "joined", so it does not appear in the Joined
// roll-up either). Distinct from the "Not at this time" move, which is a state
// change that keeps the prospect on the board.

// Exported so the copy stays byte-locked by the confirm-action-button test.
export function archiveProspectConfirmMessage(fullName: string): string {
  return `Archive ${fullName}? They leave the board (kept in history). Use "Not at this time" instead if you only want to park them.`;
}

function ArchiveProspectControl({
  prospect,
}: {
  prospect: ProspectBoardEntry;
}) {
  return (
    <div className="mt-0.5 border-t border-line pt-2">
      <ConfirmActionButton
        action={adminArchiveProspect}
        confirmMessage={archiveProspectConfirmMessage(prospect.full_name)}
        hiddenFields={[{ name: "prospect_id", value: prospect.id }]}
        idleLabel="Archive"
        pendingLabel="Archiving…"
        tone="ghost"
        ariaLabel={`Archive prospect ${prospect.full_name}`}
        successText="Prospect archived."
        gap={4}
        alignEnd={false}
      />
    </div>
  );
}

// The per-Prospect Next Step + Additional Note control (#379). A single current
// step (type {Connect to Group Leader, Follow Up} + optional due date + detail)
// and a separate Additional Note are saved together. A Follow Up with a date is
// "armed" — it surfaces as a due task on/after that date. Connect to Group
// Leader is back-office only; choosing it changes nothing a Leader sees. NO
// provider is wired: the "to be configured" note makes clear nothing is sent.
function NextStepEditor({ prospect }: { prospect: ProspectBoardEntry }) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminSetProspectNextStep
  );

  const [type, setType] = useState<NextStepType | "">(
    prospect.next_step?.type ?? ""
  );
  const isFollowUp = type === "follow_up";

  return (
    <details className="mt-0.5 border-t border-line pt-2">
      <summary className="cursor-pointer font-sans text-xs font-semibold text-ink2 hover:text-ink">
        Next step
        {prospect.next_step
          ? ` · ${NEXT_STEP_TYPE_LABEL[prospect.next_step.type]}${
              prospect.next_step.dueDate
                ? ` (due ${prospect.next_step.dueDate})`
                : ""
            }`
          : ""}
      </summary>

      <form action={formAction} className="mt-2 grid gap-1.5">
        <input type="hidden" name="prospect_id" value={prospect.id} />

        <label htmlFor={`ns-type-${prospect.id}`} className={LABEL}>
          Next step
        </label>
        <select
          id={`ns-type-${prospect.id}`}
          name="next_step_type"
          value={type}
          onChange={(e) => setType(e.target.value as NextStepType | "")}
          className={INPUT}
        >
          <option value="">No next step</option>
          {NEXT_STEP_TYPES.map((t) => (
            <option key={t} value={t}>
              {NEXT_STEP_TYPE_LABEL[t]}
            </option>
          ))}
        </select>

        {isFollowUp ? (
          <>
            <label htmlFor={`ns-due-${prospect.id}`} className={LABEL}>
              Due date (arms a follow-up)
            </label>
            <input
              id={`ns-due-${prospect.id}`}
              type="date"
              name="next_step_due_date"
              defaultValue={prospect.next_step?.dueDate ?? ""}
              className={INPUT}
            />
          </>
        ) : null}

        {type !== "" ? (
          <>
            <label htmlFor={`ns-detail-${prospect.id}`} className={LABEL}>
              Detail (optional)
            </label>
            <textarea
              id={`ns-detail-${prospect.id}`}
              name="next_step_detail"
              defaultValue={prospect.next_step?.detail ?? ""}
              rows={2}
              maxLength={2000}
              className={cn(INPUT, "resize-y")}
            />
          </>
        ) : null}

        <label htmlFor={`ns-note-${prospect.id}`} className={LABEL}>
          Additional note (separate)
        </label>
        <textarea
          id={`ns-note-${prospect.id}`}
          name="additional_note"
          defaultValue={prospect.additional_note ?? ""}
          rows={2}
          maxLength={2000}
          className={cn(INPUT, "resize-y")}
        />

        {type === "connect_to_group_leader" ? (
          <p className="m-0 mt-0.5 font-sans text-xs text-ink3">
            Back-office only — nothing is shown to the group leader.
          </p>
        ) : null}

        <p className="m-0 mt-0.5 rounded-sm border border-dashed border-line px-2 py-1.5 font-sans text-xs text-ink3">
          No messaging provider is wired yet — to be configured. Nothing is
          sent; a follow-up with a date just appears as a due task.
        </p>

        <div>
          <PButton type="submit" tone="ghost" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save next step"}
          </PButton>
        </div>
        <FormStatus state={state} successText="Saved." />
      </form>
    </details>
  );
}
