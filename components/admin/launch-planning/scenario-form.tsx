"use client";

import { useEffect, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import {
  adminArchiveLaunchPlanningScenario,
  adminCreateLaunchPlanningScenario,
  adminSetCurrentLaunchPlanningScenario,
  adminUpdateLaunchPlanningScenario,
} from "@/app/(protected)/admin/launch-planning/scenario-actions";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import { PercentField } from "@/components/admin/launch-planning/percent-field";
import {
  fieldInputStyle,
  fieldLabelStyle,
  formGridStyle,
} from "@/components/admin/forms/field-styles";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import type {
  LaunchPlanningAssumptions,
  LaunchPlanningScenario,
} from "@/lib/admin/launch-planning";

const hintStyle = {
  fontFamily: fontBody,
  fontSize: 11,
  color: P.ink3,
  margin: "4px 0 0",
  lineHeight: 1.4,
} as const;

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
      <div className="lg-m-grid-stack" style={formGridStyle}>
        <div>
          <label
            htmlFor={fieldId("current_church_attendance")}
            style={fieldLabelStyle}
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
            style={fieldInputStyle}
          />
          <p style={hintStyle}>Whole number of attendees today.</p>
        </div>

        <div>
          <label htmlFor={fieldId("expected_growth")} style={fieldLabelStyle}>
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
            style={fieldInputStyle}
          />
          <p style={hintStyle}>
            People expected to arrive by the date below. Use a negative number
            if you expect shrinkage.
          </p>
        </div>

        <div>
          <label
            htmlFor={fieldId("expected_growth_date")}
            style={fieldLabelStyle}
          >
            Expected growth date
          </label>
          <input
            id={fieldId("expected_growth_date")}
            name="expected_growth_date"
            type="date"
            defaultValue={defaults.expected_growth_date ?? ""}
            style={fieldInputStyle}
          />
          <p style={hintStyle}>Optional. Used to suggest launch timing.</p>
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
            style={fieldLabelStyle}
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
            style={fieldInputStyle}
          />
          <p style={hintStyle}>
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
            style={fieldLabelStyle}
          >
            Leaders per new group
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
            style={fieldInputStyle}
          />
          <p style={hintStyle}>e.g. 2 = one leader + one co-leader.</p>
        </div>

        <div>
          <label
            htmlFor={fieldId("planned_launch_count")}
            style={fieldLabelStyle}
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
            style={fieldInputStyle}
          />
          <p style={hintStyle}>
            New groups to launch in this scenario (drives the leader gap).
          </p>
        </div>

        <div>
          <label
            htmlFor={fieldId("target_launch_month")}
            style={fieldLabelStyle}
          >
            Target season
          </label>
          <select
            id={fieldId("target_launch_month")}
            name="target_launch_month"
            defaultValue={defaults.target_launch_month ?? ""}
            style={fieldInputStyle}
          >
            <option value="">No target</option>
            <option value="1">January</option>
            <option value="8">August</option>
          </select>
          <p style={hintStyle}>Julian&rsquo;s planting seasons.</p>
        </div>

        <div>
          <label
            htmlFor={fieldId("target_launch_year")}
            style={fieldLabelStyle}
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
            style={fieldInputStyle}
          />
          <p style={hintStyle}>
            Apprentices Ready by this date count as staffing supply.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor={fieldId("notes")} style={fieldLabelStyle}>
          Scenario notes
        </label>
        <textarea
          id={fieldId("notes")}
          name="notes"
          rows={3}
          maxLength={2000}
          defaultValue={defaults.notes ?? ""}
          style={{
            ...fieldInputStyle,
            minHeight: 80,
            resize: "vertical",
            fontFamily: fontBody,
          }}
          placeholder="Optional context for Julian's eyes only."
        />
        <p style={hintStyle}>
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
    <form action={formAction} style={{ display: "grid", gap: 16 }}>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          color: P.ink2,
          margin: 0,
          lineHeight: 1.55,
        }}
      >
        Create a named alternative to compare against the baseline. The fields
        below seed from the baseline; tweak any of them to shape this scenario.
      </p>

      <div className="lg-m-grid-stack" style={formGridStyle}>
        <div>
          <label htmlFor={`${idPrefix}__name`} style={fieldLabelStyle}>
            Scenario name
          </label>
          <input
            id={`${idPrefix}__name`}
            name="name"
            type="text"
            required
            maxLength={120}
            placeholder="Conservative, Expected, Stretch…"
            style={fieldInputStyle}
          />
          <p style={hintStyle}>Required. Max 120 characters.</p>
        </div>

        <div>
          <label htmlFor={`${idPrefix}__description`} style={fieldLabelStyle}>
            Description (optional)
          </label>
          <input
            id={`${idPrefix}__description`}
            name="description"
            type="text"
            maxLength={1000}
            placeholder="One-line context for this scenario."
            style={fieldInputStyle}
          />
          <p style={hintStyle}>Optional. Max 1000 characters.</p>
        </div>
      </div>

      <AssumptionFields defaults={defaults} idPrefix={idPrefix} />

      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontFamily: fontBody,
          fontSize: 13,
          color: P.ink,
        }}
      >
        <input type="checkbox" name="make_current" value="true" />
        Mark as the current scenario (replaces any prior current).
      </label>

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
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

      <FormStatus state={state} />
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
  useEffect(() => {
    setMakeCurrent(scenario.is_current);
  }, [scenario.is_current]);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <header
        style={{
          display: "grid",
          gap: 4,
        }}
      >
        <span
          style={{
            fontFamily: fontSans,
            fontSize: 10,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            color: P.ink3,
            fontWeight: 600,
          }}
        >
          Editing scenario
        </span>
        <h3
          style={{
            margin: 0,
            fontFamily: fontBody,
            fontSize: 18,
            color: P.ink,
            fontWeight: 600,
          }}
        >
          {scenario.name}
          {scenario.is_current ? (
            <span
              style={{
                marginLeft: 10,
                fontSize: 10,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                color: P.sageTextStrong,
                background: P.sageSoft,
                border: `1px solid ${P.sage}`,
                padding: "2px 8px",
                borderRadius: 999,
                fontFamily: fontSans,
                fontWeight: 600,
              }}
            >
              Current
            </span>
          ) : null}
        </h3>
      </header>

      <form action={editAction} style={{ display: "grid", gap: 16 }}>
        <input type="hidden" name="scenario_id" value={scenario.id} />

        <div className="lg-m-grid-stack" style={formGridStyle}>
          <div>
            <label htmlFor={`edit_name_${scenario.id}`} style={fieldLabelStyle}>
              Scenario name
            </label>
            <input
              id={`edit_name_${scenario.id}`}
              name="name"
              type="text"
              required
              maxLength={120}
              defaultValue={scenario.name}
              style={fieldInputStyle}
            />
          </div>

          <div>
            <label
              htmlFor={`edit_description_${scenario.id}`}
              style={fieldLabelStyle}
            >
              Description (optional)
            </label>
            <input
              id={`edit_description_${scenario.id}`}
              name="description"
              type="text"
              maxLength={1000}
              defaultValue={scenario.description ?? ""}
              style={fieldInputStyle}
            />
          </div>
        </div>

        <AssumptionFields
          defaults={scenario.assumptions}
          idPrefix={`edit_scenario_${scenario.id}`}
        />

        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink,
          }}
        >
          <input
            type="checkbox"
            name="make_current"
            value="true"
            checked={makeCurrent}
            onChange={(e) => setMakeCurrent(e.target.checked)}
          />
          Mark as the current scenario.
        </label>

        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <PButton type="submit" tone="terra" size="md" disabled={editPending}>
            {editPending ? "Saving…" : "Save scenario"}
          </PButton>
          <FormStatus state={editState} successText="Saved." />
        </div>

        <FormStatus state={editState} />
      </form>

      <div
        style={{
          borderTop: `1px solid ${P.line}`,
          paddingTop: 14,
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
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
