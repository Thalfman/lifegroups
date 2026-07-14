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

type QueryCall = { method: string; args: unknown[] };

function resolvedClient(
  rowSets: unknown[][],
  selected: { columns: string },
  queries: QueryCall[][] = []
): ReadClient {
  return {
    from: () => {
      const queryIndex = queries.length;
      const calls: QueryCall[] = [];
      const response = { data: rowSets[queryIndex] ?? [], error: null };
      let builder: Record<string, unknown>;
      queries.push(calls);
      builder = new Proxy(
        {
          select: (columns: string) => {
            selected.columns = columns;
            calls.push({ method: "select", args: [columns] });
            return builder;
          },
          then: (
            onFulfilled: (value: unknown) => unknown,
            onRejected: (error: unknown) => unknown
          ) => Promise.resolve(response).then(onFulfilled, onRejected),
        },
        {
          get(target, property) {
            if (property in target) {
              return target[property as keyof typeof target];
            }
            return (...args: unknown[]) => {
              calls.push({ method: String(property), args });
              return builder;
            };
          },
        }
      );
      return builder;
    },
  } as unknown as ReadClient;
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

  it("filters irreversible tombstones before applying the recovery limit", async () => {
    const selected = { columns: "" };
    const queries: QueryCall[][] = [];
    const result = await fetchRecentTombstones(
      resolvedClient(
        [
          [
            {
              id: "tombstone-1",
              entity_type: "group",
              table_name: "groups",
              entity_id: "group-1",
              row_snapshot: { name: "Recoverable group" },
              deleted_at: "2026-07-11T12:00:00.000Z",
              restored_at: null,
              restorable: true,
            },
          ],
          [],
        ],
        selected,
        queries
      )
    );

    expect(selected.columns).toContain("restorable");
    const recoveryCalls = queries[0] ?? [];
    const restorableFilter = recoveryCalls.findIndex(
      (call) =>
        call.method === "eq" &&
        call.args[0] === "restorable" &&
        call.args[1] === true
    );
    const limit = recoveryCalls.findIndex((call) => call.method === "limit");
    expect(restorableFilter).toBeGreaterThanOrEqual(0);
    expect(restorableFilter).toBeLessThan(limit);
    expect(result).toEqual({
      status: "loaded",
      tombstones: [
        {
          id: "tombstone-1",
          entityType: "group",
          tableName: "groups",
          entityId: "group-1",
          label: "Recoverable group",
          deletedAt: "2026-07-11T12:00:00.000Z",
          restoredAt: null,
          restorable: true,
        },
      ],
    });
  });

  it("keeps irreversible profile status rows alongside the bounded recovery page", async () => {
    const selected = { columns: "" };
    const queries: QueryCall[][] = [];
    const result = await fetchRecentTombstones(
      resolvedClient(
        [
          [
            {
              id: "backup-1",
              entity_type: "group",
              table_name: "groups",
              entity_id: "group-1",
              row_snapshot: { name: "Recoverable group" },
              deleted_at: "2026-07-11T12:00:00.000Z",
              restored_at: null,
              restorable: true,
            },
          ],
          [
            {
              id: "erasure-1",
              entity_type: "profile",
              table_name: "profiles",
              entity_id: "profile-1",
              row_snapshot: { record_type: "profile" },
              deleted_at: "2026-07-11T13:00:00.000Z",
              restored_at: null,
              restorable: false,
            },
          ],
        ],
        selected,
        queries
      ),
      1
    );

    expect(queries).toHaveLength(2);
    expect(
      queries[1]?.some(
        (call) =>
          call.method === "or" &&
          call.args[0] === "restorable.eq.false,restored_at.not.is.null"
      )
    ).toBe(true);
    expect(result.status).toBe("loaded");
    expect(result.tombstones.map((tombstone) => tombstone.id)).toEqual([
      "erasure-1",
      "backup-1",
    ]);
    expect(
      result.tombstones.find((tombstone) => tombstone.id === "backup-1")
    ).toMatchObject({ restorable: true, label: "Recoverable group" });
    expect(
      result.tombstones.find((tombstone) => tombstone.id === "erasure-1")
    ).toMatchObject({ restorable: false });
  });
});
