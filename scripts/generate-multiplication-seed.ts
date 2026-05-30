// Julian #144: regenerate supabase/seed/multiplication_seed.sql from the
// source-of-truth module (lib/admin/multiplication-seed.ts). The seed file is
// generated, never hand-edited; a drift guard test keeps them in sync.
//
//   npx tsx scripts/generate-multiplication-seed.ts

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderMultiplicationSeedFile } from "../lib/admin/multiplication-seed";

const OUT_PATH = fileURLToPath(
  new URL("../supabase/seed/multiplication_seed.sql", import.meta.url),
);

writeFileSync(OUT_PATH, renderMultiplicationSeedFile(), "utf8");
console.log(`Wrote ${OUT_PATH}`);
