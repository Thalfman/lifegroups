import { describe, expect, it } from "vitest";
import {
  formatDueLabel,
  isOverdueIso,
  laterIso,
} from "@/lib/admin/care-temporal";

describe("formatDueLabel", () => {
  it("labels today, tomorrow, and upcoming", () => {
    expect(formatDueLabel(0)).toBe("Due today");
    expect(formatDueLabel(1)).toBe("Due tomorrow");
    expect(formatDueLabel(5)).toBe("Due in 5 days");
  });
  it("labels overdue with singular/plural", () => {
    expect(formatDueLabel(-1)).toBe("Overdue 1 day");
    expect(formatDueLabel(-3)).toBe("Overdue 3 days");
  });
});

describe("isOverdueIso", () => {
  it("is true only strictly before today", () => {
    expect(isOverdueIso("2026-06-10", "2026-06-11")).toBe(true);
    expect(isOverdueIso("2026-06-11", "2026-06-11")).toBe(false);
    expect(isOverdueIso("2026-06-12", "2026-06-11")).toBe(false);
  });
  it("a null due date is never overdue", () => {
    expect(isOverdueIso(null, "2026-06-11")).toBe(false);
  });
});

describe("laterIso", () => {
  it("returns the later of two dates", () => {
    expect(laterIso("2026-01-10", "2026-02-01")).toBe("2026-02-01");
    expect(laterIso("2026-03-01", "2026-02-01")).toBe("2026-03-01");
  });
  it("treats null as absent", () => {
    expect(laterIso(null, "2026-02-01")).toBe("2026-02-01");
    expect(laterIso("2026-02-01", null)).toBe("2026-02-01");
    expect(laterIso(null, null)).toBeNull();
  });
});
