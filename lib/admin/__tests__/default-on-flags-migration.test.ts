import { describe, expect, it } from "vitest";

import { loadMigration, type MigrationSql } from "./migration-safety";

// ADR 0024 — the default-ON seed migration: leader_surface.enabled plus the
// nav_show_groups / nav_show_people nav-visibility flags. These static checks
// pin the two load-bearing properties: (1) the per-flag deep-merge nesting
// (the 20260608040000 shape) so leader_surface.verified — the
// verify-before-flip marker resolveFlag() requires — can never be clobbered
// by the seed; (2) the paired audit row (platform-config / security-flag
// mutations are audit-critical, even from a migration).

const sql: MigrationSql = loadMigration(
  "20260701020000_default_on_leader_surface_and_nav.sql"
);

const SEEDED_FLAGS = [
  "leader_surface",
  "nav_show_groups",
  "nav_show_people",
] as const;

describe("default-on flags migration — deep-merge shape", () => {
  it("targets the platform_config row only", () => {
    expect(sql.lower).toContain("update public.platform_config");
    expect(sql.lower).toContain("where setting_key = 'platform_config'");
  });

  for (const flag of SEEDED_FLAGS) {
    it(`${flag}: merges enabled=true into the flag's EXISTING object`, () => {
      // The per-flag nesting: coalesce the stored flag object (never replace
      // it wholesale) and || only the enabled key — so sibling keys (verified)
      // survive. Whitespace-tolerant across the migration's line wraps.
      const pattern = new RegExp(
        `coalesce\\(\\s*setting_value -> 'feature_flags' -> '${flag}',\\s*` +
          `'\\{\\}'::jsonb\\s*\\) \\|\\| jsonb_build_object\\('enabled', true\\)`
      );
      expect(sql.raw).toMatch(pattern);
    });
  }

  it("never writes leader_surface.verified (that flip belongs to 20260608040000)", () => {
    expect(sql.lower).not.toContain("'verified'");
  });

  it("leaves nav_show_planning off", () => {
    // The header comment may explain the omission; the UPDATE itself must not
    // touch the flag.
    const update = sql.lower.slice(
      sql.lower.indexOf("update public.platform_config"),
      sql.lower.indexOf("insert into public.audit_events")
    );
    expect(update).not.toContain("nav_show_planning");
  });
});

describe("default-on flags migration — paired audit", () => {
  it("writes a system audit row naming the three flags in the same migration", () => {
    expect(sql.lower).toContain("insert into public.audit_events");
    expect(sql.lower).toContain("'system.default_on_flags'");
    for (const flag of SEEDED_FLAGS) {
      const auditBlock = sql.lower.slice(
        sql.lower.indexOf("insert into public.audit_events")
      );
      expect(auditBlock).toContain(`'${flag}'`);
    }
  });
});
