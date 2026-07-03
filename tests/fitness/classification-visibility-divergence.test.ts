import { describe, expect, it } from "vitest";

import {
  DATA_CLASSIFICATION,
  sensitiveTables,
  type Classification,
} from "@/lib/security/data-classification";
import {
  MATRIX,
  type VisibilityClass,
} from "@/lib/admin/__tests__/rls-visibility-matrix";
import { readSourceFiles, stripComments } from "./support/source-globber";

// Classification-driven TS↔SQL visibility-divergence check (issue #818,
// audit finding TEST-5 item 2).
//
// The SQL side of every read boundary is already machine-checked: the RLS
// visibility sweep (lib/admin/__tests__/admin-rls-visibility-sweep.test.ts)
// pins each MATRIX entry's expect/forbid tokens against its authoritative
// migration, and the care-note resolver check
// (tests/fitness/care-note-visibility-divergence.test.ts) pins the
// CARE_NOTE_EXCEPTION's TS resolver to its RLS USING clause.
//
// What was missing is the DERIVATION: nothing failed when the classification
// manifest (lib/security/data-classification.ts) and the visibility matrix
// drifted apart — e.g. a newly classified `encrypted_private` table whose TS
// read path forgot the creator-only gate would pass every existing check.
// This test closes that gap in three layers:
//
//   1. Bridge — every sensitive table in the manifest has a MATRIX entry.
//   2. Class mapping — the sharp manifest classes imply a visibility class
//      (with a reasoned exemption ledger), in both directions where the class
//      is exclusive.
//   3. TS gates — every `encrypted_private` table (the SC.4 inverse rule:
//      creator-only, Ministry Admin role, Super Admin EXCLUDED) has a pinned
//      TS-side gate, so the app-layer read path can't silently widen even
//      though RLS would still hold the line.

const MATRIX_BY_TABLE = new Map(MATRIX.map((e) => [e.table, e]));

describe("fitness: classification manifest ↔ visibility matrix ↔ TS gates", () => {
  it("every classified-sensitive table has a visibility-matrix entry", () => {
    const missing = sensitiveTables().filter((t) => !MATRIX_BY_TABLE.has(t));
    expect(
      missing,
      missing.length === 0
        ? ""
        : `These tables are classified sensitive in DATA_CLASSIFICATION but ` +
            `have no RLS visibility classification. Add a MATRIX entry ` +
            `(lib/admin/__tests__/rls-visibility-matrix.ts) so the sweep pins ` +
            `their SELECT policy:\n${missing.map((t) => `  ${t}`).join("\n")}`
    ).toEqual([]);
  });

  // The sharp classes: a table with this manifest classification must land in
  // one of these visibility classes. Broad classes (pii, sensitive_care, …)
  // legitimately span several visibility classes and are NOT constrained here.
  const CLASS_TO_VISIBILITY: Partial<
    Record<Classification, readonly VisibilityClass[]>
  > = {
    encrypted_private: ["PRIVATE_NOTE_EXCEPTION"],
    audit: ["SUPER_ADMIN_ONLY"],
    danger_zone_snapshot: ["SUPER_ADMIN_ONLY"],
    invite_auth: ["SUPER_ADMIN_ONLY", "NO_READ"],
  };

  // Reasoned exemptions from the class mapping — each entry names the table,
  // the visibility class it is allowed to keep, and why. Adding here is a
  // reviewable decision.
  const CLASS_EXEMPT: Readonly<
    Record<string, { allows: VisibilityClass; reason: string }>
  > = {
    group_status_history: {
      allows: "LEADER_SCOPED",
      reason:
        "Lifecycle/health change trail is classified `audit` for log hygiene, " +
        "but it is deliberately leader-readable: a leader sees their own " +
        "group's history (phase-4 RLS, kept by the consolidate migration).",
    },
  };

  it("sharp manifest classes map to their visibility classes", () => {
    const offenders: string[] = [];
    for (const entry of DATA_CLASSIFICATION) {
      const allowed = CLASS_TO_VISIBILITY[entry.classification];
      if (!allowed) continue;
      const matrixEntry = MATRIX_BY_TABLE.get(entry.table);
      if (!matrixEntry) continue; // the bridge test reports missing entries
      const exempt = CLASS_EXEMPT[entry.table];
      if (exempt && matrixEntry.cls === exempt.allows) continue;
      if (!allowed.includes(matrixEntry.cls)) {
        offenders.push(
          `  ${entry.table}: classified ${entry.classification} → expected ` +
            `${allowed.join(" | ")}, but the matrix says ${matrixEntry.cls}`
        );
      }
    }
    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `Classification and visibility class diverge. Either the RLS policy ` +
            `is wider than the classification allows (fix the policy) or the ` +
            `classification changed (update the matrix / add a reasoned ` +
            `CLASS_EXEMPT entry):\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("PRIVATE_NOTE_EXCEPTION is exactly the encrypted_private set (SC.4 inverse rule)", () => {
    // Both directions: every encrypted_private table is a
    // PRIVATE_NOTE_EXCEPTION, and nothing else may claim that class — it is
    // the ONE deliberate inversion of the oversight ladder (creator-only,
    // hidden even from the Super Admin).
    const classified = DATA_CLASSIFICATION.filter(
      (e) => e.classification === "encrypted_private"
    )
      .map((e) => e.table)
      .sort();
    const inMatrix = MATRIX.filter((e) => e.cls === "PRIVATE_NOTE_EXCEPTION")
      .map((e) => e.table)
      .sort();
    expect(inMatrix).toEqual(classified);
  });

  it("the CLASS_EXEMPT ledger has no stale entries", () => {
    const stale = Object.keys(CLASS_EXEMPT).filter((table) => {
      const entry = DATA_CLASSIFICATION.find((e) => e.table === table);
      const matrixEntry = MATRIX_BY_TABLE.get(table);
      return (
        !entry ||
        !CLASS_TO_VISIBILITY[entry.classification] ||
        matrixEntry?.cls !== CLASS_EXEMPT[table].allows
      );
    });
    expect(
      stale,
      stale.length === 0
        ? ""
        : `CLASS_EXEMPT entries no longer match reality; remove or update ` +
            `them:\n${stale.map((s) => `  ${s}`).join("\n")}`
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TS-side gates for the encrypted_private tables. The RLS USING clause
// (`auth_role() = 'ministry_admin' AND created_by_profile_id =
// auth_profile_id()`) is pinned by the visibility sweep; these pins keep the
// APP layer expressing the same rule, so a refactor can't quietly hand the
// Super Admin (or a broader admin check) a read path that only RLS then has
// to catch. Keyed by table so a NEW encrypted_private table fails until it
// registers its gate here.
// ---------------------------------------------------------------------------

interface TsGate {
  readonly file: string;
  /** Comment-stripped source must match every one of these. */
  readonly mustMatch: readonly RegExp[];
  /** …and none of these. */
  readonly mustNotMatch: readonly RegExp[];
}

const TS_GATES: Readonly<Record<string, readonly TsGate[]>> = {
  shepherd_care_private_notes: [
    {
      // The single UI/data gate: only the Ministry Admin role builds the
      // private-note tab. `super_admin` passes requireAdmin() on this route,
      // so the exclusion must live in this expression.
      file: "components/admin/shepherd-care/shepherd-care-detail-view.tsx",
      mustMatch: [/canReadPrivateNotes:\s*actorRole === "ministry_admin"/],
      mustNotMatch: [
        /canReadPrivateNotes:\s*isAdminRole/,
        /canReadPrivateNotes:[^,\n]*super_admin/,
      ],
    },
    {
      // The single allowed reader: creator-scoped filter + column allowlist.
      file: "lib/supabase/shepherd-care-private-note-reads.ts",
      mustMatch: [
        /from\("shepherd_care_private_notes"\)/,
        /SHEPHERD_CARE_PRIVATE_NOTE_COLUMNS\.select/,
        /\.eq\("created_by_profile_id", creatorProfileId\)/,
      ],
      mustNotMatch: [/super_admin/],
    },
  ],
  shepherd_care_note_key_slots: [
    {
      file: "lib/supabase/shepherd-care-private-note-reads.ts",
      mustMatch: [
        /from\("shepherd_care_note_key_slots"\)/,
        /SHEPHERD_CARE_KEY_SLOT_COLUMNS\.select/,
        /\.eq\("created_by_profile_id", creatorProfileId\)/,
      ],
      mustNotMatch: [/super_admin/],
    },
  ],
};

describe("fitness: encrypted_private tables keep their TS-side creator gate", () => {
  const gateFiles = new Map(
    readSourceFiles({
      roots: [
        ...new Set(
          Object.values(TS_GATES)
            .flat()
            .map((g) => g.file)
        ),
      ],
      extensions: [".ts", ".tsx"],
    }).map((f) => [f.relPath, stripComments(f.text)])
  );

  it("every encrypted_private table has a registered TS gate", () => {
    const encrypted = DATA_CLASSIFICATION.filter(
      (e) => e.classification === "encrypted_private"
    ).map((e) => e.table);
    const unregistered = encrypted.filter((t) => !(t in TS_GATES));
    expect(
      unregistered,
      unregistered.length === 0
        ? ""
        : `These encrypted_private tables have no TS-side gate registered in ` +
            `TS_GATES. Pin their app-layer read gate (creator-scoped, Super ` +
            `Admin excluded) here:\n${unregistered.map((t) => `  ${t}`).join("\n")}`
    ).toEqual([]);
  });

  it("every registered TS gate holds", () => {
    const offenders: string[] = [];
    for (const [table, gates] of Object.entries(TS_GATES)) {
      for (const gate of gates) {
        const text = gateFiles.get(gate.file);
        if (text === undefined) {
          offenders.push(`  ${table}: gate file missing — ${gate.file}`);
          continue;
        }
        for (const re of gate.mustMatch) {
          if (!re.test(text)) {
            offenders.push(`  ${table}: ${gate.file} no longer matches ${re}`);
          }
        }
        for (const re of gate.mustNotMatch) {
          if (re.test(text)) {
            offenders.push(`  ${table}: ${gate.file} now matches ${re}`);
          }
        }
      }
    }
    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `The TS side of the SC.4 boundary diverged from the classified ` +
            `rule (creator-only, Ministry Admin role, Super Admin excluded). ` +
            `If the gate legitimately moved, update TS_GATES to pin its new ` +
            `home:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("the TS_GATES ledger has no stale entries", () => {
    const encrypted = new Set(
      DATA_CLASSIFICATION.filter(
        (e) => e.classification === "encrypted_private"
      ).map((e) => e.table)
    );
    const stale = Object.keys(TS_GATES).filter((t) => !encrypted.has(t));
    expect(
      stale,
      stale.length === 0
        ? ""
        : `TS_GATES lists tables that are no longer classified ` +
            `encrypted_private; remove them:\n${stale.map((s) => `  ${s}`).join("\n")}`
    ).toEqual([]);
  });
});
