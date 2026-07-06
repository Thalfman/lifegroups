import { describe, expect, it } from "vitest";

import { readSourceFiles, stripComments } from "./support/source-globber";
import { stripFiles, TEST_FILE_EXCLUDES } from "./support/scan";

// P0 invariant: every app-driven write follows the fixed pipeline (validate →
// guard → RPC → revalidate → log) via the shared Write Action Runner (ADR
// 0001/0005). In practice that means each server-action module routes through a
// run-action adapter (`lib/admin`, `lib/leader`, or the shared
// `lib/shared/run-action`).
//
// A handful of action modules legitimately do NOT use the runner — auth flows
// (Supabase Auth, not table writes), Edge-Function invokers (the approved
// service-role seam), and self-service narrow-RPC calls. Each is listed below
// with its reason, so a NEW action module that bypasses the runner without a
// conscious exemption fails this check.

// Scan comment-stripped source so a leftover `// TODO: use runAdminWriteAction`
// comment can't satisfy the check. String contents are kept so the import-path
// literal survives.
const ACTION_FILES = stripFiles(
  readSourceFiles({
    roots: ["app"],
    extensions: [".ts"],
    exclude: [...TEST_FILE_EXCLUDES],
  }).filter((f) => /(^|\/)(actions|[a-z-]+-actions)\.ts$/.test(f.relPath)),
  stripComments
);

// Require a REAL import from an approved run-action module — not merely the
// presence of a runner symbol, which a local same-named symbol could spoof.
const ADAPTER_IMPORT =
  /from\s+["']@\/lib\/(admin|leader|shared)\/run-action["']/;

// Action modules exempt from the runner, each with a documented reason. Keep
// this list short and justified; adding to it is a reviewable decision.
const EXEMPT: Readonly<Record<string, string>> = {
  // Supabase Auth flows (sign-in/out, password recovery) — no table writes.
  "app/login/actions.ts":
    "Supabase Auth sign-in + usage RPC, not a table write",
  "app/forgot-password/actions.ts": "Supabase Auth password-recovery flow",
  "app/reset-password/actions.ts":
    "Supabase Auth updateUser flow (two sequential commits — see ADR 0035)",
  "app/(protected)/actions.ts": "logout (Supabase Auth signOut only)",
  // Self-service narrow SECURITY DEFINER RPC call (own orientation flag).
  "app/(protected)/orientation-actions.ts":
    "self-service orientation-seen narrow RPC",
  // Edge-Function invokers — the approved service-role seam lives in the Edge
  // Function, not the runner (deliberate boundary — see ADR 0035).
  "app/invite/[token]/actions.ts": "redeem-invite Edge Function invoke",
  "app/(protected)/admin/super-admin/invite-user-actions.ts":
    "invite-user Edge Function invoke",
  "app/(protected)/admin/super-admin/test-accounts-actions.ts":
    "manage-test-auth-users Edge Function invoke",
};

describe("fitness: server actions route through the run-action adapter", () => {
  it("found a representative set of action modules to scan", () => {
    // Guard against a glob/path regression silently scanning nothing.
    expect(ACTION_FILES.length).toBeGreaterThan(20);
  });

  it("every app/**/actions.ts uses the runner or is documented-exempt", () => {
    const offenders = ACTION_FILES.filter(
      (f) => !ADAPTER_IMPORT.test(f.text) && !(f.relPath in EXEMPT)
    ).map((f) => f.relPath);

    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `These action modules neither use a run-action adapter nor appear in ` +
            `the documented EXEMPT list. Route them through the runner, or add a ` +
            `justified exemption:\n${offenders.map((o) => `  ${o}`).join("\n")}`
    ).toEqual([]);
  });

  it("the EXEMPT list has no stale entries", () => {
    const present = new Set(ACTION_FILES.map((f) => f.relPath));
    const stale = Object.keys(EXEMPT).filter((p) => !present.has(p));
    expect(
      stale,
      stale.length === 0
        ? ""
        : `EXEMPT lists files that no longer exist; remove them:\n${stale
            .map((s) => `  ${s}`)
            .join("\n")}`
    ).toEqual([]);
  });
});
