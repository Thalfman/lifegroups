"use client";

import { adminUpdateMetricDefaults } from "@/app/(protected)/admin/settings/actions";
import { cn } from "@/lib/utils";
import {
  fieldHintClassName,
  fieldInputClassName,
  fieldLabelClassName,
  fieldSelectClassName,
  formGridClassName,
  formNoteClassName,
} from "./field-styles";
import type { MetricDefaults } from "@/lib/admin/metrics";
import { useActionForm, FormStatus } from "./action-form";
import { Button } from "@/components/ui/button";

// The grouping containers keep the `.lg-m-grid-stack` marker class: the
// Settings a11y spec resolves related threshold fields to their shared
// container via that class (req 5's grouping criterion).
const THRESHOLD_GRID = cn("lg-m-grid-stack", formGridClassName);

export function MetricDefaultsForm({ defaults }: { defaults: MetricDefaults }) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminUpdateMetricDefaults
  );

  return (
    <form action={formAction} className="grid gap-4">
      <p className={formNoteClassName}>
        Every threshold here is grouped by what it drives. The Care cadence pair
        and the three group-health thresholds drive the live Care and Home
        surfaces today; the capacity set only drives surfaces currently hidden
        from navigation. Leave a field blank to keep its current value.
      </p>

      {/* #478 (P1.7): fields are grouped by their LIVE consumer. This fieldset
          holds everything a visible surface reads today — the Care cadence
          pair (the Care dashboard's overdue-contact flags, CONTEXT.md "Care
          cadence") and the three Group-health thresholds: the two triage
          thresholds (Admin IM 05, #265 — the Watch filter, which also feeds
          the Home health distribution) and the healthy-attendance cut line,
          which fetchGroupHealthRubric overlays into the live A–F rubric. The
          capacity knobs that only feed hidden surfaces are disclosed
          separately below. min-w-0 keeps the fieldset from refusing to shrink
          below its content (fieldsets default to min-content), which would
          force horizontal overflow on a phone viewport. */}
      <fieldset className="m-0 grid min-w-0 gap-4 rounded-sm border border-line px-4 pb-4 pt-3">
        <legend className="px-1.5 font-sans text-sm font-semibold text-ink">
          Drives Care &amp; Home today
        </legend>

        <div className={THRESHOLD_GRID}>
          <div>
            <label
              htmlFor="shepherd_care_stale_days_direct"
              className={fieldLabelClassName}
            >
              Care cadence — directly overseen (days)
            </label>
            <input
              id="shepherd_care_stale_days_direct"
              name="shepherd_care_stale_days_direct"
              type="number"
              min={7}
              max={365}
              inputMode="numeric"
              defaultValue={defaults.shepherd_care_stale_days_direct}
              className={fieldInputClassName}
            />
            <p className={fieldHintClassName}>
              Days since last contact before a shepherd the Ministry Admin
              oversees directly is flagged on the Care dashboard. 7–365.
            </p>
          </div>

          <div>
            <label
              htmlFor="shepherd_care_stale_days_delegated"
              className={fieldLabelClassName}
            >
              Care cadence — delegated (days)
            </label>
            <input
              id="shepherd_care_stale_days_delegated"
              name="shepherd_care_stale_days_delegated"
              type="number"
              min={7}
              max={365}
              inputMode="numeric"
              defaultValue={defaults.shepherd_care_stale_days_delegated}
              className={fieldInputClassName}
            />
            <p className={fieldHintClassName}>
              Days since last contact before a shepherd with an active
              Over-Shepherd is flagged on the Care dashboard. 7–365.
            </p>
          </div>
        </div>

        {/* Admin IM 05 (#265): the two director-confirmed Group-health triage
            thresholds. Sourced here (not hard-coded) so the Watch filter
            honours the director's mental model. */}
        <div className={THRESHOLD_GRID}>
          <div>
            <label
              htmlFor="group_health_watch_grade"
              className={fieldLabelClassName}
            >
              Group-health Watch grade
            </label>
            <select
              id="group_health_watch_grade"
              name="group_health_watch_grade"
              defaultValue={defaults.group_health_watch_grade}
              className={fieldSelectClassName}
            >
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
            </select>
            <p className={fieldHintClassName}>
              Groups graded at or below this letter land on the Watch filter and
              feed the Home health distribution.
            </p>
          </div>

          <div>
            <label
              htmlFor="group_health_attendance_decline_margin_pct"
              className={fieldLabelClassName}
            >
              Attendance decline margin (points)
            </label>
            <input
              id="group_health_attendance_decline_margin_pct"
              name="group_health_attendance_decline_margin_pct"
              type="number"
              min={0}
              max={100}
              inputMode="numeric"
              defaultValue={defaults.group_health_attendance_decline_margin_pct}
              className={fieldInputClassName}
            />
            <p className={fieldHintClassName}>
              0–100. A group whose recent 4-week attendance average drops below
              the prior 4 weeks by at least this many points counts as declining
              (Watch), feeding the Home health distribution.
            </p>
          </div>

          <div>
            <label
              htmlFor="default_healthy_attendance_pct"
              className={fieldLabelClassName}
            >
              Healthy attendance %
            </label>
            <input
              id="default_healthy_attendance_pct"
              name="default_healthy_attendance_pct"
              type="number"
              min={0}
              max={100}
              inputMode="numeric"
              defaultValue={defaults.default_healthy_attendance_pct}
              className={fieldInputClassName}
            />
            <p className={fieldHintClassName}>
              0–100. The A–F rubric&apos;s healthy-attendance cut line — grades
              drive the Watch filter and feed the Home health distribution.
            </p>
          </div>
        </div>
      </fieldset>

      {/* #478 (P1.7): the capacity set only drives the metric warnings on
          surfaces hidden behind Super-Admin nav flags today, so it sits
          behind a disclosure that says exactly that. (Healthy attendance %
          lives in the live group above: fetchGroupHealthRubric overlays it
          into the A–F rubric.) The editable inputs stay mounted inside the
          form, so they still submit when collapsed. The two read-only
          check-in cadence reference rows were retired from this surface
          entirely (#472) — check-ins are a frozen surface (ADR 0002, #160)
          and nothing consumes those values here. */}
      <details className="rounded-sm border border-line bg-bg px-4 py-3">
        <summary className="cursor-pointer font-sans text-sm font-semibold text-ink">
          Drives hidden surfaces
        </summary>
        <div className="mt-4 grid gap-4">
          <p className="m-0 font-sans text-xs text-ink3">
            These capacity thresholds only drive warnings on surfaces currently
            hidden behind Super-Admin nav flags (the old Groups and Planning
            pages). Nothing on Care, Plan, Multiply, or Home reads them today.
          </p>
          <div className={THRESHOLD_GRID}>
            <div>
              <label
                htmlFor="default_group_capacity"
                className={fieldLabelClassName}
              >
                Default group capacity
              </label>
              <input
                id="default_group_capacity"
                name="default_group_capacity"
                type="number"
                min={1}
                max={500}
                inputMode="numeric"
                defaultValue={defaults.default_group_capacity ?? ""}
                placeholder="Unknown"
                className={fieldInputClassName}
              />
              <p className={fieldHintClassName}>1–500. Blank means Unknown.</p>
            </div>

            <div>
              <label
                htmlFor="capacity_warning_threshold_pct"
                className={fieldLabelClassName}
              >
                Capacity warning %
              </label>
              <input
                id="capacity_warning_threshold_pct"
                name="capacity_warning_threshold_pct"
                type="number"
                min={0}
                max={300}
                inputMode="numeric"
                defaultValue={defaults.capacity_warning_threshold_pct}
                className={fieldInputClassName}
              />
              <p className={fieldHintClassName}>Flag at this fill % (0–300).</p>
            </div>

            <div>
              <label
                htmlFor="capacity_full_threshold_pct"
                className={fieldLabelClassName}
              >
                Capacity full %
              </label>
              <input
                id="capacity_full_threshold_pct"
                name="capacity_full_threshold_pct"
                type="number"
                min={1}
                max={300}
                inputMode="numeric"
                defaultValue={defaults.capacity_full_threshold_pct}
                className={fieldInputClassName}
              />
              <p className={fieldHintClassName}>
                Mark as full at this % (1–300, ≥ warning).
              </p>
            </div>
          </div>
        </div>
      </details>

      <div className="flex items-center gap-2.5">
        <Button type="submit" variant="primary" size="md" disabled={pending}>
          {pending ? "Saving…" : "Save defaults"}
        </Button>
        <FormStatus state={state} successText="Defaults saved." />
      </div>
    </form>
  );
}
