"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
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
          Guarded, reversible actions grouped by how much they touch. Pick one
          workflow to open it — each is gated behind a type-to-confirm phrase
          and captures a recoverable snapshot before anything is removed. Only
          the workflow you select is shown.
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
                    style={chooserButtonStyle(selected)}
                  >
                    <span style={chooserButtonLabelStyle}>
                      {workflow.label}
                    </span>
                    {workflow.riskNote ? (
                      <span style={chooserButtonNoteStyle}>
                        {workflow.riskNote}
                      </span>
                    ) : null}
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
          Select a workflow above to reveal its controls.
        </p>
      )}
    </div>
  );
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

function chooserButtonStyle(selected: boolean): CSSProperties {
  return {
    appearance: "none",
    textAlign: "left",
    display: "grid",
    gap: 4,
    padding: "12px 14px",
    borderRadius: 10,
    cursor: "pointer",
    background: selected ? P.terraSoft : P.surface,
    border: `1px solid ${selected ? P.terra : P.line}`,
    boxShadow: selected ? `inset 3px 0 0 ${P.terra}` : "none",
    transition: "background .12s, border-color .12s",
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
