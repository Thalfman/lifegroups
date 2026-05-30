import { describe, it, expect } from "vitest";
import { resolveGrade } from "@/lib/admin/group-health-override";

describe("resolveGrade — override resolution", () => {
  it("an active override replaces the computed letter but keeps it visible", () => {
    const r = resolveGrade(
      "B",
      { letter: "A", scope: "this_month", period_month: "2026-05-01" },
      "2026-05-01",
    );
    expect(r.effective_letter).toBe("A");
    expect(r.computed_letter).toBe("B");
    expect(r.is_overridden).toBe(true);
  });

  it("with no override, the effective grade is the computed grade", () => {
    const r = resolveGrade("C", null, "2026-05-01");
    expect(r.effective_letter).toBe("C");
    expect(r.computed_letter).toBe("C");
    expect(r.is_overridden).toBe(false);
    expect(r.override_scope).toBeNull();
  });

  it("auto-clears a 'this_month' override once the month has rolled over", () => {
    const r = resolveGrade(
      "B",
      { letter: "A", scope: "this_month", period_month: "2026-04-01" },
      "2026-05-01",
    );
    expect(r.effective_letter).toBe("B");
    expect(r.is_overridden).toBe(false);
    expect(r.override_scope).toBeNull();
  });

  it("keeps an 'until_cleared' override standing across later months", () => {
    const r = resolveGrade(
      "C",
      { letter: "A", scope: "until_cleared", period_month: "2026-04-01" },
      "2026-05-01",
    );
    expect(r.effective_letter).toBe("A");
    expect(r.computed_letter).toBe("C");
    expect(r.is_overridden).toBe(true);
    expect(r.override_scope).toBe("until_cleared");
  });

  it("can pin a grade on a group the rubric couldn't compute yet", () => {
    const r = resolveGrade(
      null,
      { letter: "A", scope: "until_cleared", period_month: "2026-05-01" },
      "2026-05-01",
    );
    expect(r.computed_letter).toBeNull();
    expect(r.effective_letter).toBe("A");
    expect(r.is_overridden).toBe(true);
  });
});
