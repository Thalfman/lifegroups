import { describe, expect, it } from "vitest";

import {
  listMigrations,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";
import {
  canTransition,
  PROSPECT_STATE_ORDER,
  stateIsArchived,
  stateRequiresGroup,
} from "@/lib/admin/prospect-funnel";
import type { ProspectState } from "@/types/enums";

// All four Prospect states, via the funnel module's own display-order list
// (types/enums exports only the union type, not a value list).
const PROSPECT_STATES: readonly ProspectState[] = PROSPECT_STATE_ORDER;

// Contract pin between the two homes of the Interest Funnel's legality rules:
// the pure core (lib/admin/prospect-funnel.ts, the UI/validation layer) and
// the SQL inside admin_transition_prospect (the authoritative gate). Both
// files claim to mirror each other in comments; nothing enforced it. CI has
// no Postgres, so — like the other migration suites — this derives the SQL's
// transition table from the latest migration text and walks every
// (from, to) pair against the pure core. A future migration that changes one
// side without the other fails here.

function latestTransitionMigration(): MigrationSql {
  const candidates = listMigrations()
    .map((name) => loadMigration(name))
    .filter((m) =>
      m.lower.includes(
        "create or replace function public.admin_transition_prospect"
      )
    );
  expect(candidates.length).toBeGreaterThan(0);
  // Timestamp-prefixed names sort in apply order; the last definition wins.
  return candidates[candidates.length - 1];
}

const sql = latestTransitionMigration();

// Parse the `v_legal := case v_from ... end;` block into a transition table.
// `when 'joined' then false` (no legal edges) parses to an empty list.
function parseSqlLegalEdges(): Record<ProspectState, ProspectState[]> {
  const caseBlock = sql.lower.match(
    /v_legal := case v_from([\s\S]*?)end;/
  )?.[1];
  expect(caseBlock, "v_legal case block not found").toBeTruthy();

  const edges = {} as Record<ProspectState, ProspectState[]>;
  for (const state of PROSPECT_STATES) {
    const arm = caseBlock!.match(
      new RegExp(`when '${state}'\\s+then ([^\\n]+)`)
    )?.[1];
    expect(arm, `case arm for '${state}' not found`).toBeTruthy();
    const list = arm!.match(/p_state in \(([^)]*)\)/)?.[1];
    edges[state] = list
      ? (list.match(/'([a-z_]+)'/g) ?? []).map(
          (q) => q.slice(1, -1) as ProspectState
        )
      : [];
    if (!list) {
      // An arm without an IN-list must be a literal `false` (terminal state).
      expect(arm!.trim().startsWith("false")).toBe(true);
    }
  }
  return edges;
}

describe("Interest Funnel — pure core ↔ admin_transition_prospect SQL", () => {
  it("agrees on every (from, to) legality verdict", () => {
    const sqlEdges = parseSqlLegalEdges();
    for (const from of PROSPECT_STATES) {
      for (const to of PROSPECT_STATES) {
        // The SQL case arm lists never include the self edge, and the pure
        // core rejects no-ops, so both sides resolve from === to as illegal.
        const sqlLegal = from !== to && sqlEdges[from].includes(to);
        expect(
          canTransition(from, to),
          `pure core and SQL disagree on ${from} → ${to}`
        ).toBe(sqlLegal);
      }
    }
  });

  it("agrees on which states require a group", () => {
    const guard = sql.lower.match(
      /if p_state in \(([^)]*)\) and v_grp is null/
    )?.[1];
    expect(guard, "group-required guard not found").toBeTruthy();
    const sqlGroupRequired = new Set(
      (guard!.match(/'([a-z_]+)'/g) ?? []).map((q) => q.slice(1, -1))
    );
    for (const state of PROSPECT_STATES) {
      expect(
        stateRequiresGroup(state),
        `group-required mismatch for ${state}`
      ).toBe(sqlGroupRequired.has(state));
    }
  });

  it("agrees on which states archive the Prospect", () => {
    const archived = sql.lower.match(
      /v_archived := \(p_state = '([a-z_]+)'\);/
    )?.[1];
    expect(archived, "archive assignment not found").toBeTruthy();
    for (const state of PROSPECT_STATES) {
      expect(stateIsArchived(state), `archive mismatch for ${state}`).toBe(
        state === archived
      );
    }
  });

  it("raises the error tokens the pure core's TransitionError mirrors", () => {
    // The pure core maps these three; the SQL may add gate-only tokens
    // (insufficient_privilege, prospect_archived, group_closed) on top.
    for (const token of [
      "illegal_transition",
      "group_required",
      "missing_prospect",
    ]) {
      expect(sql.lower).toContain(`raise exception '${token}'`);
    }
  });
});
