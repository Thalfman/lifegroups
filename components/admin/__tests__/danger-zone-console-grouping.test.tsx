import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  DangerZoneConsole,
  type DangerWorkflowGroup,
} from "@/components/admin/danger-zone-console";

// Mirrors the risk-ordered grouping the Super Admin shell passes in (#462):
// lowest-risk launch preparation first, then the recoverable resets, then the
// audit log, with permanent deletion set apart last. The chooser must render
// the groups in the order given and visually mark the destructive group.
function riskOrderedGroups(): DangerWorkflowGroup[] {
  return [
    {
      id: "launch-preparation",
      label: "Launch preparation",
      workflows: [
        { id: "launch-prep", label: "Prepare for launch", node: <div /> },
      ],
    },
    {
      id: "history-attention-resets",
      label: "History and attention resets",
      workflows: [{ id: "attention", label: "Reset attention", node: <div /> }],
    },
    {
      id: "audit-log-actions",
      label: "Audit log actions",
      workflows: [{ id: "audit", label: "Reset audit log", node: <div /> }],
    },
    {
      id: "permanent-deletion",
      label: "Permanent deletion",
      destructive: true,
      workflows: [
        {
          id: "permanent",
          label: "Permanent deletion",
          destructive: true,
          node: <div />,
        },
      ],
    },
  ];
}

describe("DangerZoneConsole risk grouping", () => {
  it("renders the group labels in the order given (lowest risk first)", () => {
    const html = renderToStaticMarkup(
      <DangerZoneConsole groups={riskOrderedGroups()} />
    );
    const positions = [
      "Launch preparation",
      "History and attention resets",
      "Audit log actions",
      "Permanent deletion",
    ].map((label) => html.indexOf(label));
    for (const position of positions) {
      expect(position).toBeGreaterThan(-1);
    }
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("sets the destructive group apart with the Irreversible badge", () => {
    const html = renderToStaticMarkup(
      <DangerZoneConsole groups={riskOrderedGroups()} />
    );
    expect(html).toContain("Irreversible");
  });

  it("shows no Irreversible badge when no group is destructive", () => {
    const recoverableOnly = riskOrderedGroups().filter(
      (group) => !group.destructive
    );
    const html = renderToStaticMarkup(
      <DangerZoneConsole groups={recoverableOnly} />
    );
    expect(html).not.toContain("Irreversible");
  });
});
