import { runSql } from "./sql";

// Fixture-provisioning grants for the RLS / action-pipeline harness (issue #707).
//
// WHY THIS EXISTS
//   The harness seeds its four-tier fixture set by writing the operational tables
//   DIRECTLY through the service-role PostgREST client (support/fixtures.ts) —
//   setup, not assertion. But this repo's narrow-grants posture (5A.2 hardening)
//   deliberately withholds table-level INSERT/UPDATE/DELETE from `service_role`:
//   in PRODUCTION every write flows through a `SECURITY DEFINER` RPC, so even the
//   service role cannot write these tables directly. Against that posture the
//   fixture seed fails at the very first insert with
//   `permission denied for table profiles`.
//
// WHY IT IS SAFE
//   These grants are applied ONLY to the disposable LOCAL CLI stack, over the
//   same superuser connection the harness already uses to install its test-only
//   rollback trigger (`runSql`, which HARD-REFUSES any non-local host). They are
//   NOT a migration and never reach a deployed database — production keeps its
//   narrow grants. `service_role` already bypasses RLS (BYPASSRLS), so restoring
//   these table privileges on the local stack only affects the SETUP path; every
//   visibility/atomicity assertion still runs through the per-tier authenticated
//   clients under real RLS, so nothing is masked.
//
// SCOPE
//   Exactly the tables the service client reads or writes during provisioning,
//   teardown, and the action-pipeline verification reads — kept explicit (rather
//   than schema-wide) so the harness's direct-write surface stays auditable.

const FIXTURE_TABLES = [
  "profiles",
  "over_shepherds",
  "shepherd_coverage_assignments",
  "shepherd_care_profiles",
  "note_transparency_grants",
  "care_notes",
  "prayer_requests",
  "shepherd_care_private_notes",
  "shepherd_care_note_key_slots",
  "audit_events",
] as const;

/**
 * Grant `service_role` the table privileges the fixtures need on the LOCAL stack.
 * Idempotent (GRANTs are additive) and safe to call before every provision. No-op
 * against anything but a loopback Postgres — `runSql` refuses a non-local host.
 */
export async function grantFixtureProvisioning(): Promise<void> {
  const tableGrants = FIXTURE_TABLES.map(
    (t) =>
      `grant select, insert, update, delete on public.${t} to service_role;`
  ).join("\n");
  await runSql(
    `grant usage on schema public to service_role;\n` +
      `${tableGrants}\n` +
      // Identity/serial columns (if any) need sequence access for inserts.
      `grant usage, select on all sequences in schema public to service_role;`
  );
}
