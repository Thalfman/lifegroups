import { describe, expect, it } from "vitest";

import { fetchAttentionResetState } from "@/lib/supabase/maintenance-reads";
import type { ReadClient } from "@/lib/supabase/read-core";

// Thenable query-builder stub, one response per table. Mirrors the mock used
// across the read-model tests (no DB). Head-count queries resolve through the
// same builder: the response supplies `count` instead of rows.
type TableResponse = {
  data?: unknown;
  count?: number | null;
  error?: { message: string; code?: string } | null;
};

function makeClient(responses: Record<string, TableResponse>) {
  return {
    from: (table: string) => {
      const response = responses[table] ?? { data: [], error: null };
      const builder: Record<string, unknown> = {
        select: () => builder,
        is: () => builder,
        eq: () => builder,
        order: () => builder,
        then: (onF: (v: unknown) => unknown, onR: (e: unknown) => unknown) =>
          Promise.resolve({
            data: response.data ?? null,
            count: response.count ?? null,
            error: response.error ?? null,
          }).then(onF, onR),
      };
      return builder;
    },
  } as unknown as ReadClient;
}

describe("fetchAttentionResetState — impact preview error handling", () => {
  it("returns the head counts as the per-surface impact preview", async () => {
    const client = makeClient({
      attention_reset_baselines: { data: [] },
      attention_reset_snapshots: { data: [] },
      shepherd_care_profiles: { count: 7 },
      groups: { count: 3 },
    });
    const result = await fetchAttentionResetState(client);
    expect(result.error).toBeNull();
    const bySurface = new Map(
      (result.data?.surfaces ?? []).map((s) => [s.surface, s.impactCount])
    );
    expect(bySurface.get("care")).toBe(7);
    expect(bySurface.get("health")).toBe(3);
  });

  // A failed head-count must fail the whole read — never degrade to a false
  // "this reset would touch 0 entities" preview on a destructive-action card.
  it("fails the read when the care head-count errors", async () => {
    const client = makeClient({
      attention_reset_baselines: { data: [] },
      attention_reset_snapshots: { data: [] },
      shepherd_care_profiles: {
        count: null,
        error: { message: "transient failure" },
      },
      groups: { count: 3 },
    });
    const result = await fetchAttentionResetState(client);
    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
  });

  it("fails the read when the group head-count errors", async () => {
    const client = makeClient({
      attention_reset_baselines: { data: [] },
      attention_reset_snapshots: { data: [] },
      shepherd_care_profiles: { count: 7 },
      groups: { count: null, error: { message: "transient failure" } },
    });
    const result = await fetchAttentionResetState(client);
    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
  });
});
