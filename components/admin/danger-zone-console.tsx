"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { StatusBadge } from "@/components/admin/console-status";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";

// Danger Zone chooser (Super Admin redesign).
//
// The seven destructive workflows used to render fully expanded at once, which
// read as an overwhelming wall of confirm fields. This groups them by blast
// radius and reveals exactly one workflow at a time: the operator picks a
// workflow, and only that card mounts below. Switching workflows unmounts the
// previous card, so a half-typed type-to-confirm phrase never carries over.
//
// This component is purely a chooser — every type-to-confirm gate, disabled
// button condition, and server action lives unchanged inside the workflow cards
// it reveals.

export type DangerWorkflow = {
  id: string;
  label: string;
  // A one-line operator-facing note on what the workflow touches.
  riskNote?: string;
  // Marks a workflow whose effect can't be undone from the app (no snapshot to
  // restore). Carries the shared destructive treatment (#451) so its launcher
  // can never read like the recoverable resets.
  destructive?: boolean;
  node: ReactNode;
};

export type DangerWorkflowGroup = {
  id: string;
  // Blast-radius group label (e.g. "Launch reset", "Permanent delete").
  label: string;
  workflows: DangerWorkflow[];
};

export function DangerZoneConsole({
  groups,
}: {
  groups: DangerWorkflowGroup[];
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const allWorkflows = groups.flatMap((group) => group.workflows);
  const active = allWorkflows.find((workflow) => workflow.id === activeId);

  return (
    <div style={{ display: "grid", gap: 18, minWidth: 0 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <h2 style={headingStyle}>Danger Zone</h2>
        <p style={ledeStyle}>
          Guarded actions grouped by how much they touch. The cards below are
          launchers, not buttons — opening one only reveals its workflow.
          Nothing runs until you type that workflow&rsquo;s confirmation phrase,
          and resets capture a recoverable snapshot before anything is removed.
        </p>
      </div>

      <div
        role="group"
        aria-label="Choose a danger-zone workflow"
        style={{ display: "grid", gap: 14 }}
      >
        {groups.map((group) => (
          <div key={group.id} style={{ display: "grid", gap: 8 }}>
            <div style={groupLabelStyle}>{group.label}</div>
            <div className="lg-m-grid-stack" style={chooserGridStyle}>
              {group.workflows.map((workflow) => {
                const selected = workflow.id === activeId;
                return (
                  <button
                    key={workflow.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setActiveId(selected ? null : workflow.id)}
                    style={chooserButtonStyle(
                      selected,
                      Boolean(workflow.destructive)
                    )}
                  >
                    <span
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 8,
                      }}
                    >
                      <span style={chooserButtonLabelStyle}>
                        {workflow.label}
                      </span>
                      <StatusBadge
                        label={
                          workflow.destructive ? "Permanent" : "Recoverable"
                        }
                        tone={workflow.destructive ? "destructive" : "guarded"}
                      />
                    </span>
                    {workflow.riskNote ? (
                      <span style={chooserButtonNoteStyle}>
                        {workflow.riskNote}
                      </span>
                    ) : null}
                    <span style={chooserOpenHintStyle(selected)}>
                      {selected
                        ? "Workflow open below ↓"
                        : openWorkflowLabel(workflow.label)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {active ? (
        <section
          aria-label={`${active.label} workflow`}
          style={{ display: "grid", gap: 10 }}
        >
          {active.node}
        </section>
      ) : (
        <p style={placeholderStyle}>
          Select a workflow above to open it. Nothing runs until you type its
          confirmation phrase inside.
        </p>
      )}
    </div>
  );
}

// "Open … workflow" copy applied generically (#459), so the launcher reads as
// a door into a guarded workflow rather than a one-click action — and stays
// correct however the workflows are grouped.
function openWorkflowLabel(label: string): string {
  return `Open ${label.charAt(0).toLowerCase()}${label.slice(1)} workflow`;
}

const headingStyle: CSSProperties = {
  fontFamily: fontDisplay,
  fontSize: 20,
  fontWeight: 600,
  color: P.ink,
  margin: 0,
};

const ledeStyle: CSSProperties = {
  fontFamily: fontBody,
  fontSize: 13,
  color: P.ink2,
  lineHeight: 1.55,
  margin: 0,
  maxWidth: 640,
};

const groupLabelStyle: CSSProperties = {
  fontFamily: fontSans,
  fontSize: 11,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: P.ink3,
  fontWeight: 700,
};

const chooserGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
  gap: 10,
};

function chooserButtonStyle(
  selected: boolean,
  destructive: boolean
): CSSProperties {
  return {
    appearance: "none",
    textAlign: "left",
    display: "grid",
    gap: 6,
    alignContent: "start",
    padding: "12px 14px",
    borderRadius: 10,
    cursor: "pointer",
    background: selected ? P.terraSoft : P.surface,
    // A destructive launcher keeps its terra border even at rest, so it never
    // blends in with the recoverable resets.
    border: `1px solid ${selected || destructive ? P.terra : P.line}`,
    boxShadow: selected
      ? `inset 3px 0 0 ${P.terra}, 0 0 0 1px ${P.terra}`
      : "none",
    transition: "background .12s, border-color .12s, box-shadow .12s",
  };
}

const chooserButtonLabelStyle: CSSProperties = {
  fontFamily: fontSans,
  fontSize: 13.5,
  fontWeight: 600,
  color: P.ink,
};

const chooserButtonNoteStyle: CSSProperties = {
  fontFamily: fontBody,
  fontSize: 12,
  color: P.ink2,
  lineHeight: 1.45,
};

// The launcher's action line: what clicking does (open, not run). Terra ink so
// it reads as the card's interactive affordance; the selected card swaps it
// for a "workflow open below" state line, keeping the chosen card obvious.
function chooserOpenHintStyle(selected: boolean): CSSProperties {
  return {
    fontFamily: fontSans,
    fontSize: 12,
    fontWeight: 700,
    color: P.terraTextStrong,
    ...(selected ? null : { textDecoration: "underline" }),
  };
}

const placeholderStyle: CSSProperties = {
  fontFamily: fontBody,
  fontSize: 13,
  color: P.ink3,
  margin: 0,
  padding: "16px 18px",
  border: `1px dashed ${P.line}`,
  borderRadius: 10,
  background: P.surface,
};
