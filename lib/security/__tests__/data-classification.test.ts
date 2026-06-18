import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CLASSIFICATIONS,
  DATA_CLASSIFICATION,
  isSensitive,
  looksSensitiveByName,
  policyTbdTables,
  sensitiveTables,
  tableClassification,
  type Classification,
} from "@/lib/security/data-classification";

const VALID = new Set<Classification>(CLASSIFICATIONS);

// Parse the hand-rolled `XxxRow` interfaces in types/database.ts into
// table → column[] so the default-rule check can reconcile against the REAL
// schema, not only the columns already listed in the manifest. Interface names
// map to snake_case table names (MultiplicationCandidatesRow →
// multiplication_candidates).
function parseSchemaColumns(): Map<string, string[]> {
  const src = readFileSync(resolve(process.cwd(), "types/database.ts"), "utf8");
  const out = new Map<string, string[]>();
  const re = /export interface (\w+)Row\s*\{([\s\S]*?)\n\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const table = m[1].replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
    const cols: string[] = [];
    for (const line of m[2].split(/\n/)) {
      const c = line.match(/^\s{2,}(\w+)\s*[?]?:/);
      if (c) cols.push(c[1]);
    }
    out.set(table, cols);
  }
  return out;
}

// Columns whose NAME matches the sensitive heuristic but are reviewed as
// operational (a version number, a date) — an explicit, documented decision so
// they don't silently fall through as "unclassified".
const REVIEWED_OPERATIONAL = new Set<string>([
  "groups.pause_reason", // why a group paused (e.g. "summer break") — logistics
  "church_attendance_snapshots.snapshot_date", // a date, not freeform text
]);

describe("data-classification manifest", () => {
  it("every entry uses a valid classification and a unique table name", () => {
    const seen = new Set<string>();
    for (const entry of DATA_CLASSIFICATION) {
      expect(VALID.has(entry.classification), entry.table).toBe(true);
      expect(seen.has(entry.table), `duplicate ${entry.table}`).toBe(false);
      seen.add(entry.table);
      for (const col of entry.columns ?? []) {
        expect(
          VALID.has(col.classification),
          `${entry.table}.${col.column}`
        ).toBe(true);
      }
    }
  });

  it("reconciles against the real schema: every sensitive-looking column has a decision", () => {
    // Closes the "absence = operational" hole: parse types/database.ts and
    // require EVERY sensitive-named schema column to be a conscious decision —
    // either classified in the manifest (a column entry, or a wholly-sensitive
    // table baseline) or in the documented REVIEWED_OPERATIONAL allowlist. A new
    // freeform/contact/token column added to the schema without a manifest entry
    // fails here rather than silently dropping out of sensitiveTables().
    const schema = parseSchemaColumns();
    const undecided: string[] = [];
    for (const [table, columns] of schema) {
      const entry = tableClassification(table);
      const baselineSensitive = entry
        ? isSensitive(entry.classification)
        : false;
      const classifiedColumns = new Set(
        (entry?.columns ?? []).map((c) => c.column)
      );
      for (const column of columns) {
        if (!looksSensitiveByName(column)) continue;
        const decided =
          baselineSensitive ||
          classifiedColumns.has(column) ||
          REVIEWED_OPERATIONAL.has(`${table}.${column}`);
        if (!decided) undecided.push(`${table}.${column}`);
      }
    }
    expect(
      undecided,
      undecided.length === 0
        ? ""
        : `Sensitive-looking schema columns with no manifest decision — add a ` +
            `classification or a documented REVIEWED_OPERATIONAL entry:\n  ${undecided.join(
              "\n  "
            )}`
    ).toEqual([]);
  });

  it("default rule: no operational_metadata column hides a sensitive-looking name", () => {
    // Any column the name-rule flags as sensitive must NOT be classified
    // operational_metadata — it has to be a sensitive classification (or, if
    // genuinely undecided, policy_tbd, which is itself sensitive). This is how
    // "sensitive until proven otherwise" is enforced against the real columns
    // enumerated in the manifest.
    const offenders: string[] = [];
    for (const entry of DATA_CLASSIFICATION) {
      for (const col of entry.columns ?? []) {
        if (
          looksSensitiveByName(col.column) &&
          !isSensitive(col.classification)
        ) {
          offenders.push(`${entry.table}.${col.column}`);
        }
      }
    }
    expect(
      offenders,
      `These freeform/contact/token columns are classified non-sensitive ` +
        `despite the default rule:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("encodes the default rule for representative freeform/token/contact names", () => {
    for (const name of [
      "body",
      "leader_note",
      "admin_private_note",
      "additional_note",
      "admin_summary",
      "override_reason",
      "email",
      "phone",
      "household_name",
      "token_hash",
      "ciphertext",
      "iv",
      "wrapped_dek",
      "row_snapshot",
    ]) {
      expect(looksSensitiveByName(name), name).toBe(true);
    }
    // Plainly operational identifiers are not swept up.
    for (const name of ["id", "group_id", "created_at", "status", "role"]) {
      expect(looksSensitiveByName(name), name).toBe(false);
    }
  });

  it("sensitiveTables() includes the core sensitive surfaces", () => {
    const sensitive = new Set(sensitiveTables());
    for (const table of [
      "profiles",
      "members",
      "care_notes",
      "prayer_requests",
      "shepherd_care_private_notes",
      "shepherd_care_admin_notes",
      "follow_ups",
      "audit_events",
      "invitations",
      "tombstones",
      "groups", // sensitive via admin_notes
    ]) {
      expect(sensitive.has(table), `expected ${table} sensitive`).toBe(true);
    }
  });

  it("a sensitive baseline table classifies at least one sensitive column or carries a note", () => {
    for (const entry of DATA_CLASSIFICATION) {
      if (!isSensitive(entry.classification)) continue;
      const hasSensitiveColumn = (entry.columns ?? []).some((c) =>
        isSensitive(c.classification)
      );
      // Whole-table-sensitive surfaces (audit/encrypted/danger) may have no
      // per-column detail, but must explain themselves with a note.
      expect(
        hasSensitiveColumn || Boolean(entry.note),
        `${entry.table} is sensitive but undocumented`
      ).toBe(true);
    }
  });

  it("surfaces policy_tbd entries rather than hiding them", () => {
    // Not a hard requirement that any exist, but if they do they must be
    // sensitive-by-default and discoverable.
    for (const table of policyTbdTables()) {
      const entry = tableClassification(table);
      expect(entry?.policyTbd).toBe(true);
    }
  });
});
