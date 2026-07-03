import { describe, expect, it } from "vitest";

import { DATA_CLASSIFICATION } from "@/lib/security/data-classification";
import { readSourceFiles, stripComments } from "./support/source-globber";
import { stripFiles, TEST_FILE_EXCLUDES } from "./support/scan";

// Read-allowlist naming lint (issue #818, audit finding TEST-5 item 4;
// standing rule ARCH-7 in AGENTS.md):
//
//   "Name read allowlists [SURFACE]_[ENTITY]_COLUMNS (e.g.
//    LEADER_FOLLOW_UP_COLUMNS, ADMIN_FOLLOW_UP_COLUMNS); reserve a _SAFE
//    suffix for a list that actively OMITS sensitive columns as a
//    trust-boundary signal."
//
// Enforced shape, tuned to be useful without forcing a mass rename:
//   R1  every `columns<T>()` allowlist is UPPER_SNAKE ending `_COLUMNS`
//       (or `_COLUMNS_SAFE` / `_SAFE` per the reserved suffix).
//   R2  the `_SAFE` suffix is RESERVED: an export may only carry it when it
//       is a column allowlist in the read-file scope (no repurposing the
//       trust-boundary signal for unrelated constants).
//   R3  a NEW allowlist must start with a known surface prefix; the existing
//       unprefixed names are frozen in a ledger, so adding one is a
//       conscious, reviewable decision.
//   R4  an allowlist whose row type `Omit`s an `admin_private`-classified
//       column must carry `_SAFE` (or sit in the SAFE_PENDING ledger).

// Where DB read allowlists live (the reads seam + session). Deliberately
// excludes lib/dashboard/** — its *_COLUMNS exports are UI column-preference
// lists, not DB allowlists.
const READ_SCOPE_ROOTS = [
  "lib/supabase",
  "lib/over-shepherd",
  "lib/auth/session.ts",
];

const READ_FILES = stripFiles(
  readSourceFiles({
    roots: READ_SCOPE_ROOTS,
    extensions: [".ts"],
    exclude: [...TEST_FILE_EXCLUDES],
  }),
  stripComments
);

interface AllowlistDecl {
  readonly relPath: string;
  readonly name: string;
  /** Row-type name from `columns<TypeName>()`, when built with the helper. */
  readonly typeName: string | null;
}

// Both idioms: the typed `columns<T>()(…)` helper and a plain named array.
const COLUMNS_HELPER_DECL =
  /(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*columns\s*<\s*([A-Za-z0-9_$]+)\s*>/g;
const NAMED_ARRAY_DECL =
  /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*_(?:COLUMNS|SAFE))\s*=\s*\[/g;

function collectAllowlists(): AllowlistDecl[] {
  const decls: AllowlistDecl[] = [];
  for (const file of READ_FILES) {
    for (const m of file.text.matchAll(COLUMNS_HELPER_DECL)) {
      decls.push({ relPath: file.relPath, name: m[1], typeName: m[2] });
    }
    for (const m of file.text.matchAll(NAMED_ARRAY_DECL)) {
      decls.push({ relPath: file.relPath, name: m[1], typeName: null });
    }
  }
  return decls;
}

const ALLOWLISTS = collectAllowlists();

// The surface vocabulary of the oversight ladder + session. A new prefix here
// is a review decision (it names a new trust boundary).
const SURFACE_PREFIXES = [
  "LEADER_",
  "ADMIN_",
  "OVER_SHEPHERD_",
  "SHEPHERD_CARE_",
  "SUPER_ADMIN_",
  "SESSION_",
];

// Allowlists that predate the [SURFACE]_ prefix convention, frozen as-is.
// New allowlists must pick a surface prefix; extending this ledger instead is
// a conscious, reviewable decision.
const LEGACY_UNPREFIXED: ReadonlySet<string> = new Set([
  "APP_SETTINGS_COLUMNS",
  "ATTENDANCE_RECORD_COLUMNS",
  "ATTENDANCE_SESSION_COLUMNS",
  "AUDIT_EVENT_COLUMNS",
  "CARE_NOTE_COLUMNS",
  "DUE_FOLLOW_UP_COLUMNS",
  "GROUP_CALENDAR_EVENT_COLUMNS",
  "GROUP_COLUMNS",
  "GROUP_HEALTH_ASSESSMENT_RATING_COLUMNS",
  "GROUP_HEALTH_UPDATE_COLUMNS",
  "GROUP_LEADER_COLUMNS",
  "GROUP_MEMBERSHIP_COLUMNS",
  "GROUP_METRIC_SETTINGS_COLUMNS",
  "GROUP_PROSPECT_SIGNAL_COLUMNS",
  "GROUP_RUBRIC_GRADE_COLUMNS",
  "GUEST_COLUMNS",
  "HEALTH_RUBRIC_COLUMNS",
  "MEMBER_COLUMNS",
  "NOTE_TRANSPARENCY_GRANT_COLUMNS",
  "PLAN_GROUP_COLUMNS",
  "PRAYER_REQUEST_COLUMNS",
  "PROFILE_COLUMNS",
  "PROSPECT_BOARD_COLUMNS",
  "PROSPECT_STATE_COUNT_COLUMNS",
  "READINESS_RULE_COLUMNS",
  "SHEPHERD_COVERAGE_ASSIGNMENT_COLUMNS",
  // "LEADER_RUBRIC_GRADE_COLUMNS" and "LEADER_FOLLOW_UP_COLUMNS" carry the
  // LEADER_ prefix and are not in this ledger.
]);

// Allowlists that actively omit an admin_private column but predate the
// `_SAFE` suffix. Renaming touches runtime call sites and pinned test
// strings, so each rename is tracked as follow-up rather than forced here.
const SAFE_PENDING: Readonly<Record<string, string>> = {
  LEADER_FOLLOW_UP_COLUMNS:
    "Omits admin_private_note (enforced by " +
    "leader-allowlist-no-admin-private.test.ts) but predates the _SAFE " +
    "convention; rename to LEADER_FOLLOW_UP_COLUMNS_SAFE is a follow-up.",
};

describe("fitness: read-allowlist naming (ARCH-7)", () => {
  it("found a representative set of allowlists to lint", () => {
    // Guard against a glob/regex regression silently scanning nothing.
    expect(ALLOWLISTS.length).toBeGreaterThan(25);
  });

  it("R1: every columns<T>() allowlist is UPPER_SNAKE ending _COLUMNS/_SAFE", () => {
    const offenders = ALLOWLISTS.filter(
      (d) => !/^[A-Z][A-Z0-9_]*_(?:COLUMNS|COLUMNS_SAFE|SAFE)$/.test(d.name)
    ).map((d) => `  ${d.relPath}: ${d.name}`);
    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `Read allowlists must be UPPER_SNAKE named ` +
            `[SURFACE]_[ENTITY]_COLUMNS (AGENTS.md, ARCH-7):\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("R2: the _SAFE suffix is reserved for read allowlists", () => {
    // Scan the whole runtime tree for _SAFE exports; each must be one of the
    // allowlists collected from the read scope above.
    const runtime = stripFiles(
      readSourceFiles({
        roots: ["lib", "app", "components"],
        extensions: [".ts", ".tsx"],
        exclude: [...TEST_FILE_EXCLUDES],
      }),
      stripComments
    );
    const allowlistNames = new Set(ALLOWLISTS.map((d) => d.name));
    const offenders: string[] = [];
    const safeExport = /export\s+const\s+([A-Z][A-Z0-9_]*_SAFE)\b/g;
    for (const file of runtime) {
      for (const m of file.text.matchAll(safeExport)) {
        if (!allowlistNames.has(m[1])) {
          offenders.push(`  ${file.relPath}: ${m[1]}`);
        }
      }
    }
    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `_SAFE is a reserved trust-boundary suffix for column allowlists ` +
            `that actively omit sensitive columns (AGENTS.md, ARCH-7). Rename ` +
            `these exports:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("R3: new allowlists carry a surface prefix (legacy names are frozen)", () => {
    const offenders = ALLOWLISTS.filter(
      (d) =>
        !SURFACE_PREFIXES.some((p) => d.name.startsWith(p)) &&
        !LEGACY_UNPREFIXED.has(d.name)
    ).map((d) => `  ${d.relPath}: ${d.name}`);
    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `New read allowlists must start with a surface prefix ` +
            `(${SURFACE_PREFIXES.join(" ")}) per AGENTS.md ARCH-7. Pick the ` +
            `surface the read serves, or make extending LEGACY_UNPREFIXED a ` +
            `deliberate review decision:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("R4: an allowlist omitting an admin_private column carries _SAFE", () => {
    const adminPrivateColumns = new Set(
      DATA_CLASSIFICATION.flatMap((t) =>
        (t.columns ?? [])
          .filter((c) => c.classification === "admin_private")
          .map((c) => c.column)
      )
    );
    const offenders: string[] = [];
    for (const file of READ_FILES) {
      for (const decl of ALLOWLISTS) {
        if (decl.relPath !== file.relPath || decl.typeName === null) continue;
        if (decl.name.endsWith("_SAFE") || decl.name in SAFE_PENDING) continue;
        const omitDecl = new RegExp(
          `type\\s+${decl.typeName}\\s*=\\s*Omit<[^,]+,([^>]+)>`
        ).exec(file.text);
        if (!omitDecl) continue;
        const omitted = [...omitDecl[1].matchAll(/"([^"]+)"/g)].map(
          (m) => m[1]
        );
        if (omitted.some((c) => adminPrivateColumns.has(c))) {
          offenders.push(`  ${decl.relPath}: ${decl.name}`);
        }
      }
    }
    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `These allowlists actively omit an admin_private column — the ` +
            `trust-boundary signal the _SAFE suffix exists for. Rename with ` +
            `_SAFE, or add a reasoned SAFE_PENDING entry:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("the LEGACY_UNPREFIXED and SAFE_PENDING ledgers have no stale entries", () => {
    const names = new Set(ALLOWLISTS.map((d) => d.name));
    const stale = [
      ...[...LEGACY_UNPREFIXED].filter((n) => !names.has(n)),
      ...Object.keys(SAFE_PENDING).filter((n) => !names.has(n)),
    ];
    expect(
      stale,
      stale.length === 0
        ? ""
        : `Ledger entries name allowlists that no longer exist; remove ` +
            `them:\n${stale.map((s) => `  ${s}`).join("\n")}`
    ).toEqual([]);
  });
});
