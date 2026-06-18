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
