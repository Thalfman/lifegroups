import { describe, expect, it, vi } from "vitest";

import type { FollowUpsRow } from "@/types/database";
import {
  columns,
  fetchByIds,
  projectJoinRows,
  unwrapEmbed,
  type ReadClient,
  type RowOf,
} from "@/lib/supabase/read-core";
import {
  LEADER_FOLLOW_UP_COLUMNS,
  type AdminFollowUpEntry,
} from "@/lib/supabase/follow-up-reads";

// Covers the read-path deepening primitives (#728 unwrapEmbed, #729 fetchByIds,
// #730 columns()). Each primitive concentrates a quirk the reads seam used to
// re-spell inline, so this file is the test surface that used to be missing.

// ── #728 unwrapEmbed ─────────────────────────────────────────────────────────

describe("unwrapEmbed — PostgREST embed normalisation", () => {
  it("returns the first element of a one-element array embed", () => {
    expect(unwrapEmbed([{ id: "a" }])).toEqual({ id: "a" });
  });

  it("returns a single-object embed unchanged", () => {
    const obj = { id: "a" };
    expect(unwrapEmbed(obj)).toBe(obj);
  });

  it("returns null for null, undefined, and the empty array", () => {
    expect(unwrapEmbed(null)).toBeNull();
    expect(unwrapEmbed(undefined)).toBeNull();
    expect(unwrapEmbed([])).toBeNull();
  });
});

// ── projectJoinRows (#830 M10) ───────────────────────────────────────────────

describe("projectJoinRows — join projection with per-row skip", () => {
  it("projects rows in order", () => {
    const out = projectJoinRows([1, 2, 3], (n) => n * 10);
    expect(out).toEqual([10, 20, 30]);
  });

  it("drops rows the projection rejects, keeping the rest in order", () => {
    const out = projectJoinRows(
      [
        { id: "a", embed: { name: "A" } },
        { id: "b", embed: null },
        { id: "c", embed: { name: "C" } },
      ],
      (r) => (r.embed === null ? null : { id: r.id, name: r.embed.name })
    );
    expect(out).toEqual([
      { id: "a", name: "A" },
      { id: "c", name: "C" },
    ]);
  });

  it("projects empty, null, and undefined row sets to an empty list", () => {
    expect(projectJoinRows([], () => 1)).toEqual([]);
    expect(projectJoinRows(null, () => 1)).toEqual([]);
    expect(projectJoinRows(undefined, () => 1)).toEqual([]);
  });
});

// ── #729 fetchByIds ──────────────────────────────────────────────────────────

type Row = { id: string; label: string };

type Capture = {
  table: string | null;
  columns: unknown;
  inColumn: string | null;
  inIds: string[] | null;
  refineCalls: string[];
};

// Minimal thenable Supabase builder stub: records the `.from` table, `.select`
// columns, and `.in(column, ids)`, supports the refine methods these reads use
// (`.is` / `.eq` / `.order`), and resolves to the rows whose id was queried.
function makeFetchByIdsClient(
  rows: Row[],
  capture: Capture,
  opts: { error?: Error } = {}
): ReadClient {
  type Builder = {
    select: (cols: unknown) => Builder;
    in: (col: string, ids: string[]) => Builder;
    is: () => Builder;
    eq: () => Builder;
    order: () => Builder;
    then: (
      onFulfilled?:
        | ((value: { data: Row[] | null; error: Error | null }) => unknown)
        | null,
      onRejected?: ((reason: unknown) => unknown) | null
    ) => Promise<unknown>;
  };
  const builder: Builder = {
    select(cols) {
      capture.columns = cols;
      return builder;
    },
    in(col, ids) {
      capture.inColumn = col;
      capture.inIds = ids;
      return builder;
    },
    is() {
      capture.refineCalls.push("is");
      return builder;
    },
    eq() {
      capture.refineCalls.push("eq");
      return builder;
    },
    order() {
      capture.refineCalls.push("order");
      return builder;
    },
    then(onFulfilled, onRejected) {
      const data = opts.error
        ? null
        : rows.filter((r) => capture.inIds?.includes(r.id));
      return Promise.resolve({
        data,
        error: opts.error ?? null,
      }).then(onFulfilled, onRejected);
    },
  };
  // `from` reads `this` (like the real supabase-js client), so if fetchByIds
  // ever detaches it from the client the call throws — locking the P1
  // regression where a `const from = client.from` alias dropped the receiver.
  return {
    _bound: true,
    from(this: { _bound?: boolean } | undefined, table: string) {
      if (!this?._bound) {
        throw new TypeError("from() called unbound from the client");
      }
      capture.table = table;
      return builder;
    },
  } as unknown as ReadClient;
}

function emptyCapture(): Capture {
  return {
    table: null,
    columns: null,
    inColumn: null,
    inIds: null,
    refineCalls: [],
  };
}

describe("fetchByIds — dedup + chunked .in fetch", () => {
  it("dedups ids so a duplicate collapses to one fetched row", async () => {
    const capture = emptyCapture();
    const client = makeFetchByIdsClient([{ id: "x", label: "X" }], capture);
    const res = await fetchByIds<Row>(
      client,
      "group_categories",
      ["x", "x", "x"],
      "id, label"
    );
    expect(res.error).toBeNull();
    // The fetch saw each id once, and the row appears once in the output.
    expect(capture.inIds).toEqual(["x"]);
    expect(res.data).toEqual([{ id: "x", label: "X" }]);
  });

  it("short-circuits the empty id set without touching the client", async () => {
    const capture = emptyCapture();
    const client = makeFetchByIdsClient([], capture);
    const from = vi.spyOn(
      client as unknown as { from: (t: string) => unknown },
      "from"
    );
    const res = await fetchByIds<Row>(client, "groups", [], "id, label");
    expect(res).toEqual({ data: [], error: null });
    expect(from).not.toHaveBeenCalled();
  });

  it("passes the column allowlist and id column through, and applies refine", async () => {
    const capture = emptyCapture();
    const client = makeFetchByIdsClient([{ id: "a", label: "A" }], capture);
    await fetchByIds<Row>(client, "group_categories", ["a"], "id, label", {
      refine: (q) => q.is("archived_at", null),
    });
    expect(capture.table).toBe("group_categories");
    expect(capture.columns).toBe("id, label");
    expect(capture.inColumn).toBe("id");
    expect(capture.refineCalls).toEqual(["is"]);
  });

  it("degrades gracefully on a read error (no false-empty)", async () => {
    const capture = emptyCapture();
    const client = makeFetchByIdsClient([{ id: "a", label: "A" }], capture, {
      error: new Error("boom"),
    });
    const res = await fetchByIds<Row>(client, "groups", ["a"], "id, label", {
      label: "test/groups",
    });
    expect(res.data).toBeNull();
    expect(res.error?.message).toContain("test/groups");
    expect(res.error?.message).toContain("boom");
  });

  it("fetches across chunks and merges the rows", async () => {
    const capture = emptyCapture();
    const seen: string[][] = [];
    // Wrap the stub so we can observe each chunk's `.in` ids.
    const rows: Row[] = [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
    ];
    const client = {
      from() {
        const builder = {
          select: () => builder,
          in: (_col: string, ids: string[]) => {
            seen.push(ids);
            return builder;
          },
          then: (
            onFulfilled?: ((v: { data: Row[]; error: null }) => unknown) | null
          ) =>
            Promise.resolve({
              data: rows.filter((r) => seen[seen.length - 1].includes(r.id)),
              error: null,
            }).then(onFulfilled ?? undefined),
        };
        return builder;
      },
    } as unknown as ReadClient;
    void capture;
    const res = await fetchByIds<Row>(client, "groups", ["a", "b", "c"], "id", {
      chunkSize: 2,
    });
    expect(seen).toEqual([["a", "b"], ["c"]]);
    expect(res.data).toEqual(rows);
  });
});

// ── #730 columns() ───────────────────────────────────────────────────────────

describe("columns() — self-pinning allowlist", () => {
  it("derives the .select string from the column list", () => {
    const cols = columns<{ id: string; name: string; secret: string }>()(
      "id",
      "name"
    );
    expect(cols.select).toBe("id, name");
    expect([...cols.list]).toEqual(["id", "name"]);
  });

  it("reflects a changed list in the select string (omit a column)", () => {
    const narrow = columns<{ id: string; name: string }>()("id");
    expect(narrow.select).toBe("id");
  });

  it("the leader follow-up allowlist derives a select string without admin_private_note", () => {
    expect(LEADER_FOLLOW_UP_COLUMNS.select).not.toContain("admin_private_note");
    expect(LEADER_FOLLOW_UP_COLUMNS.select).toContain("leader_visible_note");
  });
});

// Compile-time guarantees (#730). This function never runs; the `@ts-expect-error`
// directives make `npm run typecheck` (gated by CI) fail if the type-level
// boundary ever weakens — no runtime assertion can observe these.
function _columnsTypeGuards() {
  const cols = columns<{ id: string; name: string; secret: string }>()(
    "id",
    "name"
  );
  const row = {} as RowOf<typeof cols>;
  // Listed columns are on the derived row type.
  void row.id;
  void row.name;
  // @ts-expect-error — `secret` was omitted from the list, so it is absent from
  // the derived row type (the type tracks the list, not the whole table).
  void row.secret;

  // Binding the leader allowlist to the admin-private-omitting key universe
  // makes adding `admin_private_note` to the list a COMPILE ERROR — the
  // tracer-bullet guarantee of #730.
  columns<Omit<FollowUpsRow, "admin_private_note">>()(
    "id",
    // @ts-expect-error — `admin_private_note` is not a key of the leader-safe
    // type, so it cannot be added to the leader follow-up allowlist.
    "admin_private_note"
  );

  // The leader row type, derived from the live allowlist, never carries it.
  const leaderRow = {} as RowOf<typeof LEADER_FOLLOW_UP_COLUMNS>;
  // @ts-expect-error — leader follow-up rows never expose admin_private_note.
  void leaderRow.admin_private_note;

  // The admin row type, derived from its allowlist, deliberately does.
  const adminRow = {} as AdminFollowUpEntry;
  void adminRow.admin_private_note;
}
void _columnsTypeGuards;
