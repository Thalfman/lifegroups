"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/admin/console-status";

// Danger Zone chooser (Super Admin redesign).
//
// The seven destructive workflows used to render fully expanded at once, which
// read as an overwhelming wall of confirm fields. This groups them by risk
// level — lowest risk first, permanent deletion set apart last — and reveals
// exactly one workflow at a time: the operator picks a workflow, and only that
// card mounts below. Switching workflows unmounts the previous card, so a
// half-typed type-to-confirm phrase never carries over.
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
  // Risk-level group label (e.g. "Launch preparation", "Permanent deletion").
  label: string;
  // Marks the highest-risk group (permanent deletion). Its chooser renders
  // inside a rose-bordered panel set apart from the recoverable groups, so
  // reaching it is a deliberate visual step — never just one more reset row.
  destructive?: boolean;
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
    <div className="grid min-w-0 gap-4">
      <div className="grid gap-1.5">
        <h2 className="m-0 font-display text-xl font-semibold text-ink">
          Danger Zone
        </h2>
        <p className="m-0 max-w-[640px] font-sans text-sm text-ink2">
          Guarded actions grouped by risk, lowest first. The cards below are
          launchers, not buttons — opening one only reveals its workflow.
          Nothing runs until you type that workflow&rsquo;s confirmation phrase,
          and resets capture a recoverable snapshot before anything is removed.
        </p>
      </div>

      <div
        role="group"
        aria-label="Choose a danger-zone workflow"
        className="grid gap-3.5"
      >
        {groups.map((group) => (
          <div
            key={group.id}
            // Recoverable groups stack as plain labelled rows; the destructive
            // group (permanent deletion) renders inside its own rose-bordered
            // panel with extra breathing room above, so the most dangerous
            // work sits visually apart from the reversible resets.
            className={cn(
              "grid gap-2",
              group.destructive &&
                "mt-1.5 rounded-md border border-rose/40 bg-surface px-4 py-3.5"
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "font-sans text-sm font-semibold",
                  group.destructive ? "text-rose" : "text-ink3"
                )}
              >
                {group.label}
              </span>
              {group.destructive ? (
                <StatusBadge label="Irreversible" tone="destructive" />
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
              {group.workflows.map((workflow) => {
                const selected = workflow.id === activeId;
                return (
                  <button
                    key={workflow.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setActiveId(selected ? null : workflow.id)}
                    className={cn(
                      "grid cursor-pointer appearance-none content-start gap-1.5 rounded-sm border p-3 text-left transition-colors duration-150",
                      // A destructive launcher keeps a rose border even at
                      // rest, so it never blends in with the recoverable
                      // resets; the selected launcher swaps the stripe-era
                      // accents for a roseSoft fill + full rose border.
                      selected
                        ? "border-rose bg-roseSoft"
                        : workflow.destructive
                          ? "border-rose/40 bg-surface"
                          : "border-line bg-surface hover:bg-surfaceAlt"
                    )}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-sans text-sm font-semibold text-ink">
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
                      <span className="font-sans text-xs leading-snug text-ink2">
                        {workflow.riskNote}
                      </span>
                    ) : null}
                    {/* The launcher's action line: what clicking does (open,
                        not run); the selected card swaps it for a "workflow
                        open below" state line, keeping the chosen card
                        obvious. */}
                    <span
                      className={cn(
                        "font-sans text-xs font-semibold text-clayDeep",
                        !selected && "underline"
                      )}
                    >
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
          className="grid gap-2.5"
        >
          {active.node}
        </section>
      ) : (
        <p className="m-0 rounded-md border border-dashed border-line bg-surface px-4 py-4 font-sans text-sm text-ink3">
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
