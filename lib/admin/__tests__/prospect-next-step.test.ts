import { describe, expect, it } from "vitest";

import {
  decodeNextStep,
  dueFollowUps,
  isFollowUpDue,
  isNextStepType,
  normalizeAdditionalNote,
  normalizeNextStep,
  NEXT_STEP_DETAIL_MAX,
  ADDITIONAL_NOTE_MAX,
  type NextStep,
  type ProspectWithNextStep,
} from "@/lib/admin/prospect-next-step";

describe("prospect-next-step — type guard", () => {
  it("accepts the two next-step types and rejects anything else", () => {
    expect(isNextStepType("connect_to_group_leader")).toBe(true);
    expect(isNextStepType("follow_up")).toBe(true);
    expect(isNextStepType("matched")).toBe(false);
    expect(isNextStepType("")).toBe(false);
    expect(isNextStepType(null)).toBe(false);
    expect(isNextStepType(undefined)).toBe(false);
    expect(isNextStepType(7)).toBe(false);
  });
});

describe("prospect-next-step — normalizeNextStep validation", () => {
  it("rejects an unknown type", () => {
    expect(normalizeNextStep({ type: "nope" })).toEqual({
      ok: false,
      error: "invalid_type",
    });
  });

  it("accepts a bare type with no optional fields (both null)", () => {
    expect(normalizeNextStep({ type: "follow_up" })).toEqual({
      ok: true,
      value: { type: "follow_up", dueDate: null, detail: null },
    });
    expect(normalizeNextStep({ type: "connect_to_group_leader" })).toEqual({
      ok: true,
      value: { type: "connect_to_group_leader", dueDate: null, detail: null },
    });
  });

  it("treats empty-string / null / undefined optional fields as absent", () => {
    expect(
      normalizeNextStep({ type: "follow_up", dueDate: "", detail: "" })
    ).toEqual({
      ok: true,
      value: { type: "follow_up", dueDate: null, detail: null },
    });
    expect(
      normalizeNextStep({ type: "follow_up", dueDate: null, detail: null })
    ).toEqual({
      ok: true,
      value: { type: "follow_up", dueDate: null, detail: null },
    });
  });

  it("accepts a valid ISO due date and trims a detail", () => {
    expect(
      normalizeNextStep({
        type: "follow_up",
        dueDate: "2026-06-10",
        detail: "  call them  ",
      })
    ).toEqual({
      ok: true,
      value: { type: "follow_up", dueDate: "2026-06-10", detail: "call them" },
    });
  });

  it("rejects a malformed due date", () => {
    expect(
      normalizeNextStep({ type: "follow_up", dueDate: "06/10/2026" })
    ).toEqual({ ok: false, error: "invalid_due_date" });
    expect(normalizeNextStep({ type: "follow_up", dueDate: 20260610 })).toEqual(
      { ok: false, error: "invalid_due_date" }
    );
  });

  it("rejects a detail past the length cap", () => {
    expect(
      normalizeNextStep({
        type: "follow_up",
        detail: "x".repeat(NEXT_STEP_DETAIL_MAX + 1),
      })
    ).toEqual({ ok: false, error: "detail_too_long" });
    // exactly at the cap is fine
    const atCap = normalizeNextStep({
      type: "follow_up",
      detail: "x".repeat(NEXT_STEP_DETAIL_MAX),
    });
    expect(atCap.ok).toBe(true);
  });

  it("allows connect_to_group_leader to carry an optional detail (still back-office)", () => {
    expect(
      normalizeNextStep({
        type: "connect_to_group_leader",
        detail: "hand to Pat",
      })
    ).toEqual({
      ok: true,
      value: {
        type: "connect_to_group_leader",
        dueDate: null,
        detail: "hand to Pat",
      },
    });
  });
});

describe("prospect-next-step — additional note is separate from the step", () => {
  it("normalizes a note to trimmed-or-null", () => {
    expect(normalizeAdditionalNote("  hi  ")).toEqual({
      ok: true,
      value: "hi",
    });
    expect(normalizeAdditionalNote("")).toEqual({ ok: true, value: null });
    expect(normalizeAdditionalNote(null)).toEqual({ ok: true, value: null });
    expect(normalizeAdditionalNote(undefined)).toEqual({
      ok: true,
      value: null,
    });
  });

  it("rejects a note past the cap", () => {
    expect(
      normalizeAdditionalNote("x".repeat(ADDITIONAL_NOTE_MAX + 1))
    ).toEqual({ ok: false, error: "note_too_long" });
  });

  it("a step and a note are independent — either, both, or neither", () => {
    // A step with no note.
    const step = normalizeNextStep({ type: "follow_up", detail: "ping" });
    const noNote = normalizeAdditionalNote(undefined);
    expect(step.ok && step.value.detail).toBe("ping");
    expect(noNote.ok && noNote.value).toBe(null);
    // A note with no step's detail confusion: the note is its own field.
    const note = normalizeAdditionalNote("prefers evenings");
    expect(note.ok && note.value).toBe("prefers evenings");
  });
});

describe("prospect-next-step — follow-up due rules", () => {
  const TODAY = "2026-06-05";

  it("a follow_up with a due date on/before today is due", () => {
    const onDate: NextStep = {
      type: "follow_up",
      dueDate: "2026-06-05",
      detail: null,
    };
    const past: NextStep = {
      type: "follow_up",
      dueDate: "2026-06-01",
      detail: null,
    };
    expect(isFollowUpDue(onDate, TODAY)).toBe(true);
    expect(isFollowUpDue(past, TODAY)).toBe(true);
  });

  it("a follow_up with a future due date is not yet due", () => {
    const future: NextStep = {
      type: "follow_up",
      dueDate: "2026-06-10",
      detail: null,
    };
    expect(isFollowUpDue(future, TODAY)).toBe(false);
  });

  it("a follow_up WITHOUT a due date is never a due task", () => {
    const undated: NextStep = {
      type: "follow_up",
      dueDate: null,
      detail: "someday",
    };
    expect(isFollowUpDue(undated, TODAY)).toBe(false);
  });

  it("connect_to_group_leader is NEVER a due task, even with a due date", () => {
    const withDate: NextStep = {
      type: "connect_to_group_leader",
      dueDate: "2026-06-01",
      detail: null,
    };
    const undated: NextStep = {
      type: "connect_to_group_leader",
      dueDate: null,
      detail: null,
    };
    expect(isFollowUpDue(withDate, TODAY)).toBe(false);
    expect(isFollowUpDue(undated, TODAY)).toBe(false);
  });

  it("a null step is never due", () => {
    expect(isFollowUpDue(null, TODAY)).toBe(false);
  });
});

describe("prospect-next-step — dueFollowUps surfacing", () => {
  const TODAY = "2026-06-05";

  const prospects: ProspectWithNextStep[] = [
    {
      id: "a",
      full_name: "Due Today",
      next_step: { type: "follow_up", dueDate: "2026-06-05", detail: "call" },
    },
    {
      id: "b",
      full_name: "Overdue",
      next_step: { type: "follow_up", dueDate: "2026-06-01", detail: null },
    },
    {
      id: "c",
      full_name: "Future",
      next_step: { type: "follow_up", dueDate: "2026-07-01", detail: null },
    },
    {
      id: "d",
      full_name: "Undated Follow Up",
      next_step: { type: "follow_up", dueDate: null, detail: null },
    },
    {
      id: "e",
      full_name: "Connect Back-office",
      next_step: {
        type: "connect_to_group_leader",
        dueDate: "2026-06-01",
        detail: null,
      },
    },
    { id: "f", full_name: "No Step", next_step: null },
  ];

  it("returns only armed follow-ups that are due, soonest-due first", () => {
    const due = dueFollowUps(prospects, TODAY);
    expect(due.map((d) => d.id)).toEqual(["b", "a"]); // overdue before today
    expect(due[0]).toEqual({
      id: "b",
      full_name: "Overdue",
      dueDate: "2026-06-01",
      detail: null,
    });
    expect(due[1].detail).toBe("call");
  });

  it("never surfaces connect_to_group_leader, undated follow-ups, or no-step prospects", () => {
    const ids = dueFollowUps(prospects, TODAY).map((d) => d.id);
    expect(ids).not.toContain("c"); // future
    expect(ids).not.toContain("d"); // undated
    expect(ids).not.toContain("e"); // connect_to_group_leader
    expect(ids).not.toContain("f"); // no step
  });
});

describe("prospect-next-step — decodeNextStep (DB trust boundary)", () => {
  it("decodes a well-formed snake_case jsonb value", () => {
    expect(
      decodeNextStep({
        type: "follow_up",
        due_date: "2026-06-10",
        detail: "call",
      })
    ).toEqual({ type: "follow_up", dueDate: "2026-06-10", detail: "call" });
  });

  it("decodes null / malformed values to null without throwing", () => {
    expect(decodeNextStep(null)).toBe(null);
    expect(decodeNextStep(undefined)).toBe(null);
    expect(decodeNextStep("nope")).toBe(null);
    expect(decodeNextStep([])).toBe(null);
    expect(decodeNextStep({ type: "bogus" })).toBe(null);
    expect(decodeNextStep({ type: "follow_up", due_date: "nope" })).toBe(null);
  });
});
