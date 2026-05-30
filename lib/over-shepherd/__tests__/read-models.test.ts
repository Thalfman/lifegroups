import { describe, expect, it, vi } from "vitest";
import {
  OVER_SHEPHERD_CARE_PROFILE_COLUMNS,
  fetchOverShepherdCareDirectory,
  fetchOverShepherdCareProfileByShepherdId,
} from "@/lib/over-shepherd/read-models";
import { isCoveredShepherd } from "@/lib/over-shepherd/coverage";
import type { AppSupabaseClient } from "@/lib/supabase/types";

const OS_ID = "00000000-0000-0000-0000-0000000000aa";
const SHEP_1 = "11111111-1111-1111-1111-111111111111";
const SHEP_2 = "22222222-2222-2222-2222-222222222222";
const UNCOVERED = "99999999-9999-9999-9999-999999999999";

type TableData = { data: unknown; error: unknown };

// Records the select() column string per table and resolves chained queries
// with configured data. Mirrors the supabase-js builder surface the read
// functions touch: select/in/eq/order return the builder; the builder is a
// thenable; maybeSingle() resolves directly.
function makeClient(tables: Record<string, TableData>) {
  const selects: Record<string, string> = {};
  const client = {
    from(table: string) {
      const result = tables[table] ?? { data: [], error: null };
      const builder = {
        select(cols: string) {
          selects[table] = cols;
          return builder;
        },
        in() {
          return builder;
        },
        eq() {
          return builder;
        },
        order() {
          return builder;
        },
        async maybeSingle() {
          return Array.isArray(result.data)
            ? { data: result.data[0] ?? null, error: result.error }
            : result;
        },
        then<R1, R2>(
          onResolve: (value: TableData) => R1 | PromiseLike<R1>,
          onReject?: (reason: unknown) => R2 | PromiseLike<R2>,
        ) {
          return Promise.resolve(result).then(onResolve, onReject);
        },
      };
      return builder;
    },
  } as unknown as AppSupabaseClient;
  return { client, selects };
}

describe("admin_summary exclusion", () => {
  it("omits admin_summary from the Over-Shepherd care-profile column allowlist", () => {
    expect(OVER_SHEPHERD_CARE_PROFILE_COLUMNS).not.toContain("admin_summary");
    expect(OVER_SHEPHERD_CARE_PROFILE_COLUMNS).not.toContain("*");
  });

  it("never selects admin_summary (or *) when reading the directory care rows", async () => {
    const { client, selects } = makeClient({
      profiles: { data: [], error: null },
      shepherd_care_profiles: { data: [], error: null },
    });
    await fetchOverShepherdCareDirectory(client, [SHEP_1]);
    expect(selects["shepherd_care_profiles"]).not.toContain("admin_summary");
    expect(selects["shepherd_care_profiles"]).not.toContain("*");
  });

  it("never selects admin_summary (or *) when reading a single care profile", async () => {
    const { client, selects } = makeClient({
      shepherd_care_profiles: { data: [], error: null },
    });
    await fetchOverShepherdCareProfileByShepherdId(client, SHEP_1);
    expect(selects["shepherd_care_profiles"]).not.toContain("admin_summary");
    expect(selects["shepherd_care_profiles"]).not.toContain("*");
  });
});

describe("fetchOverShepherdCareDirectory — in-scope visibility", () => {
  it("builds directory entries for the covered shepherds", async () => {
    const { client } = makeClient({
      profiles: {
        data: [
          { id: SHEP_1, full_name: "Ann", email: "ann@x.com", role: "leader", status: "active" },
          { id: SHEP_2, full_name: "Bob", email: "bob@x.com", role: "co_leader", status: "active" },
        ],
        error: null,
      },
      shepherd_care_profiles: {
        data: [
          {
            id: "ca-1",
            shepherd_profile_id: SHEP_1,
            current_status: "needs_encouragement",
            last_contact_at: "2026-05-01",
            next_touchpoint_due: "2026-06-01",
            archived_at: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ],
        error: null,
      },
    });
    const r = await fetchOverShepherdCareDirectory(client, [SHEP_1, SHEP_2], {
      todayIso: "2026-05-10",
    });
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(2);
    const ann = r.data!.find((e) => e.profile.id === SHEP_1)!;
    expect(ann.care?.current_status).toBe("needs_encouragement");
    // Bob has no care row yet -> needs first contact.
    const bob = r.data!.find((e) => e.profile.id === SHEP_2)!;
    expect(bob.care).toBeNull();
    expect(bob.needs_attention).toBe(true);
  });

  it("short-circuits to an empty directory when coverage is empty (no out-of-scope fetch)", async () => {
    const fromSpy = vi.fn();
    const client = { from: fromSpy } as unknown as AppSupabaseClient;
    const r = await fetchOverShepherdCareDirectory(client, []);
    expect(r.error).toBeNull();
    expect(r.data).toEqual([]);
    // No query is issued at all when there is no coverage scope.
    expect(fromSpy).not.toHaveBeenCalled();
  });
});

describe("isCoveredShepherd — out-of-scope denial", () => {
  const coverage = { overShepherdId: OS_ID, coveredShepherdIds: [SHEP_1, SHEP_2] };

  it("admits a covered shepherd", () => {
    expect(isCoveredShepherd(coverage, SHEP_1)).toBe(true);
  });

  it("denies a shepherd covered by someone else / not covered", () => {
    expect(isCoveredShepherd(coverage, UNCOVERED)).toBe(false);
  });

  it("denies everything when there is no coverage (no-access)", () => {
    expect(isCoveredShepherd(null, SHEP_1)).toBe(false);
  });
});
