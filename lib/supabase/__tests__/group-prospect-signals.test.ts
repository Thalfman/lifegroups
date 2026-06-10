import { describe, expect, it } from "vitest";
import { partitionGroupProspectSignals } from "@/lib/supabase/prospect-reads";
import type { ProspectState } from "@/types/enums";

// The group detail People tab's Interest Funnel card partitions with the SAME
// rules as buildProspectBoard, so the two surfaces can never disagree: joined
// rows (always archived) count toward joinedCount; cleanup-archived non-joined
// rows count nowhere; live matched rows list by name.

function row(
  id: string,
  fullName: string,
  state: ProspectState,
  archived = false
) {
  return { id, full_name: fullName, state, archived };
}

describe("partitionGroupProspectSignals", () => {
  it("lists live matched prospects sorted by name and counts joined", () => {
    const signals = partitionGroupProspectSignals([
      row("p-1", "Zed Late", "matched"),
      row("p-2", "Amy Early", "matched"),
      row("p-3", "Joiner One", "joined", true),
      row("p-4", "Joiner Two", "joined", true),
    ]);
    expect(signals.matched).toEqual([
      { id: "p-2", full_name: "Amy Early" },
      { id: "p-1", full_name: "Zed Late" },
    ]);
    expect(signals.joinedCount).toBe(2);
  });

  it("drops cleanup-archived non-joined rows entirely (board parity)", () => {
    const signals = partitionGroupProspectSignals([
      row("p-1", "Cleaned Up", "matched", true),
      row("p-2", "Parked Person", "not_at_this_time", true),
    ]);
    expect(signals.matched).toEqual([]);
    expect(signals.joinedCount).toBe(0);
  });

  it("never lists interested or parked rows as matched", () => {
    const signals = partitionGroupProspectSignals([
      row("p-1", "Still Interested", "interested"),
      row("p-2", "Not Now", "not_at_this_time"),
    ]);
    expect(signals.matched).toEqual([]);
    expect(signals.joinedCount).toBe(0);
  });

  it("counts a joined row even when its archived flag is set (it always is)", () => {
    const signals = partitionGroupProspectSignals([
      row("p-1", "Joined Person", "joined", true),
    ]);
    expect(signals.joinedCount).toBe(1);
  });
});
