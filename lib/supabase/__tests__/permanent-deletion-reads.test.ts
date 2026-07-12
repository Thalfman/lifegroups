import { describe, expect, it } from "vitest";

import {
  fetchPermanentDeletionTargetCatalog,
  fetchRecentTombstones,
} from "@/lib/supabase/permanent-deletion-reads";
import type { ReadClient } from "@/lib/supabase/read-core";

function rejectingClient(message: string): ReadClient {
  const response = { data: null, error: { message } };
  let builder: Record<string, unknown>;
  builder = new Proxy(
    {
      then: (
        onFulfilled: (value: unknown) => unknown,
        onRejected: (error: unknown) => unknown
      ) => Promise.resolve(response).then(onFulfilled, onRejected),
    },
    {
      get(target, property) {
        if (property in target) return target[property as keyof typeof target];
        return () => builder;
      },
    }
  );
  return { from: () => builder } as unknown as ReadClient;
}

function resolvedClient(
  rows: unknown[],
  selected: { columns: string }
): ReadClient {
  const response = { data: rows, error: null };
  let builder: Record<string, unknown>;
  builder = new Proxy(
    {
      select: (columns: string) => {
        selected.columns = columns;
        return builder;
      },
      then: (
        onFulfilled: (value: unknown) => unknown,
        onRejected: (error: unknown) => unknown
      ) => Promise.resolve(response).then(onFulfilled, onRejected),
    },
    {
      get(target, property) {
        if (property in target) return target[property as keyof typeof target];
        return () => builder;
      },
    }
  );
  return { from: () => builder } as unknown as ReadClient;
}

describe("permanent deletion privileged reads", () => {
  it("returns target metadata without loading every entity table", async () => {
    const groups = await fetchPermanentDeletionTargetCatalog(
      rejectingClient("permission denied")
    );

    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every((group) => group.status === "idle")).toBe(true);
    expect(groups.every((group) => group.items.length === 0)).toBe(true);
  });

  it("distinguishes a failed tombstone query from a confirmed empty result", async () => {
    await expect(
      fetchRecentTombstones(rejectingClient("temporary outage"))
    ).resolves.toEqual({ status: "failed", tombstones: [] });
  });

  it("carries the database restorable flag to the recovery trust boundary", async () => {
    const selected = { columns: "" };
    const result = await fetchRecentTombstones(
      resolvedClient(
        [
          {
            id: "tombstone-1",
            entity_type: "profile",
            table_name: "profiles",
            entity_id: "profile-1",
            row_snapshot: { full_name: "Erased person" },
            deleted_at: "2026-07-11T12:00:00.000Z",
            restored_at: null,
            restorable: false,
          },
        ],
        selected
      )
    );

    expect(selected.columns).toContain("restorable");
    expect(result).toEqual({
      status: "loaded",
      tombstones: [
        {
          id: "tombstone-1",
          entityType: "profile",
          tableName: "profiles",
          entityId: "profile-1",
          label: "Erased person",
          deletedAt: "2026-07-11T12:00:00.000Z",
          restoredAt: null,
          restorable: false,
        },
      ],
    });
  });
});
