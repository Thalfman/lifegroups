import { describe, expect, it } from "vitest";

import { COMMON_RPC_ERROR_MESSAGES } from "@/lib/shared/rpc-errors";
import { RPC_ERROR_MESSAGES as ADMIN_MESSAGES } from "@/lib/admin/action-result";
import { RPC_ERROR_MESSAGES as LEADER_MESSAGES } from "@/lib/leader/action-result";
import { readSourceFiles } from "./support/source-globber";
import { effectiveFunctions } from "./support/sql-functions";

// Admin↔leader RPC error-token parity (issue #818, audit finding TEST-5
// item 3). The intent documented in lib/shared/rpc-errors.ts: tokens whose
// user-facing copy is shared live ONCE in COMMON_RPC_ERROR_MESSAGES so a token
// added for one surface can't silently degrade to the generic fallback on
// another; each surface then overrides only where the copy legitimately
// differs. This check pins both halves of that contract:
//
//   1. Neither surface may fork or drop a COMMON token's copy.
//   2. A token spelled identically in BOTH surface bodies must be hoisted to
//      COMMON (byte-identical duplication is drift waiting to happen).
//   3. Every token a net-effective `admin_*` / `leader_*` SQL function raises
//      is mapped by that surface's table (or documented in the exemption
//      ledger) — so a new RPC token can't ship falling through to the
//      generic fallback.
//   4. A token raised by BOTH families must be mapped by BOTH surfaces.

const COMMON_TOKENS = Object.keys(COMMON_RPC_ERROR_MESSAGES);

describe("fitness: admin↔leader RPC error-token parity", () => {
  it("both surfaces carry every COMMON token with unmodified copy", () => {
    const offenders: string[] = [];
    for (const [surface, map] of [
      ["admin", ADMIN_MESSAGES],
      ["leader", LEADER_MESSAGES],
    ] as const) {
      for (const token of COMMON_TOKENS) {
        if (map[token] !== COMMON_RPC_ERROR_MESSAGES[token]) {
          offenders.push(`  ${surface}: ${token}`);
        }
      }
    }
    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `These surface maps dropped or overrode a COMMON_RPC_ERROR_MESSAGES ` +
            `token. Shared copy is edited in lib/shared/rpc-errors.ts; a ` +
            `surface override is only for copy that legitimately differs — ` +
            `remove the fork:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("tokens with byte-identical copy in both surfaces are hoisted to COMMON", () => {
    const offenders = Object.keys(ADMIN_MESSAGES)
      .filter((token) => !(token in COMMON_RPC_ERROR_MESSAGES))
      .filter(
        (token) =>
          token in LEADER_MESSAGES &&
          ADMIN_MESSAGES[token] === LEADER_MESSAGES[token]
      );
    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `These tokens repeat the SAME copy in both the admin and leader ` +
            `maps. Hoist them into COMMON_RPC_ERROR_MESSAGES ` +
            `(lib/shared/rpc-errors.ts) so the copy can't drift:\n${offenders
              .map((t) => `  ${t}`)
              .join("\n")}`
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// SQL side: which tokens do the RPC families actually raise? Fold the
// migrations to the net-effective function set (same machinery as the
// audit-pairing check), then extract `raise exception 'token'` literals.
// Only bare snake_case literals count — a prose message with spaces is not a
// token and falls through to each surface's generic fallback by design.
// The fold models dynamic enumerate-and-drop DO blocks too (see
// DropFunctionsByNameStatement), so an RPC retired that way doesn't force
// copy for tokens only its dead body raises.
// ---------------------------------------------------------------------------

const MIGRATIONS = readSourceFiles({
  roots: ["supabase/migrations"],
  extensions: [".sql"],
});

const FUNCTIONS = effectiveFunctions(MIGRATIONS);

function raisedTokens(namePrefix: string): Map<string, string[]> {
  const tokens = new Map<string, string[]>();
  for (const fn of FUNCTIONS) {
    if (!fn.name.startsWith(namePrefix)) continue;
    const re = /raise\s+exception\s+'([a-z0-9_]+)'/gi;
    for (let m = re.exec(fn.body); m; m = re.exec(fn.body)) {
      const token = m[1].toLowerCase();
      const sites = tokens.get(token) ?? [];
      sites.push(fn.name);
      tokens.set(token, sites);
    }
  }
  return tokens;
}

const ADMIN_RAISED = raisedTokens("public.admin_");
const LEADER_RAISED = raisedTokens("public.leader_");

// Tokens a family raises that are deliberately NOT in its surface map, each
// with the reason. Keep this short; adding here is a reviewable decision.
const EXEMPT_TOKENS: Readonly<Record<string, string>> = {};

describe("fitness: every raised RPC token is mapped (or documented exempt)", () => {
  it("found a representative set of RPC functions to scan", () => {
    // Guard against a parser/glob regression silently scanning nothing.
    expect(ADMIN_RAISED.size).toBeGreaterThan(10);
    expect(LEADER_RAISED.size).toBeGreaterThan(3);
  });

  it("admin_* raised tokens are mapped by the admin surface", () => {
    const offenders = [...ADMIN_RAISED.keys()]
      .filter((t) => !(t in ADMIN_MESSAGES) && !(t in EXEMPT_TOKENS))
      .sort()
      .map(
        (t) =>
          `  ${t} (raised by ${[...new Set(ADMIN_RAISED.get(t))].join(", ")})`
      );
    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `admin_* RPCs raise these tokens but lib/admin/action-result.ts has ` +
            `no copy for them — they'd degrade to the generic fallback. Map ` +
            `them, or add a reasoned EXEMPT_TOKENS entry:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("leader_* raised tokens are mapped by the leader surface", () => {
    const offenders = [...LEADER_RAISED.keys()]
      .filter((t) => !(t in LEADER_MESSAGES) && !(t in EXEMPT_TOKENS))
      .sort()
      .map(
        (t) =>
          `  ${t} (raised by ${[...new Set(LEADER_RAISED.get(t))].join(", ")})`
      );
    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `leader_* RPCs raise these tokens but lib/leader/action-result.ts ` +
            `has no copy for them — they'd degrade to the generic fallback. ` +
            `Map them, or add a reasoned EXEMPT_TOKENS entry:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("tokens raised by BOTH families are mapped by BOTH surfaces", () => {
    const offenders = [...ADMIN_RAISED.keys()]
      .filter((t) => LEADER_RAISED.has(t))
      .filter((t) => !(t in ADMIN_MESSAGES) || !(t in LEADER_MESSAGES))
      .sort();
    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `These tokens are raised by both the admin_* and leader_* families ` +
            `but are missing from one surface's map — exactly the ` +
            `silent-fallback drift COMMON_RPC_ERROR_MESSAGES exists to ` +
            `prevent:\n${offenders.map((t) => `  ${t}`).join("\n")}`
    ).toEqual([]);
  });

  it("the EXEMPT_TOKENS ledger has no stale entries", () => {
    const stale = Object.keys(EXEMPT_TOKENS).filter(
      (t) =>
        (!ADMIN_RAISED.has(t) && !LEADER_RAISED.has(t)) ||
        (t in ADMIN_MESSAGES && t in LEADER_MESSAGES)
    );
    expect(
      stale,
      stale.length === 0
        ? ""
        : `EXEMPT_TOKENS entries are no longer raised (or are now mapped ` +
            `everywhere); remove them:\n${stale.map((s) => `  ${s}`).join("\n")}`
    ).toEqual([]);
  });
});
