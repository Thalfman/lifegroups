import { describe, expect, it } from "vitest";

import { fetchCategoriesForAudience } from "@/lib/supabase/group-categories-reads";
import type { AppSupabaseClient } from "@/lib/supabase/types";

// #398: the category-picker options for a group of a given top type come from
// this reads-seam fn — categories with an ACTIVE cell under that audience_category
// (wave-1's category_type_targets), live (non-archived) only. These tests pin
// that contract with a no-DB thenable query-builder mock: a per-table builder
// that records the filters applied and resolves to fixture rows.

type TableRows = Record<string, unknown[]>;

// A thenable builder that records its eq/is/in filters and resolves to the
// table's fixture rows. select/order/eq/is/in/returns all return the builder so
// the chain composes regardless of call order.
function makeClient(tables: TableRows) {
  const calls: { table: string; filters: Record<string, unknown> }[] = [];
  const client = {
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      calls.push({ table, filters });
      const rows = tables[table] ?? [];
      const builder: Record<string, unknown> = {
        select: () => builder,
        order: () => builder,
        returns: () => builder,
        eq: (col: string, val: unknown) => {
          filters[`eq:${col}`] = val;
          return builder;
        },
        is: (col: string, val: unknown) => {
          filters[`is:${col}`] = val;
          return builder;
        },
        in: (col: string, val: unknown) => {
          filters[`in:${col}`] = val;
          return builder;
        },
        then: (onF: (v: unknown) => unknown, onR: (e: unknown) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(onF, onR),
      };
      return builder;
    },
  } as unknown as AppSupabaseClient;
  return { client, calls };
}

const CAT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CAT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("fetchCategoriesForAudience (#398)", () => {
  it("offers only categories with an ACTIVE cell under the requested top type", async () => {
    const { client, calls } = makeClient({
      category_type_targets: [
        {
          id: "c1",
          audience_category: "men",
          category_id: CAT_A,
          active: true,
        },
      ],
      group_categories: [
        { id: CAT_A, label: "20-30s", created_at: "2026-01-01T00:00:00Z" },
      ],
    });

    const result = await fetchCategoriesForAudience(client, "men");
    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      { id: CAT_A, label: "20-30s", created_at: "2026-01-01T00:00:00Z" },
    ]);

    // The cell read filtered to the requested audience AND active = true.
    const cellCall = calls.find((c) => c.table === "category_type_targets");
    expect(cellCall?.filters["eq:audience_category"]).toBe("men");
    expect(cellCall?.filters["eq:active"]).toBe(true);
    // The catalog read filtered to live categories among the active cell ids.
    const catalogCall = calls.find((c) => c.table === "group_categories");
    expect(catalogCall?.filters["is:archived_at"]).toBe(null);
    expect(catalogCall?.filters["in:id"]).toEqual([CAT_A]);
  });

  it("returns an empty list (no second read) when the type has no active cell", async () => {
    const { client, calls } = makeClient({
      category_type_targets: [],
      group_categories: [
        { id: CAT_B, label: "Should not show", created_at: "2026-01-01" },
      ],
    });

    const result = await fetchCategoriesForAudience(client, "women");
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
    // Short-circuits before reading the catalog at all.
    expect(calls.some((c) => c.table === "group_categories")).toBe(false);
  });

  it("de-dupes category ids across multiple active cells of the same type", async () => {
    const { client, calls } = makeClient({
      category_type_targets: [
        {
          id: "c1",
          audience_category: "mixed",
          category_id: CAT_A,
          active: true,
        },
        {
          id: "c2",
          audience_category: "mixed",
          category_id: CAT_A,
          active: true,
        },
        {
          id: "c3",
          audience_category: "mixed",
          category_id: CAT_B,
          active: true,
        },
      ],
      group_categories: [
        { id: CAT_A, label: "20-30s", created_at: "2026-01-01" },
        { id: CAT_B, label: "40-50s", created_at: "2026-01-02" },
      ],
    });

    await fetchCategoriesForAudience(client, "mixed");
    const catalogCall = calls.find((c) => c.table === "group_categories");
    expect(catalogCall?.filters["in:id"]).toEqual([CAT_A, CAT_B]);
  });
});
