"use client";

import { useState, type FormEvent } from "react";
import type { ProspectState } from "@/types/enums";
import { PButton } from "@/components/pastoral/button";
import {
  adminTransitionProspect,
  adminSetProspectNextStep,
  adminUpdateProspect,
  adminArchiveProspect,
} from "@/app/(protected)/admin/plan/actions";
import {
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
} from "@/components/admin/forms/field-styles";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
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
import { P, fontBody, fontSans } from "@/lib/pastoral";

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

  return (
    <div
      style={{
        border: `1px solid ${P.line}`,
        background: P.surface,
        borderRadius: 10,
        padding: "12px 14px",
        display: "grid",
        gap: 8,
      }}
    >
      <div>
        <div
          style={{
            fontFamily: fontSans,
            fontSize: 14,
            fontWeight: 600,
            color: P.ink,
          }}
        >
          {prospect.full_name}
        </div>
        {prospect.email || prospect.phone ? (
          <div style={{ fontFamily: fontBody, fontSize: 12, color: P.ink3 }}>
            {[prospect.email, prospect.phone].filter(Boolean).join(" · ")}
          </div>
        ) : null}
        {groupName ? (
          <div
            style={{
              fontFamily: fontBody,
              fontSize: 12,
              color: P.ink2,
              marginTop: 2,
            }}
          >
            Group: {groupName}
          </div>
        ) : null}
      </div>

      {legalTargets.length > 0 ? (
        <form action={formAction} style={{ display: "grid", gap: 6 }}>
          <input type="hidden" name="prospect_id" value={prospect.id} />
          <label
            htmlFor={`move-${prospect.id}`}
            style={{ ...fieldLabelStyle, marginBottom: 2 }}
          >
            Move to
          </label>
          <select
            id={`move-${prospect.id}`}
            name="state"
            value={target}
            onChange={(e) => setTarget(e.target.value as ProspectState | "")}
            style={{ ...fieldSelectStyle, padding: "8px 10px" }}
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
              style={{ ...fieldSelectStyle, padding: "8px 10px" }}
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
              target === ""
                ? "Moved."
                : `Moved to ${PROSPECT_STATE_LABEL[target]}.`
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

  const sublabelStyle = { ...fieldLabelStyle, marginBottom: 2 } as const;
  const inputStyle = { ...fieldInputStyle, padding: "8px 10px" } as const;

  return (
    <details
      style={{
        borderTop: `1px solid ${P.line}`,
        paddingTop: 8,
        marginTop: 2,
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          fontFamily: fontSans,
          fontSize: 12,
          fontWeight: 600,
          color: P.ink2,
        }}
      >
        Edit details
      </summary>

      <form
        action={formAction}
        style={{ display: "grid", gap: 6, marginTop: 8 }}
      >
        <input type="hidden" name="prospect_id" value={prospect.id} />

        <label htmlFor={`edit-name-${prospect.id}`} style={sublabelStyle}>
          Full name
        </label>
        <input
          id={`edit-name-${prospect.id}`}
          name="full_name"
          type="text"
          required
          maxLength={120}
          defaultValue={prospect.full_name}
          style={inputStyle}
        />

        <label htmlFor={`edit-email-${prospect.id}`} style={sublabelStyle}>
          Email (optional)
        </label>
        <input
          id={`edit-email-${prospect.id}`}
          name="email"
          type="email"
          defaultValue={prospect.email ?? ""}
          style={inputStyle}
        />

        <label htmlFor={`edit-phone-${prospect.id}`} style={sublabelStyle}>
          Phone (optional)
        </label>
        <input
          id={`edit-phone-${prospect.id}`}
          name="phone"
          type="tel"
          defaultValue={prospect.phone ?? ""}
          style={inputStyle}
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
function ArchiveProspectControl({
  prospect,
}: {
  prospect: ProspectBoardEntry;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminArchiveProspect
  );

  function confirmArchive(e: FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        `Archive ${prospect.full_name}? They leave the board (kept in history). Use "Not at this time" instead if you only want to park them.`
      )
    ) {
      e.preventDefault();
    }
  }

  return (
    <div
      style={{
        borderTop: `1px solid ${P.line}`,
        paddingTop: 8,
        marginTop: 2,
        display: "grid",
        gap: 4,
      }}
    >
      <form action={formAction} onSubmit={confirmArchive}>
        <input type="hidden" name="prospect_id" value={prospect.id} />
        <PButton
          type="submit"
          tone="ghost"
          size="sm"
          disabled={pending}
          aria-label={`Archive prospect ${prospect.full_name}`}
        >
          {pending ? "Archiving…" : "Archive"}
        </PButton>
      </form>
      <FormStatus state={state} successText="Prospect archived." />
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

  const sublabelStyle = { ...fieldLabelStyle, marginBottom: 2 } as const;
  const inputStyle = { ...fieldInputStyle, padding: "8px 10px" } as const;

  return (
    <details
      style={{
        borderTop: `1px solid ${P.line}`,
        paddingTop: 8,
        marginTop: 2,
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          fontFamily: fontSans,
          fontSize: 12,
          fontWeight: 600,
          color: P.ink2,
        }}
      >
        Next step
        {prospect.next_step
          ? ` · ${NEXT_STEP_TYPE_LABEL[prospect.next_step.type]}${
              prospect.next_step.dueDate
                ? ` (due ${prospect.next_step.dueDate})`
                : ""
            }`
          : ""}
      </summary>

      <form
        action={formAction}
        style={{ display: "grid", gap: 6, marginTop: 8 }}
      >
        <input type="hidden" name="prospect_id" value={prospect.id} />

        <label htmlFor={`ns-type-${prospect.id}`} style={sublabelStyle}>
          Next step
        </label>
        <select
          id={`ns-type-${prospect.id}`}
          name="next_step_type"
          value={type}
          onChange={(e) => setType(e.target.value as NextStepType | "")}
          style={{ ...fieldSelectStyle, padding: "8px 10px" }}
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
            <label htmlFor={`ns-due-${prospect.id}`} style={sublabelStyle}>
              Due date (arms a follow-up)
            </label>
            <input
              id={`ns-due-${prospect.id}`}
              type="date"
              name="next_step_due_date"
              defaultValue={prospect.next_step?.dueDate ?? ""}
              style={inputStyle}
            />
          </>
        ) : null}

        {type !== "" ? (
          <>
            <label htmlFor={`ns-detail-${prospect.id}`} style={sublabelStyle}>
              Detail (optional)
            </label>
            <textarea
              id={`ns-detail-${prospect.id}`}
              name="next_step_detail"
              defaultValue={prospect.next_step?.detail ?? ""}
              rows={2}
              maxLength={2000}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </>
        ) : null}

        <label htmlFor={`ns-note-${prospect.id}`} style={sublabelStyle}>
          Additional note (separate)
        </label>
        <textarea
          id={`ns-note-${prospect.id}`}
          name="additional_note"
          defaultValue={prospect.additional_note ?? ""}
          rows={2}
          maxLength={2000}
          style={{ ...inputStyle, resize: "vertical" }}
        />

        {type === "connect_to_group_leader" ? (
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 11,
              color: P.ink3,
              margin: "2px 0 0",
            }}
          >
            Back-office only — nothing is shown to the group leader.
          </p>
        ) : null}

        <p
          style={{
            fontFamily: fontBody,
            fontSize: 11,
            color: P.ink3,
            background: P.surface,
            border: `1px dashed ${P.line}`,
            borderRadius: 6,
            padding: "6px 8px",
            margin: "2px 0 0",
          }}
        >
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
