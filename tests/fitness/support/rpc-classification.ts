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

// Static DML against a real table. Strings are stripped before this runs so a
// table name mentioned in prose (`raise exception 'cannot update group …'`) or a
// jsonb label can't masquerade as DML.
const WRITE_DML_RE =
  /\b(?:insert\s+into|update|delete\s+from)\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi;

// Dynamic DML built with `format()` identifier injection — `delete from
// public.%I`, `insert into %I`, `update %I set …`. The table name lives INSIDE
// the format string, so string-stripping erases it; this pattern runs on the
// (string-bearing) body and keys on the `%I`/`%s` placeholder right after the
// DML target, which is high-signal (prose doesn't write `delete from %I`).
// Fully arbitrary dynamic SQL (`'delete from ' || quote_ident(t)`) is not
// modelled — the repo builds dynamic DML via `format(… %I …)`.
const DYNAMIC_DML_RE =
  /\b(?:insert\s+into|update|delete\s+from)\s+(?:public\.)?%[is]\b/i;

/**
 * True when the body performs DML on a real (non-audit, non-temp) table, whether
 * static or built via `format(… %I …)`. `audit_events` is excluded as a target
 * on purpose: an audit insert is the pairing we're checking FOR, not itself a
 * business write — so a function whose only DML is the audit row is not
 * classified a write (none exist today, but the rule is the correct one).
 */
export function isWrite(body: string): boolean {
  if (DYNAMIC_DML_RE.test(body)) return true;
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

export interface AuditExemption {
  /** Why this write legitimately does not insert its own audit_events row. */
  readonly reason: string;
  /**
   * When true, this is an internal helper whose audit is the responsibility of
   * its callers. The check then enforces that EVERY definer calling it writes an
   * audit_events row — so the guarantee is actually verified, not just asserted
   * in prose. When false/absent, the write is terminally unaudited by design.
   */
  readonly delegatesToCallers?: boolean;
  /**
   * When true, the exemption is only valid while NO app login role can EXECUTE
   * this function (the reason cites a revoked grant). The check then asserts the
   * helper is not `appExecutable` — so a later migration that grants it to
   * `authenticated`/`anon`/`public` (exposing an unaudited write to app code)
   * fails the build instead of silently relying on the prose premise.
   */
  readonly requiresNoAppGrant?: boolean;
}

/**
 * WRITE-classified definers that legitimately do NOT write `audit_events`. Each
 * entry is a deliberate, reviewed exemption — keep the reason current. Keys use
 * the parser's normalized signature form (`schema.name(type,type)`, lowercased).
 */
export const AUDIT_EXEMPT_WRITES: ReadonlyMap<string, AuditExemption> = new Map(
  [
    [
      "public.log_usage_event(text,text)",
      {
        reason:
          "Telemetry by design (Phase USAGE.1): high-frequency, coarse usage " +
          "events in usage_events. Auditing every call would flood the audit " +
          "spine with non-accountability noise; usage tracking is opt-in " +
          "analytics, not a domain mutation.",
      },
    ],
    [
      "public.check_invite_redeem_rate(text,integer,integer)",
      {
        reason:
          "Rate-limit bookkeeping (Phase IL.2): service-role-only sliding-window " +
          "throttle rows in invite_redeem_throttle. This is mechanism state, not " +
          "a domain write; the invite redemption it guards is itself audited by " +
          "the redeem RPC.",
      },
    ],
    [
      "public.super_admin_clean_slate_restore_payload(jsonb)",
      {
        reason:
          "Internal shared restore body (PRD-SAC6 #293/#294) with NO execute " +
          "grant — revoked from public/anon/authenticated and granted to none. It " +
          "performs the FK-safe re-insert only; the two SECURITY DEFINER callers " +
          "that own the super-admin gate and advisory lock " +
          "(super_admin_clean_slate_revert / super_admin_clean_slate_import) each " +
          "write the paired audit_events row in the same transaction.",
        delegatesToCallers: true,
        requiresNoAppGrant: true,
      },
    ],
  ]
);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Does `body` call the function named `baseName` (schema-qualified or not)? */
function bodyCalls(body: string, baseName: string): boolean {
  return new RegExp(
    `\\b(?:public\\.)?${escapeRegExp(baseName)}\\s*\\(`,
    "i"
  ).test(stripSqlStrings(body));
}

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
  /** For each `delegatesToCallers` exemption, the definer signatures that call it. */
  readonly delegationCallers: ReadonlyMap<string, readonly string[]>;
  /**
   * Violations of a delegated exemption: a caller drives the exempt helper's
   * write but inserts no audit_events of its own. `{ helper, caller }` signatures.
   */
  readonly delegationViolations: readonly { helper: string; caller: string }[];
  /**
   * Signatures of WRITE wrappers pulled in by the call closure — definers with no
   * direct DML that mutate only by calling other write RPCs (e.g.
   * `super_admin_reset_all`). They are held to the same self-audit rule as direct
   * writes; surfaced for the PR summary.
   */
  readonly wrapperWrites: readonly string[];
  /**
   * `requiresNoAppGrant` exemptions whose helper is, in the effective grant state,
   * EXECUTE-able by an app login role — the "no grant" premise has been broken, so
   * the exemption no longer holds. Empty means every such premise is intact.
   */
  readonly appExposedExemptHelpers: readonly string[];
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

  // Direct category from each body's own DML.
  const direct = new Map(definers.map((f) => [f.signature, categorize(f)]));
  const baseNameOf = (f: EffectiveFunction) =>
    f.name.split(".").pop() ?? f.name;

  // Write closure: a non-trigger definer that CALLS a write RPC is itself a write
  // (a mutating wrapper). Without this, a wrapper whose only mutation is via calls
  // to other write RPCs — e.g. `super_admin_reset_all`, which composes
  // `super_admin_launch_prep` / `_reset_care_attention` / `_reset_health_attention`
  // and has no direct DML — would be READ_HELPER and could silently drop its own
  // audit_events row. Iterated to a fixpoint so wrappers-of-wrappers are caught.
  const writeSigs = new Set(
    [...direct].filter(([, c]) => c === "write").map(([sig]) => sig)
  );
  const wrapperWrites: string[] = [];
  for (let changed = true; changed; ) {
    changed = false;
    for (const fn of definers) {
      if (direct.get(fn.signature) === "trigger") continue;
      if (writeSigs.has(fn.signature)) continue;
      for (const calleeSig of writeSigs) {
        const callee = definers.find((d) => d.signature === calleeSig);
        if (!callee || callee.signature === fn.signature) continue;
        if (bodyCalls(fn.body, baseNameOf(callee))) {
          writeSigs.add(fn.signature);
          wrapperWrites.push(fn.signature);
          changed = true;
          break;
        }
      }
    }
  }

  for (const fn of definers) {
    if (direct.get(fn.signature) === "trigger") {
      triggers.push(fn);
      continue;
    }
    if (!writeSigs.has(fn.signature)) {
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

  // For each exemption that delegates audit to its callers, enforce that every
  // definer calling the helper actually writes an audit_events row — otherwise
  // the exemption would silently drop the import/revert audit guarantee.
  const bySig = new Map(definers.map((f) => [f.signature, f]));
  const delegationCallers = new Map<string, readonly string[]>();
  const delegationViolations: { helper: string; caller: string }[] = [];
  const appExposedExemptHelpers: string[] = [];
  for (const [sig, exemption] of AUDIT_EXEMPT_WRITES) {
    const helper = bySig.get(sig);
    // A `requiresNoAppGrant` exemption is only valid while no app role can call
    // the helper. If a later migration re-exposes it, the unaudited write is now
    // reachable from app code — fail rather than trust the prose premise.
    if (exemption.requiresNoAppGrant && helper && helper.appExecutable) {
      appExposedExemptHelpers.push(sig);
    }
    if (!exemption.delegatesToCallers) continue;
    if (!helper) continue; // a stale exemption — caught by the honesty test
    const baseName = helper.name.split(".").pop() ?? helper.name;
    const callers = definers.filter(
      (d) => d.signature !== sig && bodyCalls(d.body, baseName)
    );
    delegationCallers.set(
      sig,
      callers.map((c) => c.signature)
    );
    for (const caller of callers) {
      if (!writesAudit(caller.body)) {
        delegationViolations.push({ helper: sig, caller: caller.signature });
      }
    }
  }

  return {
    writes,
    reads,
    triggers,
    unaudited,
    exemptedUsed,
    delegationCallers,
    delegationViolations,
    wrapperWrites,
    appExposedExemptHelpers,
  };
}

/**
 * Non-definer functions that perform DML and are reachable by an app login role —
 * a bypass of the "all app writes go through a narrow audited SECURITY DEFINER
 * RPC" invariant. A `SECURITY INVOKER` (or default) function that mutates a table
 * and is granted to `authenticated`/`anon`/`public` can be called via `.rpc()`
 * and runs under the caller's own privileges, skipping the audited definer layer.
 * Triggers are excluded — they are not directly callable. Pass ALL effective
 * functions (definers and non-definers), not the definer-filtered subset.
 */
export function nonDefinerAppWrites(
  all: readonly EffectiveFunction[]
): EffectiveFunction[] {
  return all.filter(
    (f) =>
      !f.isSecurityDefiner &&
      !f.returnsTrigger &&
      f.appExecutable &&
      isWrite(f.body)
  );
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
