import { describe, expect, it } from "vitest";

import { cellKey, cellKeyOf } from "@/lib/admin/cell-coordinate";

// The Cell coordinate (CONTEXT.md › Cell coordinate) has one canonical string
// form behind `cell-coordinate.ts`. `cellKey` keys a real (non-null) coordinate;
// `cellKeyOf` is the lenient sibling for a possibly-uncategorized group. The
// scheme leans on a collision-safe separator: real keys are `enum:uuid` (both
// parts non-empty), so any empty part can never match a real cell. These tests
// pin that contract — none existed before.

const UUID = "11111111-1111-4111-8111-111111111111";

describe("cellKeyOf", () => {
  it("equals cellKey when both parts are present", () => {
    expect(cellKeyOf("men", UUID)).toBe(
      cellKey({ audience: "men", categoryId: UUID })
    );
    expect(cellKeyOf("women", UUID)).toBe(
      cellKey({ audience: "women", categoryId: UUID })
    );
    expect(cellKeyOf("mixed", UUID)).toBe(
      cellKey({ audience: "mixed", categoryId: UUID })
    );
  });

  it("yields a catch-all key for null parts that matches no real cell", () => {
    const realKeys = new Set([
      cellKey({ audience: "men", categoryId: UUID }),
      cellKey({ audience: "women", categoryId: UUID }),
      cellKey({ audience: "mixed", categoryId: UUID }),
    ]);

    expect(realKeys.has(cellKeyOf(null, null))).toBe(false);
    expect(realKeys.has(cellKeyOf("men", null))).toBe(false);
    expect(realKeys.has(cellKeyOf(null, UUID))).toBe(false);
  });

  it("keeps distinct null shapes distinct", () => {
    const keys = new Set([
      cellKeyOf(null, null),
      cellKeyOf("men", null),
      cellKeyOf(null, UUID),
    ]);
    expect(keys.size).toBe(3);
  });
});

describe("cellKey", () => {
  it("produces an enum:uuid shape with both parts non-empty", () => {
    const key = cellKey({ audience: "men", categoryId: UUID });
    const parts = key.split(":");
    // audience + the colon-bearing UUID is split at the first colon only via the
    // separator, so assert the leading part and that nothing is empty.
    expect(parts[0]).toBe("men");
    expect(key).toBe(`men:${UUID}`);
    expect(key.startsWith(":")).toBe(false);
    expect(key.endsWith(":")).toBe(false);
  });
});
