import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProspectBoardView } from "@/components/admin/plan/prospect-board";
import {
  ACTIVE_BOARD_STATES,
  type ProspectBoard,
} from "@/lib/supabase/prospect-reads";

function board(overrides: Partial<ProspectBoard> = {}): ProspectBoard {
  return {
    columns: ACTIVE_BOARD_STATES.map((state) => ({ state, prospects: [] })),
    joined: [],
    ...overrides,
  };
}

function render(b: ProspectBoard): string {
  return renderToStaticMarkup(
    <ProspectBoardView
      board={b}
      groupNamesById={{}}
      activeGroups={[]}
      dueTasks={[]}
    />
  );
}

describe("ProspectBoardView — empty funnel teaching state (#648)", () => {
  it("teaches the Interested → Matched → Joined path when the funnel is empty", () => {
    const html = render(board());
    expect(html).toContain("No Prospects in the Interest Funnel yet");
    expect(html).toContain("Interested");
    expect(html).toContain("match");
    expect(html).toContain("Joined");
  });

  it("hides the teaching line once there's a joined prospect", () => {
    const html = render(
      board({
        joined: [{ id: "p1", full_name: "Sam Prospect", groupName: null }],
      })
    );
    expect(html).not.toContain("No Prospects in the Interest Funnel yet");
  });
});
