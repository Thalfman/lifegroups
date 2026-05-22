"use client";

import { useState } from "react";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import { PButton } from "@/components/pastoral/button";
import {
  CreateScenarioForm,
  EditScenarioForm,
} from "@/components/admin/launch-planning/scenario-form";
import type {
  LaunchPlanningAssumptions,
  LaunchPlanningInputs,
  LaunchPlanningOutputs,
  LaunchPlanningRiskLevel,
  LaunchPlanningScenario,
  LaunchPlanningScenarioComparisonEntry,
} from "@/lib/admin/launch-planning";

function riskTone(level: LaunchPlanningRiskLevel): { label: string; accent: string } {
  switch (level) {
    case "ok":
      return { label: "OK", accent: P.sage };
    case "watch":
      return { label: "Watch", accent: P.terra };
    case "launch_needed":
      return { label: "Launch needed", accent: "#923220" };
  }
}

function fmtNumber(n: number, fractionDigits = 0): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

const sectionStyle = {
  background: P.surface,
  border: `1px solid ${P.line}`,
  borderRadius: 14,
  padding: "22px 24px",
} as const;

const eyebrowStyle = {
  fontFamily: fontSans,
  fontSize: 10,
  letterSpacing: 1.5,
  textTransform: "uppercase",
  color: P.ink3,
  fontWeight: 600,
} as const;

const titleStyle = {
  margin: "4px 0 0",
  fontFamily: fontBody,
  fontSize: 18,
  color: P.ink,
  fontWeight: 600,
} as const;

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
    ? scenarios.find((s) => s.id === selectedId) ?? null
    : null;

  const hasScenarios = scenarios.length > 0;

  return (
    <section style={{ display: "grid", gap: 18 }}>
      {/* ---------------------------------------------------------------- */}
      {/* List / selector + create CTA                                     */}
      {/* ---------------------------------------------------------------- */}
      <div style={sectionStyle}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <span style={eyebrowStyle}>Scenarios</span>
            <h2 style={titleStyle}>Saved forecast scenarios</h2>
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
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 13,
              color: P.ink2,
              margin: 0,
              lineHeight: 1.55,
            }}
          >
            No saved scenarios yet. The baseline assumptions above are still
            the source of truth — create Conservative / Expected / Stretch
            here to compare alternatives.
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
        <div style={sectionStyle}>
          <header style={{ marginBottom: 14 }}>
            <span style={eyebrowStyle}>Create scenario</span>
            <h2 style={titleStyle}>New saved scenario</h2>
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
        <div style={sectionStyle}>
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
  comparison: LaunchPlanningScenarioComparisonEntry[],
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
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "grid",
        gap: 1,
        background: P.line2,
        border: `1px solid ${P.line}`,
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {scenarios.map((scenario) => {
        const entry = comparisonByScenarioId.get(scenario.id);
        const risk = entry ? riskTone(entry.outputs.risk_level) : null;
        const isSelected = selectedId === scenario.id;
        return (
          <li
            key={scenario.id}
            className="lg-m-grid-stack"
            style={{
              background: isSelected ? P.bgDeep : P.surface,
              padding: "12px 16px",
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: 12,
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={() => onSelect(scenario.id)}
              style={{
                background: "transparent",
                border: 0,
                padding: 0,
                margin: 0,
                cursor: "pointer",
                textAlign: "left",
                fontFamily: fontBody,
                color: P.ink,
                display: "grid",
                gap: 4,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <strong
                  style={{
                    fontFamily: fontDisplay,
                    fontSize: 16,
                    fontWeight: 500,
                    color: P.ink,
                  }}
                >
                  {scenario.name}
                </strong>
                {scenario.is_current ? (
                  <span
                    style={{
                      fontFamily: fontSans,
                      fontSize: 10,
                      letterSpacing: 1.2,
                      textTransform: "uppercase",
                      color: P.sageTextStrong,
                      background: P.sageSoft,
                      border: `1px solid ${P.sage}`,
                      padding: "2px 8px",
                      borderRadius: 999,
                      fontWeight: 600,
                    }}
                  >
                    Current
                  </span>
                ) : null}
                {risk ? (
                  <span
                    style={{
                      fontFamily: fontSans,
                      fontSize: 10,
                      letterSpacing: 1.2,
                      textTransform: "uppercase",
                      color: risk.accent,
                      border: `1px solid ${risk.accent}`,
                      background: P.bg,
                      padding: "2px 8px",
                      borderRadius: 999,
                      fontWeight: 600,
                    }}
                  >
                    {risk.label}
                  </span>
                ) : null}
              </div>
              {scenario.description ? (
                <div
                  style={{
                    fontFamily: fontBody,
                    fontSize: 12,
                    color: P.ink2,
                    lineHeight: 1.4,
                  }}
                >
                  {scenario.description}
                </div>
              ) : null}
              {entry ? (
                <div
                  style={{
                    fontFamily: fontSans,
                    fontSize: 11,
                    color: P.ink3,
                    letterSpacing: 0.3,
                  }}
                >
                  Recommended new groups{" "}
                  <strong style={{ color: P.ink }}>
                    {fmtNumber(entry.outputs.recommended_new_groups)}
                  </strong>{" "}
                  · Projected demand{" "}
                  <strong style={{ color: P.ink }}>
                    {fmtNumber(entry.outputs.projected_group_demand)}
                  </strong>
                </div>
              ) : null}
            </button>
            {isSelected ? (
              <span
                style={{
                  fontFamily: fontSans,
                  fontSize: 10,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  color: P.ink3,
                  fontWeight: 600,
                }}
              >
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
      label: "Estimated new leaders",
      pick: (_a, o) => fmtNumber(o.estimated_new_leaders_needed),
    },
  ];

  return (
    <div style={sectionStyle}>
      <header style={{ marginBottom: 16 }}>
        <span style={eyebrowStyle}>Compare</span>
        <h2 style={titleStyle}>Scenario comparison</h2>
      </header>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink,
          }}
        >
          <thead>
            <tr>
              <th
                scope="col"
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  borderBottom: `1px solid ${P.line}`,
                  fontFamily: fontSans,
                  fontSize: 11,
                  letterSpacing: 0.8,
                  color: P.ink3,
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                Metric
              </th>
              {columns.map((col) => (
                <th
                  scope="col"
                  key={col.key}
                  style={{
                    textAlign: "left",
                    padding: "8px 10px",
                    borderBottom: `1px solid ${P.line}`,
                    fontFamily: fontSans,
                    fontSize: 11,
                    letterSpacing: 0.8,
                    color: P.ink3,
                    textTransform: "uppercase",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  {col.title}
                  {col.is_current ? (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 10,
                        color: P.sageTextStrong,
                        background: P.sageSoft,
                        border: `1px solid ${P.sage}`,
                        padding: "1px 6px",
                        borderRadius: 999,
                        textTransform: "uppercase",
                      }}
                    >
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
                  style={{
                    textAlign: "left",
                    padding: "8px 10px",
                    borderBottom: `1px solid ${P.line2}`,
                    fontFamily: fontBody,
                    fontSize: 13,
                    color: P.ink2,
                    fontWeight: 500,
                  }}
                >
                  {row.label}
                </th>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      padding: "8px 10px",
                      borderBottom: `1px solid ${P.line2}`,
                      fontFamily: fontDisplay,
                      fontSize: 15,
                      color: P.ink,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {row.pick(col.assumptions, col.outputs)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th
                scope="row"
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  fontFamily: fontBody,
                  fontSize: 13,
                  color: P.ink2,
                  fontWeight: 500,
                }}
              >
                Risk level
              </th>
              {columns.map((col) => {
                const risk = riskTone(col.outputs.risk_level);
                return (
                  <td
                    key={col.key}
                    style={{
                      padding: "8px 10px",
                      fontFamily: fontSans,
                      fontSize: 11,
                      letterSpacing: 1.2,
                      textTransform: "uppercase",
                      color: risk.accent,
                      fontWeight: 600,
                    }}
                  >
                    {risk.label}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
