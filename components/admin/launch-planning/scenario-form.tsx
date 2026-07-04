"use client";

import { useState } from "react";
import { NOTE_MAX_CHARS } from "@/lib/shared/limits";
import { useValueChange } from "@/lib/hooks/use-value-change";
import { PButton } from "@/components/pastoral/button";
import {
  adminArchiveLaunchPlanningScenario,
  adminCreateLaunchPlanningScenario,
  adminSetCurrentLaunchPlanningScenario,
  adminUpdateLaunchPlanningScenario,
} from "@/app/(protected)/admin/launch-planning/scenario-actions";
import { PercentField } from "@/components/admin/launch-planning/percent-field";
import {
  fieldInputClassName,
  fieldLabelClassName,
  formGridClassName,
} from "@/components/admin/forms/field-styles";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import type {
  LaunchPlanningAssumptions,
  LaunchPlanningScenario,
} from "@/lib/admin/launch-planning";
import { eyebrowClassName } from "./section-styles";

const hintClassName = "m-0 mt-1 font-sans text-2xs leading-[1.4] text-ink3";

// Shared assumption-field grid. Used by both create and edit forms so the
// LP.1 baseline form and the LP.2 scenario form expose the same set of
// editable inputs in the same order.
//
// The `idPrefix` parameter scopes input `id` attributes so the create
// panel and the edit panel can render at the same time without producing
// duplicate IDs in the DOM (which would break label→input targeting and
// fail accessibility audits).
//
// `required` is set on every numeric field so the scenario is always
// stored as a complete snapshot. Without the required guard, blank
// numerics would be dropped from the payload and the decoder would later
// fall back to global metric defaults — meaning a saved scenario could
// quietly change behavior when the defaults change.
function AssumptionFields({
  defaults,
  idPrefix,
}: {
  defaults: LaunchPlanningAssumptions;
  idPrefix: string;
}) {
  const fieldId = (name: string) => `${idPrefix}__${name}`;
  return (
    <>
      <div className={formGridClassName}>
        <div>
          <label
            htmlFor={fieldId("current_church_attendance")}
            className={fieldLabelClassName}
          >
            Current church attendance
          </label>
          <input
            id={fieldId("current_church_attendance")}
            name="current_church_attendance"
            type="number"
            required
            min={0}
            max={100000}
            inputMode="numeric"
            defaultValue={defaults.current_church_attendance}
            className={fieldInputClassName}
          />
          <p className={hintClassName}>Whole number of attendees today.</p>
        </div>

        <div>
          <label
            htmlFor={fieldId("expected_growth")}
            className={fieldLabelClassName}
          >
            Expected growth (people)
          </label>
          <input
            id={fieldId("expected_growth")}
            name="expected_growth"
            type="number"
            required
            min={-100000}
            max={100000}
            inputMode="numeric"
            defaultValue={defaults.expected_growth}
            className={fieldInputClassName}
          />
          <p className={hintClassName}>
            People expected to arrive by the date below. Use a negative number
            if you expect shrinkage.
          </p>
        </div>

        <div>
          <label
            htmlFor={fieldId("expected_growth_date")}
            className={fieldLabelClassName}
          >
            Expected growth date
          </label>
          <input
            id={fieldId("expected_growth_date")}
            name="expected_growth_date"
            type="date"
            defaultValue={defaults.expected_growth_date ?? ""}
            className={fieldInputClassName}
          />
          <p className={hintClassName}>
            Optional. Used to suggest launch timing.
          </p>
        </div>

        <PercentField
          id={fieldId("target_group_participation_pct")}
          name="target_group_participation_pct"
          label="Target group participation %"
          defaultRatio={defaults.target_group_participation_pct}
          required
          maxPercent={100}
          hint="Share of attendees in a group — e.g. 60 means 60%."
        />

        <div>
          <label
            htmlFor={fieldId("average_group_size")}
            className={fieldLabelClassName}
          >
            Average group size
          </label>
          <input
            id={fieldId("average_group_size")}
            name="average_group_size"
            type="number"
            required
            min={1}
            max={500}
            inputMode="numeric"
            defaultValue={defaults.average_group_size}
            className={fieldInputClassName}
          />
          <p className={hintClassName}>
            Used to convert the capacity gap into a new-group count.
          </p>
        </div>

        <PercentField
          id={fieldId("launch_buffer_pct")}
          name="launch_buffer_pct"
          label="Launch buffer %"
          defaultRatio={defaults.launch_buffer_pct}
          required
          maxPercent={95}
          hint="Spare-capacity headroom above projected demand — e.g. 15 reserves 15%. Max 95."
        />

        <div>
          <label
            htmlFor={fieldId("leaders_per_new_group")}
            className={fieldLabelClassName}
          >
            Shepherds per new group
          </label>
          <input
            id={fieldId("leaders_per_new_group")}
            name="leaders_per_new_group"
            type="number"
            required
            min={0}
            max={10}
            inputMode="numeric"
            defaultValue={defaults.leaders_per_new_group}
            className={fieldInputClassName}
          />
          <p className={hintClassName}>
            e.g. 2 = one shepherd + one co-shepherd.
          </p>
        </div>

        <div>
          <label
            htmlFor={fieldId("planned_launch_count")}
            className={fieldLabelClassName}
          >
            Planned launches
          </label>
          <input
            id={fieldId("planned_launch_count")}
            name="planned_launch_count"
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            defaultValue={defaults.planned_launch_count}
            className={fieldInputClassName}
          />
          <p className={hintClassName}>
            New groups to launch in this scenario (drives the shepherd gap).
          </p>
        </div>

        <div>
          <label
            htmlFor={fieldId("target_launch_month")}
            className={fieldLabelClassName}
          >
            Target season
          </label>
          <select
            id={fieldId("target_launch_month")}
            name="target_launch_month"
            defaultValue={defaults.target_launch_month ?? ""}
            className={fieldInputClassName}
          >
            <option value="">No target</option>
            <option value="1">January</option>
            <option value="8">August</option>
          </select>
          <p className={hintClassName}>Julian&rsquo;s planting seasons.</p>
        </div>

        <div>
          <label
            htmlFor={fieldId("target_launch_year")}
            className={fieldLabelClassName}
          >
            Target year
          </label>
          <input
            id={fieldId("target_launch_year")}
            name="target_launch_year"
            type="number"
            min={2024}
            max={2100}
            inputMode="numeric"
            defaultValue={defaults.target_launch_year ?? ""}
            placeholder="2026"
            className={fieldInputClassName}
          />
          <p className={hintClassName}>
            Apprentices Ready by this date count as staffing supply.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor={fieldId("notes")} className={fieldLabelClassName}>
          Scenario notes
        </label>
        <textarea
          id={fieldId("notes")}
          name="notes"
          rows={3}
          maxLength={NOTE_MAX_CHARS}
          defaultValue={defaults.notes ?? ""}
          className={`${fieldInputClassName} min-h-20 resize-y`}
          placeholder="Optional context for Julian's eyes only."
        />
        <p className={hintClassName}>
          Admin-only. Not shown anywhere outside this page and never logged in
          audit metadata.
        </p>
      </div>
    </>
  );
}

export function CreateScenarioForm({
  defaults,
  onClose,
  // Scopes this form's input ids so a second create form (e.g. the "Plan a
  // launch" hero action) can render alongside the Scenarios-tab one without
  // colliding ids / breaking label→input targeting.
  idPrefix = "create_scenario",
}: {
  defaults: LaunchPlanningAssumptions;
  onClose?: () => void;
  idPrefix?: string;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminCreateLaunchPlanningScenario
  );

  return (
    <form action={formAction} className="grid gap-4">
      <p className="m-0 font-sans text-sm leading-[1.55] text-ink2">
        Create a named alternative to compare against the baseline. The fields
        below seed from the baseline; tweak any of them to shape this scenario.
      </p>

      <div className={formGridClassName}>
        <div>
          <label htmlFor={`${idPrefix}__name`} className={fieldLabelClassName}>
            Scenario name
          </label>
          <input
            id={`${idPrefix}__name`}
            name="name"
            type="text"
            required
            maxLength={120}
            placeholder="Conservative, Expected, Stretch…"
            className={fieldInputClassName}
          />
          <p className={hintClassName}>Required. Max 120 characters.</p>
        </div>

        <div>
          <label
            htmlFor={`${idPrefix}__description`}
            className={fieldLabelClassName}
          >
            Description (optional)
          </label>
          <input
            id={`${idPrefix}__description`}
            name="description"
            type="text"
            maxLength={1000}
            placeholder="One-line context for this scenario."
            className={fieldInputClassName}
          />
          <p className={hintClassName}>Optional. Max 1000 characters.</p>
        </div>
      </div>

      <AssumptionFields defaults={defaults} idPrefix={idPrefix} />

      <label className="inline-flex items-center gap-2 font-sans text-sm text-ink">
        <input type="checkbox" name="make_current" value="true" />
        Mark as the current scenario (replaces any prior current).
      </label>

      <div className="flex flex-wrap items-center gap-2.5">
        <PButton type="submit" tone="terra" size="md" disabled={pending}>
          {pending ? "Saving…" : "Save scenario"}
        </PButton>
        {onClose ? (
          <PButton
            type="button"
            tone="ghost"
            size="md"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </PButton>
        ) : null}
        <FormStatus state={state} successText="Scenario saved." />
      </div>
    </form>
  );
}

export function EditScenarioForm({
  scenario,
}: {
  scenario: LaunchPlanningScenario;
}) {
  const {
    state: editState,
    formAction: editAction,
    pending: editPending,
  } = useActionForm<{ id: string }>(adminUpdateLaunchPlanningScenario);
  const {
    state: archiveState,
    formAction: archiveAction,
    pending: archivePending,
  } = useActionForm<{ id: string }>(adminArchiveLaunchPlanningScenario);
  const {
    state: setCurrentState,
    formAction: setCurrentAction,
    pending: setCurrentPending,
  } = useActionForm<{ id: string }>(adminSetCurrentLaunchPlanningScenario);

  // Local mirror so the "Mark as current" checkbox reflects the row state.
  // The is_current value can change underneath us when another scenario is
  // set current (or when this scenario is promoted via the "Make current"
  // sub-action below). When the prop changes after a server revalidation,
  // resync the checkbox so a subsequent "Save scenario" submit doesn't
  // silently clear is_current with a stale unchecked value.
  const [makeCurrent, setMakeCurrent] = useState<boolean>(scenario.is_current);
  // Resync the checkbox when the prop changes after a server revalidation.
  // Derived during render rather than in an effect to avoid the
  // cascading-render smell.
  useValueChange(scenario.is_current, (isCurrent) => {
    setMakeCurrent(isCurrent);
  });

  return (
    <div className="grid gap-[18px]">
      <header className="grid gap-1">
        <span className={eyebrowClassName}>Editing scenario</span>
        <h3 className="m-0 font-sans text-[18px] font-semibold text-ink">
          {scenario.name}
          {scenario.is_current ? (
            <span className="ml-2.5 rounded-pill border border-sage bg-sageSoft px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-[1.2px] text-sageDeep">
              Current
            </span>
          ) : null}
        </h3>
      </header>

      <form action={editAction} className="grid gap-4">
        <input type="hidden" name="scenario_id" value={scenario.id} />

        <div className={formGridClassName}>
          <div>
            <label
              htmlFor={`edit_name_${scenario.id}`}
              className={fieldLabelClassName}
            >
              Scenario name
            </label>
            <input
              id={`edit_name_${scenario.id}`}
              name="name"
              type="text"
              required
              maxLength={120}
              defaultValue={scenario.name}
              className={fieldInputClassName}
            />
          </div>

          <div>
            <label
              htmlFor={`edit_description_${scenario.id}`}
              className={fieldLabelClassName}
            >
              Description (optional)
            </label>
            <input
              id={`edit_description_${scenario.id}`}
              name="description"
              type="text"
              maxLength={1000}
              defaultValue={scenario.description ?? ""}
              className={fieldInputClassName}
            />
          </div>
        </div>

        <AssumptionFields
          defaults={scenario.assumptions}
          idPrefix={`edit_scenario_${scenario.id}`}
        />

        <label className="inline-flex items-center gap-2 font-sans text-sm text-ink">
          <input
            type="checkbox"
            name="make_current"
            value="true"
            checked={makeCurrent}
            onChange={(e) => setMakeCurrent(e.target.checked)}
          />
          Mark as the current scenario.
        </label>

        <div className="flex flex-wrap items-center gap-2.5">
          <PButton type="submit" tone="terra" size="md" disabled={editPending}>
            {editPending ? "Saving…" : "Save scenario"}
          </PButton>
          <FormStatus state={editState} successText="Saved." />
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2.5 border-t border-line pt-3.5">
        {!scenario.is_current ? (
          <form action={setCurrentAction}>
            <input type="hidden" name="scenario_id" value={scenario.id} />
            <PButton
              type="submit"
              tone="ghost"
              size="sm"
              disabled={setCurrentPending}
            >
              {setCurrentPending ? "Updating…" : "Make current"}
            </PButton>
          </form>
        ) : null}
        <FormStatus state={setCurrentState} successText="Marked current." />

        <form action={archiveAction}>
          <input type="hidden" name="scenario_id" value={scenario.id} />
          <PButton
            type="submit"
            tone="ghost"
            size="sm"
            disabled={archivePending}
          >
            {archivePending ? "Archiving…" : "Archive scenario"}
          </PButton>
        </form>
        <FormStatus state={archiveState} successText="Archived." />
      </div>
    </div>
  );
}
