import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// SC.4 #114 — app-layer no-leak proof. Scans the runtime source tree and asserts
// the two private-note tables are referenced ONLY by the creator-scoped admin
// readers. This is the regression guard against a future leader / over-shepherd
// / super_admin reader, or an SC.2 / SC.3 aggregate, ever
// pulling these rows onto a non-creator surface.

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SCAN_DIRS = ["app", "lib", "components", "types"];
const TABLES = ["shepherd_care_private_notes", "shepherd_care_note_key_slots"];

// The ONLY runtime source allowed to name these tables:
//  - the creator-scoped read models (the single PostgREST read entrypoint),
//  - the hand-rolled Database types, and
//  - the sensitive-data classification manifest (#694), which NAMES the tables
//    to classify them as `encrypted_private` but never reads them. The
//    `.from()` and reader-symbol checks below still hold it to no-read.
const ALLOWLIST = new Set([
  "lib/supabase/shepherd-care-reads.ts",
  "types/database.ts",
  "lib/security/data-classification.ts",
]);

function walk(dir: string, acc: string[]): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = `${dir}/${entry}`;
    const st = statSync(full);
    if (st.isDirectory()) {
      if (
        entry === "__tests__" ||
        entry === "node_modules" ||
        entry === ".next"
      )
        continue;
      walk(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

// Repo-root runtime entrypoints (outside the scanned dirs) that run on every
// request — the proxy (Next 16's renamed middleware) especially — must be
// covered too.
const ROOT_RUNTIME_FILES = ["proxy.ts"]
  .map((f) => `${REPO_ROOT}${f}`)
  .filter((p) => existsSync(p));

const sourceFiles = [
  ...SCAN_DIRS.flatMap((d) => walk(`${REPO_ROOT}${d}`, [])),
  ...ROOT_RUNTIME_FILES,
];
const rel = (abs: string) => abs.slice(REPO_ROOT.length).replace(/\\/g, "/");

describe("SC.4 no-leak — private-note tables are referenced only by the creator readers", () => {
  it("scans a non-trivial number of source files, including the root proxy (sanity)", () => {
    expect(sourceFiles.length).toBeGreaterThan(50);
    expect(sourceFiles.some((f) => f.endsWith("proxy.ts"))).toBe(true);
  });

  it("no runtime source outside the allowlist names either private-note table", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const relPath = rel(file);
      if (ALLOWLIST.has(relPath)) continue;
      const content = readFileSync(file, "utf8");
      if (TABLES.some((t) => content.includes(t))) offenders.push(relPath);
    }
    expect(
      offenders,
      `unexpected references to SC.4 tables in: ${offenders.join(", ")}`
    ).toEqual([]);
  });

  it("the only PostgREST .from() reads of the tables live in shepherd-care-reads.ts", () => {
    const fromOffenders: string[] = [];
    for (const file of sourceFiles) {
      const relPath = rel(file);
      if (relPath === "lib/supabase/shepherd-care-reads.ts") continue;
      const content = readFileSync(file, "utf8");
      for (const t of TABLES) {
        if (
          content.includes(`.from("${t}")`) ||
          content.includes(`.from('${t}')`)
        ) {
          fromOffenders.push(`${relPath} -> ${t}`);
        }
      }
    }
    expect(
      fromOffenders,
      `unexpected .from() reads: ${fromOffenders.join(", ")}`
    ).toEqual([]);
  });

  it("EVERY private-note read in shepherd-care-reads.ts is scoped by created_by_profile_id", () => {
    const readModels = readFileSync(
      `${REPO_ROOT}lib/supabase/shepherd-care-reads.ts`,
      "utf8"
    );
    // Every read filters on the creator (belt-and-braces with RLS).
    expect(readModels).toContain(
      "fetchShepherdCarePrivateNoteCiphertextForCreator"
    );
    expect(readModels).toContain("fetchPrivateNoteKeySlotsForCreator");
    for (const t of TABLES) {
      const marker = `.from("${t}")`;
      let from = 0;
      let occurrences = 0;
      for (;;) {
        const idx = readModels.indexOf(marker, from);
        if (idx === -1) break;
        occurrences += 1;
        // The read chain following EACH .from(table) must scope by the creator.
        const window = readModels.slice(idx, idx + 400);
        expect(
          window,
          `read #${occurrences} of ${t} must scope by creator`
        ).toContain("created_by_profile_id");
        from = idx + marker.length;
      }
      expect(
        occurrences,
        `shepherd-care-reads must read ${t} at least once`
      ).toBeGreaterThan(0);
    }
  });
});

describe("SC.4 no-leak — service-role edge functions never touch the tables", () => {
  // Edge functions hold the service-role key, which BYPASSES RLS, and they live
  // outside the SCAN_DIRS above (and outside Vitest). So the RLS predicate proof
  // is void for them — assert absolutely that they never name the tables.
  const edgeFiles = walk(`${REPO_ROOT}supabase/functions`, []);

  it("scans the edge functions (sanity)", () => {
    expect(edgeFiles.length).toBeGreaterThan(0);
  });

  it("no edge function references either private-note table", () => {
    const offenders = edgeFiles
      .filter((f) => {
        const c = readFileSync(f, "utf8");
        return TABLES.some((t) => c.includes(t));
      })
      .map(rel);
    expect(
      offenders,
      `service-role edge functions must never reference SC.4 tables: ${offenders.join(", ")}`
    ).toEqual([]);
  });
});

describe("SC.4 no-leak — the creator-scoped readers are consumed only on the admin detail path", () => {
  // A future SC.2/SC.3 aggregate could import the reader by SYMBOL (not by the
  // raw table name) and slip past the name scan. Pin who may call them. Since
  // issue #488 the admin detail page's read-orchestration lives behind the
  // reads seam (ADR 0015), so the seam module is the one place the readers may
  // be bound — the page consumes only the assembled detail data.
  const READER_SYMBOLS = [
    "fetchShepherdCarePrivateNoteCiphertextForCreator",
    "fetchPrivateNoteKeySlotsForCreator",
  ];
  const DETAIL_DATA_PATH =
    "components/admin/shepherd-care/shepherd-care-detail-data.ts";
  const SYMBOL_ALLOWLIST = new Set([
    "lib/supabase/shepherd-care-reads.ts", // where they are defined
    DETAIL_DATA_PATH, // the admin detail page's reads seam — the only consumer
  ]);

  it("no source outside the admin detail reads seam uses the private-note readers", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const relPath = rel(file);
      if (SYMBOL_ALLOWLIST.has(relPath)) continue;
      const content = readFileSync(file, "utf8");
      if (READER_SYMBOLS.some((s) => content.includes(s)))
        offenders.push(relPath);
    }
    expect(
      offenders,
      `private-note readers used outside the admin detail path: ${offenders.join(", ")}`
    ).toEqual([]);
  });

  it("the admin detail page passes the ministry_admin gate into the seam loader", () => {
    // requireAdmin() admits super_admin, so the readers must not be CALLED on a
    // super_admin request — not merely hidden from the UI. The page resolves
    // the gate from the actor's role and hands it to the loader.
    const page = readFileSync(
      `${REPO_ROOT}app/(protected)/admin/shepherd-care/[profileId]/page.tsx`,
      "utf8"
    );
    expect(page).toMatch(
      /loadShepherdCareDetailData\(\{[^}]*canReadPrivateNotes: actorRole === "ministry_admin"/
    );
  });

  it("the reads seam invokes the readers only behind the canReadPrivateNotes gate", () => {
    const data = readFileSync(`${REPO_ROOT}${DETAIL_DATA_PATH}`, "utf8");
    // The raw creator readers are only BOUND into the seam adapter — never
    // invoked directly, so the gated seam methods are the sole read path.
    for (const sym of READER_SYMBOLS) {
      expect(
        data.includes(`${sym}(`),
        `${sym} must not be invoked directly in the seam module`
      ).toBe(false);
    }
    for (const call of [
      "reads.fetchPrivateNoteKeySlots(",
      "reads.fetchPrivateNoteCiphertext(",
    ]) {
      const idx = data.indexOf(call);
      expect(idx, `seam must call ${call}…)`).toBeGreaterThan(-1);
      const before = data.slice(Math.max(0, idx - 160), idx);
      expect(
        before,
        `${call}…) must be gated by canReadPrivateNotes`
      ).toContain("canReadPrivateNotes");
      // The gate must guard EVERY call, so pin the single call site.
      expect(
        data.indexOf(call, idx + call.length),
        `${call}…) must have exactly one (gated) call site`
      ).toBe(-1);
    }
  });
});
