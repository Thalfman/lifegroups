import { beforeAll, describe, expect, it } from "vitest";

import { resolveIntegrationEnv } from "./support/env";
import { queryRows } from "./support/sql";
import {
  DB_ENUM_VALUES,
  DRIFT_ALLOWLIST,
  TABLE_ROW_KEYS,
  UNGUARDED_TABLES,
  UNGUARDED_VIEWS,
  VIEW_ROW_KEYS,
  type DriftAllowlistEntry,
} from "./support/types-drift-manifest";

// Types-drift guard (issue #864): prove the hand-rolled `types/` trust
// boundary against the LIVE migrated schema. The default lane's fitness checks
// are static — nothing verified that a `<Table>Row` interface or a
// types/enums.ts union still matches what the migrations actually built. This
// spec runs in the RLS integration lane (a migrated local stack is already
// up), diffs the compile-time-pinned manifest against information_schema /
// pg_enum in BOTH directions, and names the stale side in every failure.
//
// Deliberate divergences live in DRIFT_ALLOWLIST — and each entry is itself
// asserted still-live below, so a resolved divergence fails the suite until
// the stale entry is deleted.
//
// Coverage is CLOSED over the live schema (#885): every live `public` base
// table must be pinned in TABLE_ROW_KEYS or explicitly excluded (with a
// reason) in UNGUARDED_TABLES, and every live `public` VIEW must be pinned in
// VIEW_ROW_KEYS (against its hand-rolled read-seam row type) or excluded in
// UNGUARDED_VIEWS. Every exclusion is asserted still-live — a new table, view,
// or newly-read relation can never silently escape the guard.

const probe = resolveIntegrationEnv();
const suite = probe.kind === "ready" ? describe : describe.skip;

if (probe.kind === "skip") {
  // Surface the reason so a skipped run is self-explanatory, not silent.
  console.warn(`[types-drift] ${probe.reason}`);
}

const MANIFEST_PATH = "tests/integration/support/types-drift-manifest.ts";

interface InformationSchemaColumnRow {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
}

interface PgEnumRow {
  typname: string;
  enumlabel: string;
}

interface InformationSchemaTableRow {
  table_name: string;
  table_type: string;
}

interface LiveSchema {
  /** table name -> set of live column names (schema `public`; incl. views). */
  columns: Map<string, Set<string>>;
  /** live BASE TABLE names (schema `public`; views excluded). */
  baseTables: Set<string>;
  /** live VIEW names (schema `public`). */
  views: Set<string>;
  /** enum type name -> set of live labels (schema `public`). */
  enums: Map<string, Set<string>>;
  /** udt_names of user-defined types used by at least one live column. */
  enumColumnUse: Set<string>;
}

async function loadLiveSchema(): Promise<LiveSchema> {
  const columnRows = await queryRows<InformationSchemaColumnRow>(
    `select table_name, column_name, data_type, udt_name
       from information_schema.columns
      where table_schema = 'public'`
  );
  const tableRows = await queryRows<InformationSchemaTableRow>(
    `select table_name, table_type
       from information_schema.tables
      where table_schema = 'public'
        and table_type in ('BASE TABLE', 'VIEW')`
  );
  const enumRows = await queryRows<PgEnumRow>(
    `select t.typname, e.enumlabel
       from pg_enum e
       join pg_type t on t.oid = e.enumtypid
       join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'`
  );

  const columns = new Map<string, Set<string>>();
  const enumColumnUse = new Set<string>();
  for (const row of columnRows) {
    const set = columns.get(row.table_name) ?? new Set<string>();
    set.add(row.column_name);
    columns.set(row.table_name, set);
    if (row.data_type === "USER-DEFINED") enumColumnUse.add(row.udt_name);
  }

  const baseTables = new Set<string>();
  const views = new Set<string>();
  for (const row of tableRows) {
    (row.table_type === "VIEW" ? views : baseTables).add(row.table_name);
  }

  const enums = new Map<string, Set<string>>();
  for (const row of enumRows) {
    const set = enums.get(row.typname) ?? new Set<string>();
    set.add(row.enumlabel);
    enums.set(row.typname, set);
  }

  return { columns, baseTables, views, enums, enumColumnUse };
}

function allowlisted<K extends DriftAllowlistEntry["kind"]>(
  kind: K,
  match: (entry: Extract<DriftAllowlistEntry, { kind: K }>) => boolean
): boolean {
  return DRIFT_ALLOWLIST.some(
    (entry) =>
      entry.kind === kind &&
      match(entry as Extract<DriftAllowlistEntry, { kind: K }>)
  );
}

suite("types/ trust boundary vs live schema (types-drift guard)", () => {
  let live: LiveSchema;

  beforeAll(async () => {
    if (probe.kind !== "ready") return;
    live = await loadLiveSchema();
  });

  describe("table columns — <Table>Row key sets", () => {
    for (const [table, { rowType, keys }] of Object.entries(TABLE_ROW_KEYS)) {
      it(`${table}: ${rowType} matches the live column set`, () => {
        const liveColumns = live.columns.get(table);
        expect(
          liveColumns,
          `table "${table}" is pinned in the manifest (${rowType}) but ` +
            `missing from the live schema — if it was dropped or renamed, ` +
            `update types/database.ts and ${MANIFEST_PATH}`
        ).toBeDefined();
        if (!liveColumns) return;

        const problems: string[] = [];
        for (const key of keys) {
          if (liveColumns.has(key)) continue;
          if (
            allowlisted(
              "ts-only-column",
              (e) => e.table === table && e.column === key
            )
          ) {
            continue;
          }
          problems.push(
            `${table}: column "${key}" is declared in types/database.ts ` +
              `(${rowType}) but missing from the live schema — update ` +
              `types/database.ts (and ${MANIFEST_PATH}), or add a ` +
              `ts-only-column allowlist entry for a deliberate divergence`
          );
        }
        for (const column of liveColumns) {
          if (keys.includes(column)) continue;
          problems.push(
            `${table}: live column "${column}" is missing from ` +
              `types/database.ts (${rowType}) — add it to the Row interface ` +
              `and pin it in ${MANIFEST_PATH}`
          );
        }
        expect(problems).toEqual([]);
      });
    }
  });

  describe("view columns — hand-rolled read-seam row types", () => {
    for (const [view, { rowType, keys }] of Object.entries(VIEW_ROW_KEYS)) {
      it(`${view}: ${rowType} matches the live view column set`, () => {
        const liveColumns = live.columns.get(view);
        expect(
          liveColumns,
          `view "${view}" is pinned in the manifest (${rowType}) but ` +
            `missing from the live schema — if it was dropped or renamed, ` +
            `update the read-seam row type and ${MANIFEST_PATH}`
        ).toBeDefined();
        if (!liveColumns) return;

        const problems: string[] = [];
        for (const key of keys) {
          if (liveColumns.has(key)) continue;
          problems.push(
            `${view}: column "${key}" is declared on ${rowType} but ` +
              `missing from the live view — update the row type ` +
              `(and ${MANIFEST_PATH}) or fix the view migration`
          );
        }
        for (const column of liveColumns) {
          if (keys.includes(column)) continue;
          problems.push(
            `${view}: live view column "${column}" is missing from ` +
              `${rowType} — add it to the row type and pin it in ` +
              MANIFEST_PATH
          );
        }
        expect(problems).toEqual([]);
      });
    }
  });

  describe("coverage — the guard is closed over the live schema", () => {
    it("every live public base table is guarded or explicitly excluded", () => {
      const problems: string[] = [];
      for (const table of live.baseTables) {
        if (table in TABLE_ROW_KEYS || table in UNGUARDED_TABLES) continue;
        problems.push(
          `live table "${table}" is neither pinned in TABLE_ROW_KEYS nor ` +
            `excluded in UNGUARDED_TABLES — pin its <Table>Row key set, or ` +
            `add an UNGUARDED_TABLES entry with a reason, in ${MANIFEST_PATH}`
        );
      }
      expect(problems).toEqual([]);
    });

    it("every live public view is guarded or explicitly excluded", () => {
      const problems: string[] = [];
      for (const view of live.views) {
        if (view in VIEW_ROW_KEYS || view in UNGUARDED_VIEWS) continue;
        problems.push(
          `live view "${view}" is neither pinned in VIEW_ROW_KEYS nor ` +
            `excluded in UNGUARDED_VIEWS — pin its read-seam row type's ` +
            `key set, or add an UNGUARDED_VIEWS entry with a reason, in ` +
            MANIFEST_PATH
        );
      }
      expect(problems).toEqual([]);
    });

    it("nothing is both guarded and excluded, and no exclusion is stale", () => {
      const problems: string[] = [];
      for (const table of Object.keys(UNGUARDED_TABLES)) {
        if (table in TABLE_ROW_KEYS) {
          problems.push(
            `"${table}" is pinned in TABLE_ROW_KEYS AND excluded in ` +
              `UNGUARDED_TABLES — remove the exclusion from ${MANIFEST_PATH}`
          );
        }
        if (!live.baseTables.has(table)) {
          problems.push(
            `stale exclusion: "${table}" (UNGUARDED_TABLES) no longer ` +
              `exists as a live base table — remove the entry from ` +
              MANIFEST_PATH
          );
        }
      }
      for (const view of Object.keys(UNGUARDED_VIEWS)) {
        if (view in VIEW_ROW_KEYS) {
          problems.push(
            `"${view}" is pinned in VIEW_ROW_KEYS AND excluded in ` +
              `UNGUARDED_VIEWS — remove the exclusion from ${MANIFEST_PATH}`
          );
        }
        if (!live.views.has(view)) {
          problems.push(
            `stale exclusion: "${view}" (UNGUARDED_VIEWS) no longer exists ` +
              `as a live view — remove the entry from ${MANIFEST_PATH}`
          );
        }
      }
      expect(problems).toEqual([]);
    });
  });

  describe("enums — types/enums.ts unions vs Postgres enum types", () => {
    for (const [dbEnum, { tsType, values }] of Object.entries(DB_ENUM_VALUES)) {
      it(`${dbEnum}: ${tsType} matches the live enum labels`, () => {
        const liveValues = live.enums.get(dbEnum);
        expect(
          liveValues,
          `Postgres enum "${dbEnum}" is pinned in the manifest (mirrored by ` +
            `types/enums.ts ${tsType}) but missing from the live schema — ` +
            `if it was dropped or renamed, update types/enums.ts and ` +
            MANIFEST_PATH
        ).toBeDefined();
        if (!liveValues) return;

        const problems: string[] = [];
        for (const value of values) {
          if (liveValues.has(value)) continue;
          problems.push(
            `${dbEnum}: value "${value}" is declared in types/enums.ts ` +
              `(${tsType}) but missing from the live Postgres enum — update ` +
              `types/enums.ts (and ${MANIFEST_PATH}) or fix the migration`
          );
        }
        for (const value of liveValues) {
          if (values.includes(value)) continue;
          if (
            allowlisted(
              "db-enum-extra-value",
              (e) => e.dbEnum === dbEnum && e.value === value
            )
          ) {
            continue;
          }
          problems.push(
            `${dbEnum}: live value "${value}" is missing from ` +
              `types/enums.ts (${tsType}) — add it to the union and to ` +
              `${MANIFEST_PATH}, or add a db-enum-extra-value allowlist ` +
              `entry for a deliberate divergence`
          );
        }
        expect(problems).toEqual([]);
      });

      it(`${dbEnum}: is used by at least one live column`, () => {
        if (live.enumColumnUse.has(dbEnum)) return;
        expect(
          allowlisted("enum-without-column", (e) => e.dbEnum === dbEnum),
          `Postgres enum "${dbEnum}" (${tsType}) is not used by any live ` +
            `column — if its column was deliberately dropped with the type ` +
            `retained, add an enum-without-column allowlist entry in ` +
            `${MANIFEST_PATH}; otherwise the union and enum may both be stale`
        ).toBe(true);
      });
    }

    it("every live Postgres enum is pinned in the manifest", () => {
      const problems: string[] = [];
      for (const dbEnum of live.enums.keys()) {
        if (dbEnum in DB_ENUM_VALUES) continue;
        if (
          allowlisted("db-enum-without-ts-union", (e) => e.dbEnum === dbEnum)
        ) {
          continue;
        }
        problems.push(
          `live Postgres enum "${dbEnum}" has no mirroring union pinned in ` +
            `the manifest — add a types/enums.ts union + entry in ` +
            `${MANIFEST_PATH}, or a db-enum-without-ts-union allowlist entry`
        );
      }
      expect(problems).toEqual([]);
    });
  });

  describe("allowlist entries are still live (no stale exemptions)", () => {
    for (const entry of DRIFT_ALLOWLIST) {
      switch (entry.kind) {
        case "ts-only-column": {
          it(`ts-only-column ${entry.table}.${entry.column}`, () => {
            const liveColumns = live.columns.get(entry.table);
            expect(
              liveColumns,
              `stale allowlist entry: table "${entry.table}" no longer ` +
                `exists — remove the ts-only-column entry from ` +
                MANIFEST_PATH
            ).toBeDefined();
            expect(
              liveColumns?.has(entry.column),
              `stale allowlist entry: "${entry.table}.${entry.column}" now ` +
                `EXISTS in the live schema — remove the ts-only-column ` +
                `entry from ${MANIFEST_PATH}`
            ).toBe(false);
            expect(
              TABLE_ROW_KEYS[entry.table]?.keys.includes(entry.column),
              `stale allowlist entry: "${entry.column}" is no longer pinned ` +
                `for "${entry.table}" (dropped from the Row type?) — remove ` +
                `the ts-only-column entry from ${MANIFEST_PATH}`
            ).toBe(true);
          });
          break;
        }
        case "db-enum-extra-value": {
          it(`db-enum-extra-value ${entry.dbEnum}:${entry.value}`, () => {
            expect(
              live.enums.get(entry.dbEnum)?.has(entry.value),
              `stale allowlist entry: enum "${entry.dbEnum}" no longer ` +
                `carries the value "${entry.value}" — remove the ` +
                `db-enum-extra-value entry from ${MANIFEST_PATH}`
            ).toBe(true);
            expect(
              DB_ENUM_VALUES[entry.dbEnum]?.values.includes(entry.value),
              `inconsistent allowlist entry: "${entry.value}" is pinned in ` +
                `the ${entry.dbEnum} manifest values AND allowlisted as a ` +
                `DB-only value — remove one of the two from ${MANIFEST_PATH}`
            ).toBe(false);
          });
          break;
        }
        case "enum-without-column": {
          it(`enum-without-column ${entry.dbEnum}`, () => {
            expect(
              live.enums.has(entry.dbEnum),
              `stale allowlist entry: enum "${entry.dbEnum}" no longer ` +
                `exists — remove the enum-without-column entry (and the ` +
                `manifest pin) from ${MANIFEST_PATH}`
            ).toBe(true);
            expect(
              live.enumColumnUse.has(entry.dbEnum),
              `stale allowlist entry: enum "${entry.dbEnum}" is used by a ` +
                `live column again — remove the enum-without-column entry ` +
                `from ${MANIFEST_PATH}`
            ).toBe(false);
          });
          break;
        }
        case "db-enum-without-ts-union": {
          it(`db-enum-without-ts-union ${entry.dbEnum}`, () => {
            expect(
              live.enums.has(entry.dbEnum),
              `stale allowlist entry: enum "${entry.dbEnum}" no longer ` +
                `exists — remove the db-enum-without-ts-union entry from ` +
                MANIFEST_PATH
            ).toBe(true);
            expect(
              entry.dbEnum in DB_ENUM_VALUES,
              `inconsistent allowlist entry: enum "${entry.dbEnum}" is now ` +
                `pinned in the manifest — remove the db-enum-without-ts-union ` +
                `entry from ${MANIFEST_PATH}`
            ).toBe(false);
          });
          break;
        }
      }
    }
  });
});
