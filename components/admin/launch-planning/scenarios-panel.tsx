"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { PButton } from "@/components/pastoral/button";
import { ScrollableTable } from "@/components/ui/scrollable-table";
import type {
  LaunchPlanningAssumptions,
  LaunchPlanningInputs,
  LaunchPlanningOutputs,
  LaunchPlanningScenario,
  LaunchPlanningScenarioComparisonEntry,
} from "@/lib/admin/launch-planning";
import { fmtNumber, riskToneClasses } from "@/lib/admin/launch-planning";
import {
  eyebrowClassName,
  panelTitleClassName as titleClassName,
  sectionClassName,
} from "./section-styles";

// Both scenario forms are only mounted behind a click (create / select-to-edit)
// and never render on the server, so keep their code out of this route's First
// Load JS — load it on demand. ssr:false is safe: they are client-only.
const CreateScenarioForm = dynamic(
  () =>
    import("@/components/admin/launch-planning/scenario-form").then(
      (m) => m.CreateScenarioForm
    ),
  { ssr: false }
);
const EditScenarioForm = dynamic(
  () =>
    import("@/components/admin/launch-planning/scenario-form").then(
      (m) => m.EditScenarioForm
    ),
  { ssr: false }
);

export type ScenariosPanelProps = {
  scenarios: LaunchPlanningScenario[];
  baseline: LaunchPlanningAssumptions;
  inputs: LaunchPlanningInputs;
  baselineOutputs: LaunchPlanningOutputs;
  comparison: LaunchPlanningScenarioComparisonEntry[];
};

export function ScenariosPanel({
  scenarios,
  baseline,
  inputs,
  baselineOutputs,
  comparison,
}: ScenariosPanelProps) {
  const [createOpen, setCreateOpen] = useState<boolean>(false);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (scenarios.length === 0) return null;
    const current = scenarios.find((s) => s.is_current);
    return current ? current.id : scenarios[0].id;
  });

  const selected = selectedId
    ? (scenarios.find((s) => s.id === selectedId) ?? null)
    : null;

  const hasScenarios = scenarios.length > 0;

  return (
    <section className="grid gap-[18px]">
      {/* ---------------------------------------------------------------- */}
      {/* List / selector + create CTA                                     */}
      {/* ---------------------------------------------------------------- */}
      <div className={sectionClassName}>
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className={eyebrowClassName}>Scenarios</span>
            <h2 className={titleClassName}>Saved forecast scenarios</h2>
          </div>
          <PButton
            type="button"
            tone={createOpen ? "ghost" : "terra"}
            size="sm"
            onClick={() => setCreateOpen((open) => !open)}
          >
            {createOpen
              ? "Cancel"
              : hasScenarios
                ? "Create scenario"
                : "Create scenario from current assumptions"}
          </PButton>
        </header>

        {!hasScenarios && !createOpen ? (
          <p className="m-0 font-sans text-sm leading-[1.55] text-ink2">
            No saved scenarios yet. The baseline assumptions above are still the
            source of truth — create Conservative / Expected / Stretch here to
            compare alternatives.
          </p>
        ) : null}

        {hasScenarios ? (
          <ScenarioList
            scenarios={scenarios}
            comparisonByScenarioId={byScenarioId(comparison)}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        ) : null}
      </div>

      {createOpen ? (
        <div className={sectionClassName}>
          <header className="mb-3.5">
            <span className={eyebrowClassName}>Create scenario</span>
            <h2 className={titleClassName}>New saved scenario</h2>
          </header>
          <CreateScenarioForm
            defaults={baseline}
            onClose={() => setCreateOpen(false)}
          />
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Edit panel                                                       */}
      {/* ---------------------------------------------------------------- */}
      {selected ? (
        <div className={sectionClassName}>
          {/* `key` forces a remount when the operator picks a different
              scenario so the form's defaultValues + local state pick up
              the new row instead of holding the prior selection. */}
          <EditScenarioForm key={selected.id} scenario={selected} />
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Comparison table                                                 */}
      {/* ---------------------------------------------------------------- */}
      {hasScenarios ? (
        <ScenarioComparisonTable
          comparison={comparison}
          baseline={baseline}
          baselineOutputs={baselineOutputs}
          inputs={inputs}
        />
      ) : null}
    </section>
  );
}

function byScenarioId(
  comparison: LaunchPlanningScenarioComparisonEntry[]
): Map<string, LaunchPlanningScenarioComparisonEntry> {
  const map = new Map<string, LaunchPlanningScenarioComparisonEntry>();
  for (const entry of comparison) map.set(entry.scenario.id, entry);
  return map;
}

function ScenarioList({
  scenarios,
  comparisonByScenarioId,
  selectedId,
  onSelect,
}: {
  scenarios: LaunchPlanningScenario[];
  comparisonByScenarioId: Map<string, LaunchPlanningScenarioComparisonEntry>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="m-0 grid list-none gap-px overflow-hidden rounded-sm border border-line bg-lineSoft p-0">
      {scenarios.map((scenario) => {
        const entry = comparisonByScenarioId.get(scenario.id);
        const risk = entry ? riskToneClasses(entry.outputs.risk_level) : null;
        const isSelected = selectedId === scenario.id;
        return (
          <li
            key={scenario.id}
            className={cn(
              "lg-m-grid-stack grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3",
              isSelected ? "bg-sidebar" : "bg-surface"
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(scenario.id)}
              className="m-0 grid cursor-pointer gap-1 border-0 bg-transparent p-0 text-left font-sans text-ink"
            >
              <div className="flex flex-wrap items-center gap-2.5">
                <strong className="font-display text-[16px] font-medium text-ink">
                  {scenario.name}
                </strong>
                {scenario.is_current ? (
                  <span className="rounded-pill border border-sage bg-sageSoft px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-[1.2px] text-sageDeep">
                    Current
                  </span>
                ) : null}
                {risk ? (
                  <span
                    className={`rounded-pill border bg-bg px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-[1.2px] ${risk.text} ${risk.border}`}
                  >
                    {risk.label}
                  </span>
                ) : null}
              </div>
              {scenario.description ? (
                <div className="font-sans text-xs text-ink2">
                  {scenario.description}
                </div>
              ) : null}
              {entry ? (
                <div className="font-sans text-2xs tracking-[0.3px] text-ink3">
                  Recommended new groups{" "}
                  <strong className="text-ink">
                    {fmtNumber(entry.outputs.recommended_new_groups)}
                  </strong>{" "}
                  · Projected demand{" "}
                  <strong className="text-ink">
                    {fmtNumber(entry.outputs.projected_group_demand)}
                  </strong>
                </div>
              ) : null}
            </button>
            {isSelected ? (
              <span className="font-sans text-[10px] font-semibold uppercase tracking-[1.2px] text-ink3">
                Editing
              </span>
            ) : (
              <PButton
                type="button"
                tone="ghost"
                size="sm"
                onClick={() => onSelect(scenario.id)}
              >
                Open
              </PButton>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ScenarioComparisonTable({
  comparison,
  baseline,
  baselineOutputs,
  inputs,
}: {
  comparison: LaunchPlanningScenarioComparisonEntry[];
  baseline: LaunchPlanningAssumptions;
  baselineOutputs: LaunchPlanningOutputs;
  inputs: LaunchPlanningInputs;
}) {
  type Column = {
    key: string;
    title: string;
    is_current: boolean;
    assumptions: LaunchPlanningAssumptions;
    outputs: LaunchPlanningOutputs;
  };
  const columns: Column[] = [
    {
      key: "__baseline__",
      title: "Baseline",
      is_current: false,
      assumptions: baseline,
      outputs: baselineOutputs,
    },
    ...comparison.map((entry) => ({
      key: entry.scenario.id,
      title: entry.scenario.name,
      is_current: entry.scenario.is_current,
      assumptions: entry.scenario.assumptions,
      outputs: entry.outputs,
    })),
  ];

  const rows: {
    label: string;
    pick: (a: LaunchPlanningAssumptions, o: LaunchPlanningOutputs) => string;
  }[] = [
    {
      label: "Attendance",
      pick: (a) => fmtNumber(a.current_church_attendance),
    },
    {
      label: "Expected growth",
      pick: (a) => fmtNumber(a.expected_growth),
    },
    {
      label: "Projected demand",
      pick: (_a, o) => fmtNumber(o.projected_group_demand),
    },
    {
      label: "Effective capacity",
      pick: () => fmtNumber(inputs.effective_total_capacity),
    },
    {
      label: "Capacity gap",
      pick: (_a, o) => fmtNumber(o.capacity_gap),
    },
    {
      label: "Recommended new groups",
      pick: (_a, o) => fmtNumber(o.recommended_new_groups),
    },
    {
      label: "Estimated new shepherds",
      pick: (_a, o) => fmtNumber(o.estimated_new_leaders_needed),
    },
  ];

  return (
    <div className={sectionClassName}>
      <header className="mb-4">
        <span className={eyebrowClassName}>Compare</span>
        <h2 className={titleClassName}>Scenario comparison</h2>
      </header>

      <ScrollableTable>
        <table className="w-full border-collapse font-sans text-sm text-ink">
          <thead>
            <tr>
              <th
                scope="col"
                className="border-b border-line px-2.5 py-2 text-left font-sans text-2xs font-semibold uppercase tracking-[0.8px] text-ink3"
              >
                Metric
              </th>
              {columns.map((col) => (
                <th
                  scope="col"
                  key={col.key}
                  className="whitespace-nowrap border-b border-line px-2.5 py-2 text-left font-sans text-2xs font-semibold uppercase tracking-[0.8px] text-ink3"
                >
                  {col.title}
                  {col.is_current ? (
                    <span className="ml-1.5 rounded-pill border border-sage bg-sageSoft px-1.5 py-px text-[10px] uppercase text-sageDeep">
                      Current
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                <th
                  scope="row"
                  className="border-b border-lineSoft px-2.5 py-2 text-left font-sans text-sm font-medium text-ink2"
                >
                  {row.label}
                </th>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className="border-b border-lineSoft px-2.5 py-2 font-display text-md tabular-nums text-ink"
                  >
                    {row.pick(col.assumptions, col.outputs)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th
                scope="row"
                className="px-2.5 py-2 text-left font-sans text-sm font-medium text-ink2"
              >
                Risk level
              </th>
              {columns.map((col) => {
                const risk = riskToneClasses(col.outputs.risk_level);
                return (
                  <td
                    key={col.key}
                    className={`px-2.5 py-2 font-sans text-2xs font-semibold uppercase tracking-[1.2px] ${risk.text}`}
                  >
                    {risk.label}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </ScrollableTable>
    </div>
  );
}
