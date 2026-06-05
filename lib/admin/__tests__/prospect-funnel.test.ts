import { describe, expect, it } from "vitest";

import type { ProspectState } from "@/types/enums";
import type { GuestPipelineStage } from "@/types/enums";
import {
  canTransition,
  mapGuestStageToProspectState,
  stateIsArchived,
  stateIsTerminal,
  stateRequiresGroup,
  validateTransition,
} from "@/lib/admin/prospect-funnel";

const WITH_GROUP = { groupId: "11111111-1111-1111-1111-111111111111" };
const NO_GROUP = { groupId: null };

describe("prospect-funnel — legal transitions", () => {
  it("allows interested → matched and interested → not_at_this_time", () => {
    expect(canTransition("interested", "matched")).toBe(true);
    expect(canTransition("interested", "not_at_this_time")).toBe(true);
  });

  it("allows matched → joined, matched → interested, matched → not_at_this_time", () => {
    expect(canTransition("matched", "joined")).toBe(true);
    expect(canTransition("matched", "interested")).toBe(true);
    expect(canTransition("matched", "not_at_this_time")).toBe(true);
  });

  it("allows not_at_this_time → interested (revive)", () => {
    expect(canTransition("not_at_this_time", "interested")).toBe(true);
  });

  it("treats a no-op (from === to) as not a transition", () => {
    const states: ProspectState[] = [
      "interested",
      "matched",
      "joined",
      "not_at_this_time",
    ];
    for (const s of states) expect(canTransition(s, s)).toBe(false);
  });
});

describe("prospect-funnel — illegal transitions", () => {
  it("rejects interested → joined (must pass through matched)", () => {
    expect(canTransition("interested", "joined")).toBe(false);
    expect(validateTransition("interested", "joined", WITH_GROUP)).toEqual({
      ok: false,
      error: "illegal_transition",
    });
  });

  it("rejects any transition out of joined (terminal)", () => {
    expect(canTransition("joined", "interested")).toBe(false);
    expect(canTransition("joined", "matched")).toBe(false);
    expect(canTransition("joined", "not_at_this_time")).toBe(false);
    expect(validateTransition("joined", "interested", WITH_GROUP)).toEqual({
      ok: false,
      error: "illegal_transition",
    });
  });

  it("rejects not_at_this_time → matched / joined directly", () => {
    expect(canTransition("not_at_this_time", "matched")).toBe(false);
    expect(canTransition("not_at_this_time", "joined")).toBe(false);
  });
});

describe("prospect-funnel — group-required invariant", () => {
  it("requires a group to reach matched", () => {
    expect(stateRequiresGroup("matched")).toBe(true);
    expect(validateTransition("interested", "matched", NO_GROUP)).toEqual({
      ok: false,
      error: "group_required",
    });
    expect(validateTransition("interested", "matched", WITH_GROUP)).toEqual({
      ok: true,
      archived: false,
    });
  });

  it("requires a group to reach joined", () => {
    expect(stateRequiresGroup("joined")).toBe(true);
    expect(validateTransition("matched", "joined", NO_GROUP)).toEqual({
      ok: false,
      error: "group_required",
    });
  });

  it("does not require a group for interested / not_at_this_time", () => {
    expect(stateRequiresGroup("interested")).toBe(false);
    expect(stateRequiresGroup("not_at_this_time")).toBe(false);
    expect(validateTransition("matched", "interested", NO_GROUP)).toEqual({
      ok: true,
      archived: false,
    });
    expect(validateTransition("matched", "not_at_this_time", NO_GROUP)).toEqual(
      {
        ok: true,
        archived: false,
      }
    );
  });

  it("checks legality before the group invariant", () => {
    // joined is terminal: even with no group, the legality failure wins.
    expect(validateTransition("joined", "matched", NO_GROUP)).toEqual({
      ok: false,
      error: "illegal_transition",
    });
  });
});

describe("prospect-funnel — joined archives", () => {
  it("sets archived only when landing in joined", () => {
    expect(stateIsArchived("joined")).toBe(true);
    expect(stateIsArchived("matched")).toBe(false);
    expect(stateIsArchived("interested")).toBe(false);
    expect(stateIsArchived("not_at_this_time")).toBe(false);
    const decision = validateTransition("matched", "joined", WITH_GROUP);
    expect(decision).toEqual({ ok: true, archived: true });
  });
});

describe("prospect-funnel — terminal / parked states", () => {
  it("treats joined as terminal and the others as non-terminal", () => {
    expect(stateIsTerminal("joined")).toBe(true);
    expect(stateIsTerminal("interested")).toBe(false);
    expect(stateIsTerminal("matched")).toBe(false);
    // not_at_this_time is parked, not terminal — it can be revived.
    expect(stateIsTerminal("not_at_this_time")).toBe(false);
  });
});

describe("prospect-funnel — guest stage → prospect state mapping", () => {
  it("maps the pre-funnel stages to interested", () => {
    const pre: GuestPipelineStage[] = [
      "new",
      "contacted",
      "interested",
      "attended",
    ];
    for (const s of pre)
      expect(mapGuestStageToProspectState(s)).toBe("interested");
  });

  it("maps assigned → matched, placed → joined, not_now → not_at_this_time", () => {
    expect(mapGuestStageToProspectState("assigned")).toBe("matched");
    expect(mapGuestStageToProspectState("placed")).toBe("joined");
    expect(mapGuestStageToProspectState("not_now")).toBe("not_at_this_time");
  });
});
