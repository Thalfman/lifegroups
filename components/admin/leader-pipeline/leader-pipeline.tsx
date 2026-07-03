"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useValueChange } from "@/lib/hooks/use-value-change";
import { PButton, PLinkButton } from "@/components/pastoral/button";
import {
  adminAdvanceApprenticeStage,
  adminArchiveApprentice,
  adminCreateApprentice,
  adminUpdateApprentice,
} from "@/app/(protected)/admin/leader-pipeline/actions";
import {
  APPRENTICE_NAME_FALLBACK,
  LEADER_READINESS_STAGES,
  STAGE_LABEL,
  nextStage,
  resolveApprenticeNameSource,
  type ApprenticeView,
  type PipelineRollup,
} from "@/lib/admin/leader-pipeline";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import type { LeaderReadinessStage } from "@/types/enums";
import { formatIsoDate } from "@/lib/shared/date";
// Type-only: the data module itself is server-side, the import is erased at
// build time.
import type { PipelineMemberOption } from "@/components/admin/leader-pipeline/leader-pipeline-data";
import {
  fieldLabelClassName as LABEL,
  fieldInputBaseClassName as INPUT,
} from "@/components/admin/forms/field-styles";
import {
  APPRENTICE_DISPLAY_NAME_MAX,
  APPRENTICE_NOTES_MAX,
} from "@/lib/admin/validation/leader-pipeline";

// Notes can run to 2000 chars; a single-line input hides all but a sliver of
// that, so notes use a multi-line, vertically resizable variant of INPUT.
const TEXTAREA = `${INPUT} min-h-[4.5rem] resize-y leading-normal`;

function StageBadge({ stage }: { stage: LeaderReadinessStage }) {
  const ready = stage === "ready_to_lead";
  return <Badge tone={ready ? "sage" : "neutral"}>{STAGE_LABEL[stage]}</Badge>;
}

function ApprenticeEditForm({
  a,
  memberOptions,
}: {
  a: ApprenticeView;
  memberOptions: PipelineMemberOption[];
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminUpdateApprentice
  );
  const {
    state: archiveState,
    formAction: archiveAction,
    pending: archivePending,
  } = useActionForm<{ id: string }>(adminArchiveApprentice);
  // A linked member who is no longer among the group's active members (left
  // the group, deactivated) must stay selectable — otherwise an unrelated save
  // would post member_id="" and silently unlink them.
  const staleLink =
    a.memberId !== null && !memberOptions.some((m) => m.id === a.memberId)
      ? [{ id: a.memberId, name: `${a.displayName} (current link)` }]
      : [];
  return (
    <div className="mt-2.5 grid gap-2.5">
      <form action={formAction} className="grid gap-2.5">
        <input type="hidden" name="apprentice_id" value={a.id} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-2.5">
          <div>
            <label htmlFor={`ap-edit-name-${a.id}`} className={LABEL}>
              Apprentice name
            </label>
            <input
              id={`ap-edit-name-${a.id}`}
              name="display_name"
              type="text"
              maxLength={APPRENTICE_DISPLAY_NAME_MAX}
              defaultValue={a.displayName}
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor={`ap-edit-member-${a.id}`} className={LABEL}>
              Group member
            </label>
            <select
              id={`ap-edit-member-${a.id}`}
              name="member_id"
              defaultValue={a.memberId ?? ""}
              className={INPUT}
            >
              <option value="">No linked member</option>
              {[...staleLink, ...memberOptions].map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-2.5">
          <div>
            <label htmlFor={`ap-edit-stage-${a.id}`} className={LABEL}>
              Readiness stage
            </label>
            <select
              id={`ap-edit-stage-${a.id}`}
              name="readiness_stage"
              defaultValue={a.stage}
              className={INPUT}
            >
              {LEADER_READINESS_STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`ap-edit-date-${a.id}`} className={LABEL}>
              Expected ready by
            </label>
            <input
              id={`ap-edit-date-${a.id}`}
              name="expected_ready_on"
              type="date"
              defaultValue={a.expectedReadyOn ?? ""}
              className={INPUT}
            />
          </div>
        </div>
        <div>
          <label htmlFor={`ap-edit-notes-${a.id}`} className={LABEL}>
            Notes
          </label>
          <textarea
            id={`ap-edit-notes-${a.id}`}
            name="notes"
            maxLength={APPRENTICE_NOTES_MAX}
            rows={3}
            defaultValue={a.notes ?? ""}
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
        <input type="hidden" name="apprentice_id" value={a.id} />
        <PButton type="submit" tone="ghost" size="sm" disabled={archivePending}>
          {archivePending ? "Removing…" : "Remove apprentice"}
        </PButton>
        <FormStatus state={archiveState} />
      </form>
    </div>
  );
}

function AdvanceStageButton({ a }: { a: ApprenticeView }) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminAdvanceApprenticeStage
  );
  const next = nextStage(a.stage);
  if (!next) return null;
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="apprentice_id" value={a.id} />
      <input type="hidden" name="readiness_stage" value={next} />
      <PButton
        type="submit"
        tone="solid"
        size="sm"
        aria-label={`Advance ${a.displayName} to ${STAGE_LABEL[next]}`}
        disabled={pending}
      >
        {pending ? "…" : `Advance to ${STAGE_LABEL[next]}`}
      </PButton>
      <FormStatus state={state} />
    </form>
  );
}

function ApprenticeRow({
  a,
  memberOptions,
}: {
  a: ApprenticeView;
  memberOptions: PipelineMemberOption[];
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="grid gap-2 rounded-sm border border-line px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-2.5">
        <strong className="font-sans text-base text-ink">
          {a.displayName}
        </strong>
        <span className="font-sans text-sm text-ink2">
          {a.groupName}
          {a.expectedReadyOn
            ? ` · ready by ${formatIsoDate(a.expectedReadyOn)}`
            : ""}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <AdvanceStageButton a={a} />
        <Button
          type="button"
          variant="subtle"
          size="sm"
          aria-label={
            editing
              ? `Close editor for ${a.displayName}`
              : `Edit ${a.displayName}`
          }
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "Close" : "Edit"}
        </Button>
      </div>
      {editing ? (
        <ApprenticeEditForm a={a} memberOptions={memberOptions} />
      ) : null}
    </div>
  );
}

function AddApprenticeForm({
  availableGroups,
  memberOptionsByGroup,
  idPrefix,
}: {
  availableGroups: { id: string; name: string }[];
  memberOptionsByGroup: Record<string, PipelineMemberOption[]>;
  idPrefix: string;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminCreateApprentice
  );
  // Dropdown-first (#754): the member dropdown is the primary path. Picking a
  // member DERIVES the apprentice's name from the member record — no name field.
  // The explicit "not listed" fallback reveals a free-text name input so an
  // incomplete roster never blocks adding an apprentice. `memberSelection` holds
  // the dropdown value: "" (none), a member id, or the fallback sentinel.
  const [groupId, setGroupId] = useState("");
  const [memberSelection, setMemberSelection] = useState("");
  const [fallbackName, setFallbackName] = useState("");
  const memberOptions = memberOptionsByGroup[groupId] ?? NO_MEMBER_OPTIONS;
  const nameSource = resolveApprenticeNameSource(
    memberSelection,
    memberOptions
  );
  // React resets the uncontrolled fields once the create lands; mirror that for
  // the controlled fields so the form clears as one. Derived during render
  // rather than in an effect to avoid the cascading-render smell.
  useValueChange(state, (next) => {
    if (next?.ok) {
      setGroupId("");
      setMemberSelection("");
      setFallbackName("");
    }
  });
  // Only enable submit once a name is sourced — a member is picked, or the
  // fallback name is non-empty — so the dropdown-first flow guides rather than
  // surfacing a "name is required" error.
  const canSubmit =
    nameSource.mode === "member" ||
    (nameSource.mode === "fallback" && fallbackName.trim() !== "");
  if (availableGroups.length === 0) {
    return (
      <div className="grid justify-items-start gap-2">
        <p className="m-0 font-sans text-sm text-ink3">
          No active groups to add an apprentice to.
        </p>
        <PLinkButton href="/admin/groups" tone="ghost" size="sm">
          Go to Groups →
        </PLinkButton>
      </div>
    );
  }
  return (
    <form action={formAction} className="grid gap-2.5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-2.5">
        <div>
          <label htmlFor={`${idPrefix}-group`} className={LABEL}>
            Group
          </label>
          <select
            id={`${idPrefix}-group`}
            name="group_id"
            value={groupId}
            onChange={(e) => {
              setGroupId(e.target.value);
              setMemberSelection("");
              setFallbackName("");
            }}
            className={INPUT}
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
          <label htmlFor={`${idPrefix}-member`} className={LABEL}>
            Group member
          </label>
          {/* The dropdown is the primary path; member_id rides a hidden field
              (below) because this select's value can be the fallback sentinel,
              which is not a uuid. */}
          <select
            id={`${idPrefix}-member`}
            value={memberSelection}
            onChange={(e) => setMemberSelection(e.target.value)}
            disabled={groupId === ""}
            className={INPUT}
          >
            <option value="">
              {groupId === ""
                ? "Select a group first…"
                : memberOptions.length === 0
                  ? "No active members — choose “not listed” below"
                  : "Select a member…"}
            </option>
            {memberOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            <option value={APPRENTICE_NAME_FALLBACK}>
              Not listed — enter a name
            </option>
          </select>
        </div>
      </div>
      {/* The apprentice's name: derived from the member record (hidden) when a
          member is picked, or typed via the fallback input when "not listed". */}
      {nameSource.mode === "member" ? (
        <>
          <input type="hidden" name="member_id" value={nameSource.memberId} />
          <input
            type="hidden"
            name="display_name"
            value={nameSource.displayName}
          />
        </>
      ) : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-2.5">
        {nameSource.mode === "fallback" ? (
          <div>
            <label htmlFor={`${idPrefix}-name`} className={LABEL}>
              Apprentice name
            </label>
            <input
              id={`${idPrefix}-name`}
              name="display_name"
              type="text"
              maxLength={APPRENTICE_DISPLAY_NAME_MAX}
              placeholder="e.g. Tony L."
              value={fallbackName}
              onChange={(e) => setFallbackName(e.target.value)}
              className={INPUT}
            />
          </div>
        ) : null}
        <div>
          <label htmlFor={`${idPrefix}-stage`} className={LABEL}>
            Stage
          </label>
          <select
            id={`${idPrefix}-stage`}
            name="readiness_stage"
            defaultValue="identified"
            className={INPUT}
          >
            {LEADER_READINESS_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-2.5">
        <div>
          <label htmlFor={`${idPrefix}-date`} className={LABEL}>
            Expected ready by
          </label>
          <input
            id={`${idPrefix}-date`}
            name="expected_ready_on"
            type="date"
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-notes`} className={LABEL}>
            Notes
          </label>
          <textarea
            id={`${idPrefix}-notes`}
            name="notes"
            maxLength={APPRENTICE_NOTES_MAX}
            rows={3}
            className={TEXTAREA}
          />
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <PButton
          type="submit"
          tone="terra"
          size="md"
          disabled={pending || !canSubmit}
        >
          {pending ? "Adding…" : "Add apprentice"}
        </PButton>
        {groupId !== "" && !canSubmit ? (
          <p className="m-0 font-sans text-xs text-ink3">
            Pick a group member, or choose “not listed” and enter a name.
          </p>
        ) : null}
        <FormStatus state={state} />
      </div>
    </form>
  );
}

// Stable empty list so groups without member options pass the same reference
// on every render.
const NO_MEMBER_OPTIONS: PipelineMemberOption[] = [];

export function LeaderPipeline({
  rollup,
  availableGroups,
  memberOptionsByGroup,
  // Namespaces the add-form's field ids so a second mounted instance (People's
  // Apprentices tab and the Multiply Shepherds tab render the same component)
  // can't break the label→control associations with duplicate ids.
  idPrefix = "ap",
}: {
  rollup: PipelineRollup;
  availableGroups: { id: string; name: string }[];
  memberOptionsByGroup: Record<string, PipelineMemberOption[]>;
  idPrefix?: string;
}) {
  return (
    <section className="grid gap-5 rounded-lg border border-line bg-surface p-card">
      <header>
        <span className="font-sans text-xs text-ink3">Shepherd pipeline</span>
        <h2 className="m-0 mt-1 font-display text-lg font-medium text-ink">
          Apprentices by stage
        </h2>
        <p className="m-0 mt-1.5 font-sans text-sm leading-normal text-ink3">
          {rollup.totalApprentices} apprentice
          {rollup.totalApprentices === 1 ? "" : "s"} across the ministry.
          Advance a stage as a leader-in-training grows toward leading the next
          group.
        </p>
      </header>

      <AddApprenticeForm
        availableGroups={availableGroups}
        memberOptionsByGroup={memberOptionsByGroup}
        idPrefix={idPrefix}
      />

      {rollup.stages.map((section) => (
        <div key={section.stage} className="grid gap-2">
          <h3 className="m-0 flex items-center gap-2 font-sans text-xs font-semibold text-ink2">
            <StageBadge stage={section.stage} />
            <span className="font-normal tabular-nums text-ink3">
              {section.apprentices.length}
            </span>
          </h3>
          {section.apprentices.length === 0 ? (
            <p className="m-0 font-sans text-sm text-ink3">
              None at this stage.
            </p>
          ) : (
            section.apprentices.map((a) => (
              <ApprenticeRow
                key={a.id}
                a={a}
                memberOptions={
                  memberOptionsByGroup[a.groupId] ?? NO_MEMBER_OPTIONS
                }
              />
            ))
          )}
        </div>
      ))}

      <div className="grid gap-2">
        <h3 className="m-0 font-sans text-xs font-semibold text-clayDeep">
          Groups with no apprentice · {rollup.groupsWithoutApprentice.length}
        </h3>
        {rollup.groupsWithoutApprentice.length === 0 ? (
          <p className="m-0 font-sans text-sm text-ink3">
            Every active group has at least one apprentice.
          </p>
        ) : (
          <p className="m-0 font-sans text-sm leading-relaxed text-ink2">
            {rollup.groupsWithoutApprentice.map((g) => g.groupName).join(" · ")}
          </p>
        )}
      </div>
    </section>
  );
}
