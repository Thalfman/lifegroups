import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// SC.4 #114 — app-layer no-leak proof. Scans the runtime source tree and asserts
// the two private-note tables are referenced ONLY by the creator-scoped admin
// readers. This is the regression guard against a future leader / over-shepherd
// / staff_viewer / super_admin reader, or an SC.2 / SC.3 aggregate, ever
// pulling these rows onto a non-creator surface.

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SCAN_DIRS = ["app", "lib", "components", "types"];
const TABLES = ["shepherd_care_private_notes", "shepherd_care_note_key_slots"];

// The ONLY runtime source allowed to name these tables:
//  - the creator-scoped read models (the single PostgREST read entrypoint), and
//  - the hand-rolled Database types.
const ALLOWLIST = new Set(["lib/supabase/read-models.ts", "types/database.ts"]);

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
      if (entry === "__tests__" || entry === "node_modules" || entry === ".next") continue;
      walk(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

const sourceFiles = SCAN_DIRS.flatMap((d) => walk(`${REPO_ROOT}${d}`, []));
const rel = (abs: string) => abs.slice(REPO_ROOT.length).replace(/\\/g, "/");

describe("SC.4 no-leak — private-note tables are referenced only by the creator readers", () => {
  it("scans a non-trivial number of source files (sanity)", () => {
    expect(sourceFiles.length).toBeGreaterThan(50);
  });

  it("no runtime source outside the allowlist names either private-note table", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const relPath = rel(file);
      if (ALLOWLIST.has(relPath)) continue;
      const content = readFileSync(file, "utf8");
      if (TABLES.some((t) => content.includes(t))) offenders.push(relPath);
    }
    expect(offenders, `unexpected references to SC.4 tables in: ${offenders.join(", ")}`).toEqual([]);
  });

  it("the only PostgREST .from() reads of the tables live in read-models.ts", () => {
    const fromOffenders: string[] = [];
    for (const file of sourceFiles) {
      const relPath = rel(file);
      if (relPath === "lib/supabase/read-models.ts") continue;
      const content = readFileSync(file, "utf8");
      for (const t of TABLES) {
        if (content.includes(`.from("${t}")`) || content.includes(`.from('${t}')`)) {
          fromOffenders.push(`${relPath} -> ${t}`);
        }
      }
    }
    expect(fromOffenders, `unexpected .from() reads: ${fromOffenders.join(", ")}`).toEqual([]);
  });

  it("read-models.ts reads the tables only through the creator-scoped functions", () => {
    const readModels = readFileSync(`${REPO_ROOT}lib/supabase/read-models.ts`, "utf8");
    // Every read filters on the creator (belt-and-braces with RLS).
    expect(readModels).toContain("fetchShepherdCarePrivateNoteCiphertextForCreator");
    expect(readModels).toContain("fetchPrivateNoteKeySlotsForCreator");
    for (const t of TABLES) {
      // Each .from(table) read is immediately scoped by created_by_profile_id.
      const idx = readModels.indexOf(`.from("${t}")`);
      expect(idx, `read-models must read ${t}`).toBeGreaterThan(-1);
      const window = readModels.slice(idx, idx + 400);
      expect(window).toContain("created_by_profile_id");
    }
  });
});
