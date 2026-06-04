import { describe, expect, it } from "vitest";

import {
  HISTORY_RESET_CATEGORIES,
  HISTORY_RESET_CATEGORY_KEYS,
  HISTORY_RESET_CATEGORY_META,
  HISTORY_RESET_TABLES,
  isHistoryResetCategory,
} from "@/lib/admin/history-reset";

describe("history-reset registry", () => {
  it("covers the seven history categories", () => {
    expect(HISTORY_RESET_CATEGORY_KEYS).toEqual([
      "health_checks",
      "follow_ups",
      "attendance",
      "guests",
      "church_attendance",
      "shepherd_care",
      "group_status_history",
    ]);
  });

  it("has display metadata for every category", () => {
    for (const key of HISTORY_RESET_CATEGORY_KEYS) {
      expect(HISTORY_RESET_CATEGORY_META[key].label).toBeTruthy();
      expect(HISTORY_RESET_CATEGORY_META[key].description).toBeTruthy();
    }
  });

  it("dedupes every category's tables into HISTORY_RESET_TABLES", () => {
    const flat = Object.values(HISTORY_RESET_CATEGORIES).flat();
    expect(new Set(HISTORY_RESET_TABLES).size).toBe(
      HISTORY_RESET_TABLES.length
    );
    expect(new Set(HISTORY_RESET_TABLES)).toEqual(new Set(flat));
  });

  it("orders attendance children before parents (records before sessions)", () => {
    const attendance = HISTORY_RESET_CATEGORIES.attendance;
    expect(attendance.indexOf("attendance_records")).toBeLessThan(
      attendance.indexOf("attendance_sessions")
    );
  });

  it("narrows known category keys and rejects unknown ones", () => {
    expect(isHistoryResetCategory("health_checks")).toBe(true);
    expect(isHistoryResetCategory("follow_ups")).toBe(true);
    expect(isHistoryResetCategory("nonsense")).toBe(false);
    expect(isHistoryResetCategory(undefined)).toBe(false);
    expect(isHistoryResetCategory(42)).toBe(false);
  });
});
