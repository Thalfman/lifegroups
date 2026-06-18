// Write-vs-read classification for the audit-pairing catalog check (issue #700).
//
// The security invariant (CLAUDE.md, AGENTS.md P0): every mutation writes a
// paired `audit_events` row in the SAME transaction. The transactional/rollback
// half of that guarantee is proven by tests/integration/action-pipeline.test.ts.
// This module supplies the STATIC half: classify every `SECURITY DEFINER`
// function and assert each WRITE self-audits.
//
// Classification is derived from the (comment-stripped) function body, not a
// hand-maintained list of 100+ names, so it stays correct as RPCs are added. The
// partition is exhaustive — every definer lands in exactly one of WRITE /
// READ_HELPER / TRIGGER (no silent skips) — and conservative: anything that does
// DML on a real table and isn't a trigger is a WRITE that must self-audit, unless
// it appears in the explicit, justified `AUDIT_EXEMPT_WRITES` map below.

import type { EffectiveFunction } from "./sql-functions";
import { stripSqlStrings, writesAudit } from "./scan";

export type RpcCategory = "write" | "read_helper" | "trigger";

// DML against a real table. Strings are stripped before this runs, so dynamic
// SQL built into a `'delete from …'` literal (and any string mentioning a table)
// does not count — those functions self-audit with a literal `audit_events`
// insert anyway, which is what the check actually asserts.
const WRITE_DML_RE =
  /\b(?:insert\s+into|update|delete\s+from)\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi;

/**
 * True when the body performs DML on a real (non-audit, non-temp) table.
 * `audit_events` is excluded as a target on purpose: an audit insert is the
 * pairing we're checking FOR, not itself a business write — so a function whose
 * only DML is the audit row is not classified a write (none exist today, but the
 * rule is the correct, conservative one).
 */
export function isWrite(body: string): boolean {
  const text = stripSqlStrings(body);
  WRITE_DML_RE.lastIndex = 0;
  for (let m = WRITE_DML_RE.exec(text); m; m = WRITE_DML_RE.exec(text)) {
    const table = m[1].toLowerCase();
    if (table === "audit_events") continue;
    if (table.startsWith("pg_temp")) continue;
    return true;
  }
  return false;
}

/** Assign exactly one category to a SECURITY DEFINER function. */
export function categorize(fn: EffectiveFunction): RpcCategory {
  if (fn.returnsTrigger) return "trigger";
  return isWrite(fn.body) ? "write" : "read_helper";
}

/**
 * WRITE-classified definers that legitimately do NOT write `audit_events`. Each
 * entry is a deliberate, reviewed exemption — keep the reason current. Keys use
 * the parser's normalized signature form (`schema.name(type,type)`, lowercased).
 */
export const AUDIT_EXEMPT_WRITES: ReadonlyMap<string, string> = new Map([
  [
    "public.log_usage_event(text,text)",
    "Telemetry by design (Phase USAGE.1): high-frequency, coarse usage events in " +
      "usage_events. Auditing every call would flood the audit spine with " +
      "non-accountability noise; usage tracking is opt-in analytics, not a " +
      "domain mutation.",
  ],
  [
    "public.check_invite_redeem_rate(text,integer,integer)",
    "Rate-limit bookkeeping (Phase IL.2): service-role-only sliding-window " +
      "throttle rows in invite_redeem_throttle. This is mechanism state, not a " +
      "domain write; the invite redemption it guards is itself audited by the " +
      "redeem RPC.",
  ],
  [
    "public.super_admin_clean_slate_restore_payload(jsonb)",
    "Internal shared restore body (PRD-SAC6 #293/#294) with NO execute grant — " +
      "revoked from public/anon/authenticated and granted to none. It performs " +
      "the FK-safe re-insert only; the two SECURITY DEFINER callers that own the " +
      "super-admin gate and advisory lock " +
      "(super_admin_clean_slate_revert / super_admin_clean_slate_import) each " +
      "write the paired audit_events row in the same transaction.",
  ],
]);

export interface ClassificationResult {
  /** WRITE-classified definers (not triggers, perform real-table DML). */
  readonly writes: readonly EffectiveFunction[];
  /** READ_HELPER definers (no DML). */
  readonly reads: readonly EffectiveFunction[];
  /** TRIGGER definers (`returns trigger` / `event_trigger`). */
  readonly triggers: readonly EffectiveFunction[];
  /** Violations: WRITE && no audit insert && not in AUDIT_EXEMPT_WRITES. */
  readonly unaudited: readonly EffectiveFunction[];
  /** Exemption signatures that actually matched a write lacking an audit insert. */
  readonly exemptedUsed: ReadonlySet<string>;
}

/**
 * Partition the SECURITY DEFINER functions and surface audit-pairing violations.
 * Callers pass `effectiveFunctions(...).filter((f) => f.isSecurityDefiner)`.
 */
export function classifyDefiners(
  definers: readonly EffectiveFunction[]
): ClassificationResult {
  const writes: EffectiveFunction[] = [];
  const reads: EffectiveFunction[] = [];
  const triggers: EffectiveFunction[] = [];
  const unaudited: EffectiveFunction[] = [];
  const exemptedUsed = new Set<string>();

  for (const fn of definers) {
    const category = categorize(fn);
    if (category === "trigger") {
      triggers.push(fn);
      continue;
    }
    if (category === "read_helper") {
      reads.push(fn);
      continue;
    }
    writes.push(fn);
    if (writesAudit(fn.body)) continue;
    if (AUDIT_EXEMPT_WRITES.has(fn.signature)) {
      exemptedUsed.add(fn.signature);
      continue;
    }
    unaudited.push(fn);
  }

  return { writes, reads, triggers, unaudited, exemptedUsed };
}

/** Human-readable counts + per-bucket names, for the PR summary. */
export function summary(result: ClassificationResult): {
  counts: { writes: number; reads: number; triggers: number; exempted: number };
  exempted: string[];
} {
  return {
    counts: {
      writes: result.writes.length,
      reads: result.reads.length,
      triggers: result.triggers.length,
      exempted: result.exemptedUsed.size,
    },
    exempted: [...result.exemptedUsed].sort(),
  };
}
