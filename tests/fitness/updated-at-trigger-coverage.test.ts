import { describe, expect, it } from "vitest";

import {
  stripDollarQuoted,
  stripSqlComments,
  stripSqlStrings,
} from "./support/scan";
import { readSourceFiles } from "./support/source-globber";

// Hygiene invariant (#865): **every table with an `updated_at` column has a
// `set_updated_at` BEFORE UPDATE trigger in force.** About 20 tables installed
// the standard trigger from the start; a later-added cluster relied purely on
// each RPC remembering `updated_at = now()` — correct today, but with no
// backstop a future UPDATE path that forgets the manual assignment silently
// leaves the column stale. Migration `20260714000000` closed the gap; this
// scan keeps it closed for every table a future migration creates.
//
// Method: replay the migrations in apply order (filename order — the same
// model `lib/admin/__tests__/migration-safety.ts` uses for policies), tracking
// (a) which tables currently declare an `updated_at` column and (b) which
// tables currently have a `set_updated_at` trigger. Comments, dollar-quoted
// function bodies, and string literals are blanked first, so a trigger merely
// MENTIONED in a comment or built as dynamic SQL never counts.

const MIGRATIONS = readSourceFiles({
  roots: ["supabase/migrations"],
  extensions: [".sql"],
});

// Tables deliberately exempt from the trigger rule. Empty today — add an entry
// only with a rationale (e.g. an append-only table whose `updated_at` is
// intentionally write-once).
const TRIGGER_EXEMPT_TABLES: ReadonlyMap<string, string> = new Map([]);

interface TableState {
  /** tables that currently declare an updated_at column → where declared */
  readonly updatedAtTables: Map<string, string>;
  /** tables that currently have a set_updated_at BEFORE UPDATE trigger */
  readonly triggeredTables: Set<string>;
}

const TABLE_NAME = String.raw`(?:public\.)?"?([a-z_][a-z0-9_]*)"?`;

const CREATE_TABLE_RE = new RegExp(
  String.raw`\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?${TABLE_NAME}`,
  "i"
);
const DROP_TABLE_RE = new RegExp(
  String.raw`\bdrop\s+table\s+(?:if\s+exists\s+)?${TABLE_NAME}`,
  "i"
);
const ADD_UPDATED_AT_RE = new RegExp(
  String.raw`\balter\s+table\s+(?:only\s+)?${TABLE_NAME}[\s\S]*\badd\s+column\s+(?:if\s+not\s+exists\s+)?"?updated_at"?\b`,
  "i"
);
const DROP_UPDATED_AT_RE = new RegExp(
  String.raw`\balter\s+table\s+(?:only\s+)?${TABLE_NAME}[\s\S]*\bdrop\s+column\s+(?:if\s+exists\s+)?"?updated_at"?\b`,
  "i"
);
const CREATE_TRIGGER_RE = new RegExp(
  String.raw`\bcreate\s+trigger\s+"?[a-z0-9_]+"?\s+before\s+update\s+(?:of\s+[a-z0-9_,\s"]+\s+)?on\s+${TABLE_NAME}[\s\S]*\bexecute\s+(?:function|procedure)\s+(?:public\.)?set_updated_at\s*\(\s*\)`,
  "i"
);
const DROP_TRIGGER_RE = new RegExp(
  String.raw`\bdrop\s+trigger\s+(?:if\s+exists\s+)?"?([a-z0-9_]+)"?\s+on\s+${TABLE_NAME}`,
  "i"
);

/** A `create table (...)` statement declares updated_at as a column. */
function declaresUpdatedAtColumn(statement: string): boolean {
  const open = statement.indexOf("(");
  if (open === -1) return false;
  return /\bupdated_at\b/i.test(statement.slice(open));
}

function replayMigrations(): TableState {
  const updatedAtTables = new Map<string, string>();
  const triggeredTables = new Set<string>();

  for (const file of MIGRATIONS) {
    const cleaned = stripSqlStrings(
      stripDollarQuoted(stripSqlComments(file.text))
    );
    // Dollar-quoted bodies are blanked, so top-level `;` is a real statement
    // boundary.
    for (const statement of cleaned.split(";")) {
      const create = CREATE_TABLE_RE.exec(statement);
      if (create && declaresUpdatedAtColumn(statement)) {
        updatedAtTables.set(create[1].toLowerCase(), file.relPath);
        continue;
      }
      const addColumn = ADD_UPDATED_AT_RE.exec(statement);
      if (addColumn) {
        updatedAtTables.set(addColumn[1].toLowerCase(), file.relPath);
        continue;
      }
      const dropColumn = DROP_UPDATED_AT_RE.exec(statement);
      if (dropColumn) {
        updatedAtTables.delete(dropColumn[1].toLowerCase());
        continue;
      }
      const dropTable = DROP_TABLE_RE.exec(statement);
      if (dropTable) {
        updatedAtTables.delete(dropTable[1].toLowerCase());
        triggeredTables.delete(dropTable[1].toLowerCase());
        continue;
      }
      const createTrigger = CREATE_TRIGGER_RE.exec(statement);
      if (createTrigger) {
        triggeredTables.add(createTrigger[1].toLowerCase());
        continue;
      }
      const dropTrigger = DROP_TRIGGER_RE.exec(statement);
      if (dropTrigger && /_set_updated_at$/i.test(dropTrigger[1])) {
        triggeredTables.delete(dropTrigger[2].toLowerCase());
      }
    }
  }

  return { updatedAtTables, triggeredTables };
}

describe("fitness: every updated_at column has a set_updated_at trigger", () => {
  const { updatedAtTables, triggeredTables } = replayMigrations();

  it("finds migrations to scan (guards against a broken glob)", () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0);
  });

  it("actually parses a non-trivial schema (sanity floor)", () => {
    // ~30 tables carry updated_at; a parser regression that silently matched
    // nothing would otherwise pass the coverage check vacuously.
    expect(updatedAtTables.size).toBeGreaterThan(20);
    expect(triggeredTables.size).toBeGreaterThan(20);
    // Two known anchors, one original and one backstopped by 20260714000000.
    expect(updatedAtTables.has("profiles")).toBe(true);
    expect(triggeredTables.has("profiles")).toBe(true);
    expect(triggeredTables.has("shepherd_care_admin_notes")).toBe(true);
  });

  it("every table declaring updated_at has the trigger in force", () => {
    const missing = [...updatedAtTables.entries()]
      .filter(([table]) => !triggeredTables.has(table))
      .filter(([table]) => !TRIGGER_EXEMPT_TABLES.has(table))
      .map(
        ([table, declaredAt]) => `  ${table}  (updated_at from ${declaredAt})`
      )
      .sort();

    expect(
      missing,
      missing.length === 0
        ? ""
        : `These tables declare an updated_at column but have no ` +
            `set_updated_at BEFORE UPDATE trigger in force. Add the standard ` +
            `trigger in your migration (see 20260714000000_add_set_updated_at_` +
            `trigger_backstops.sql for the pattern), or — if the column is ` +
            `deliberately hand-maintained — add the table to ` +
            `TRIGGER_EXEMPT_TABLES with a rationale:\n${missing.join("\n")}`
    ).toEqual([]);
  });

  it("every exemption still names a table with updated_at (no stale entries)", () => {
    const stale = [...TRIGGER_EXEMPT_TABLES.keys()].filter(
      (table) => !updatedAtTables.has(table)
    );
    expect(
      stale,
      stale.length === 0
        ? ""
        : `These TRIGGER_EXEMPT_TABLES entries no longer match any table ` +
            `with an updated_at column — remove them:\n  ${stale.join("\n  ")}`
    ).toEqual([]);
  });
});
