"use client";

// The Group-Health rating editor drawer, extracted from the triage table so
// the group detail Health tab can host the SAME editor (and the same audited
// write path — adminSetGroupHealthRatings / adminRecomputeGroupHealthAssessment)
// without duplicating it. Behaviour is unchanged from the triage original:
// keyed-per-group body, dirty tracking via the caller's ref, save closes via
// onSaved, recompute disabled while edits are unsaved.

import { useEffect, useState, type MutableRefObject } from "react";
import { useRouter } from "next/navigation";
import type { GroupHealthOverviewRow } from "@/lib/admin/group-health-read";
import {
  adminSetGroupHealthRatings,
  adminRecomputeGroupHealthAssessment,
} from "@/app/(protected)/admin/group-health/actions";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import { EditingSurface } from "@/components/lg/admin/editing-surface";
import { AttentionResetEntityButton } from "@/components/admin/attention-reset-entity-button";
import { SuperAdminOnlyMark } from "@/components/admin/super-admin-only-badge";
import { PButton } from "@/components/pastoral/button";
import { cn } from "@/lib/utils";
import {
  fieldLabelClassName as FIELD_LABEL,
  fieldInputBaseClassName,
} from "@/components/admin/forms/field-styles";

// `lg-m-input` prefixes the shared field-input base so this drawer keeps the
// ≥16px mobile font guard on its controls.
const FIELD_INPUT = `lg-m-input ${fieldInputBaseClassName}`;

export function GroupHealthEditorDrawer({
  row,
  period,
  spiritualGrowthLabel,
  groupQuestionLabel,
  dirtyRef,
  onRequestClose,
  onSaved,
  isSuperAdmin,
}: {
  row: GroupHealthOverviewRow | null;
  period: string;
  spiritualGrowthLabel: string;
  groupQuestionLabel: string;
  dirtyRef: MutableRefObject<boolean>;
  onRequestClose: () => void;
  onSaved: () => void;
  isSuperAdmin: boolean;
}) {
  return (
    <EditingSurface
      open={row !== null}
      onRequestClose={onRequestClose}
      eyebrow="Group health"
      title={row?.group_name ?? ""}
      description={
        row
          ? `Ratings for ${period}. Saving recomputes this group's grade and writes the month's snapshot — no other group is affected.`
          : undefined
      }
      closeLabel={row ? `Close ${row.group_name} health editor` : "Close"}
    >
      {row ? (
        // Keyed per group so the rating fields + action state reset when a
        // different group is opened, while the Dialog itself stays mounted.
        <GroupHealthEditorBody
          key={row.group_id}
          row={row}
          spiritualGrowthLabel={spiritualGrowthLabel}
          groupQuestionLabel={groupQuestionLabel}
          dirtyRef={dirtyRef}
          onSaved={onSaved}
          isSuperAdmin={isSuperAdmin}
        />
      ) : null}
    </EditingSurface>
  );
}

// The rating editor inside the drawer. Reuses the existing audited server
// actions, so saving here is the same write path as before — only the surface
// changed (out of the list, one group at a time).
function GroupHealthEditorBody({
  row,
  spiritualGrowthLabel,
  groupQuestionLabel,
  dirtyRef,
  onSaved,
  isSuperAdmin,
}: {
  row: GroupHealthOverviewRow;
  spiritualGrowthLabel: string;
  groupQuestionLabel: string;
  dirtyRef: MutableRefObject<boolean>;
  onSaved: () => void;
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const ratings = useActionForm(adminSetGroupHealthRatings);
  const recompute = useActionForm(adminRecomputeGroupHealthAssessment);

  // A successful save closes the drawer and refreshes the list so the new grade
  // / last-saved show immediately (the action revalidates the route too). This
  // instance is keyed per group, so `saved` only transitions false→true once.
  const saved = Boolean(ratings.state?.ok || recompute.state?.ok);
  useEffect(() => {
    if (!saved) return;
    dirtyRef.current = false;
    router.refresh();
    onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  const markDirty = () => {
    setDirty(true);
    dirtyRef.current = true;
  };

  const formId = `gh-ratings-${row.group_id}`;

  return (
    <>
      <form
        id={formId}
        ref={ratings.formRef}
        action={ratings.formAction}
        onChange={markDirty}
        className="grid gap-4"
      >
        <input type="hidden" name="group_id" value={row.group_id} />

        <div>
          <label htmlFor={`gh-growth-${row.group_id}`} className={FIELD_LABEL}>
            {spiritualGrowthLabel}
          </label>
          <input
            id={`gh-growth-${row.group_id}`}
            className={FIELD_INPUT}
            type="number"
            name="spiritual_growth_score"
            min={1}
            max={5}
            defaultValue={row.spiritual_growth_score ?? ""}
          />
        </div>

        <div>
          <label
            htmlFor={`gh-question-${row.group_id}`}
            className={FIELD_LABEL}
          >
            {groupQuestionLabel}
          </label>
          <input
            id={`gh-question-${row.group_id}`}
            className={FIELD_INPUT}
            type="number"
            name="group_question_score"
            min={1}
            max={5}
            defaultValue={row.group_question_score ?? ""}
          />
        </div>

        <div>
          <label htmlFor={`gh-note-${row.group_id}`} className={FIELD_LABEL}>
            Spiritual-growth note
          </label>
          <textarea
            id={`gh-note-${row.group_id}`}
            className={cn(FIELD_INPUT, "min-h-[76px] resize-y")}
            name="spiritual_growth_note"
            maxLength={2000}
            defaultValue={row.spiritual_growth_note ?? ""}
          />
        </div>

        <label
          htmlFor={`gh-followup-${row.group_id}`}
          className="flex cursor-pointer items-start gap-2 font-sans text-base text-ink"
        >
          <input
            id={`gh-followup-${row.group_id}`}
            type="checkbox"
            name="needs_follow_up"
            defaultChecked={row.needs_follow_up}
            aria-label={`Flag ${row.group_name} as needing follow-up`}
            className="mt-[3px]"
          />
          {/* The currently-displayed flag (which may be carried from a prior
              month), so an empty "uncheck to close the action" save isn't
              rejected as a no-op — it must be able to write the current-month
              needs_follow_up=false row that supersedes the carried flag. */}
          <input
            type="hidden"
            name="prior_needs_follow_up"
            value={row.needs_follow_up ? "true" : "false"}
          />
          <span>
            Needs follow-up
            <span className="mt-0.5 block text-sm text-ink3">
              Keep this group on the follow-up filter until the action is
              closed.
            </span>
          </span>
        </label>

        <FormStatus state={ratings.state} successText="Saved." />
        <FormStatus state={recompute.state} successText="Grade saved." />
      </form>

      <div className="mt-1 flex flex-wrap justify-end gap-2.5 border-t border-line pt-3.5">
        {/* Recompute grades from the last *saved* ratings, so it's disabled while
            there are unsaved edits — otherwise it would silently discard them. */}
        <form action={recompute.formAction}>
          <input type="hidden" name="group_id" value={row.group_id} />
          <PButton
            type="submit"
            tone="ghost"
            size="sm"
            disabled={dirty || recompute.pending}
            aria-label={`Recompute ${row.group_name} grade`}
            title={dirty ? "Save your rating edits first" : undefined}
          >
            {recompute.pending ? "Saving…" : "Save grade only"}
          </PButton>
        </form>
        <PButton
          type="submit"
          tone="terra"
          size="sm"
          form={formId}
          disabled={ratings.pending}
          aria-label={`Save ${row.group_name} health rating`}
        >
          {ratings.pending ? "Saving…" : "Save rating"}
        </PButton>
      </div>

      {isSuperAdmin ? (
        <div className="mt-3.5 grid gap-1.5 border-t border-line pt-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-sans text-xs font-bold text-ink">
              Reset attention
            </span>
            <SuperAdminOnlyMark />
          </div>
          <p className="m-0 font-sans text-xs text-ink2">
            Clear this group from the “overdue or missing health checks” card
            with a fresh-start baseline and clear any open “needs follow-up”
            flag — it re-surfaces naturally once a new due week passes without a
            submission. Recoverable from Super Admin → Danger Zone.
          </p>
          <AttentionResetEntityButton
            surface="health"
            entityId={row.group_id}
            entityLabel={row.group_name}
          />
        </div>
      ) : null}
    </>
  );
}
