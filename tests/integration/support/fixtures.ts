import type { SupabaseClient } from "@supabase/supabase-js";

import { makeServiceClient, signInTier } from "./clients";
import type { IntegrationEnv } from "./env";

// Fixture provisioning for the RLS / action-pipeline harness (issue #607).
//
// Builds one Auth user per oversight tier — Super Admin ▸ Ministry Admin ▸
// Over-Shepherd ▸ Leader — plus the relational scaffolding the visibility
// exceptions need: an over_shepherds roster row bridged to the OS profile by
// email, a coverage assignment covering the subject Leader, and a
// shepherd_care_profiles row for the Leader (the SC.4 private-note anchor).
//
// All provisioning runs through the SERVICE client, which bypasses RLS. That is
// the only legitimate use of the service-role key here — setup, not assertion.
// Every visibility/write assertion runs through a per-tier authenticated client
// (`tier.client`) that is subject to real RLS.
//
// Fixtures are namespaced by a unique run id so they never collide with the
// `seed:test-auth` users or a prior run, and the whole set is removable by that
// id in teardown — honouring the no-hard-delete invariant for PRODUCT data
// (this is disposable LOCAL test scaffolding, not an operational workflow).

const RUN_ID = `it607-${Date.now().toString(36)}-${Math.random()
  .toString(36)
  .slice(2, 8)}`;

const PASSWORD = `Integ-${RUN_ID}-Aa1!`;

export type TierKey =
  | "super_admin"
  | "ministry_admin"
  | "over_shepherd"
  | "leader";

export interface Tier {
  readonly key: TierKey;
  readonly email: string;
  readonly profileId: string;
  readonly authUserId: string;
  /** Authenticated, RLS-subject client carrying this tier's Auth JWT. */
  readonly client: SupabaseClient;
}

export interface Fixtures {
  readonly runId: string;
  readonly superAdmin: Tier;
  readonly ministryAdmin: Tier;
  readonly overShepherd: Tier;
  /** The subject Leader the Over-Shepherd covers and the admins author notes about. */
  readonly leader: Tier;
  /** The Leader's care profile id (anchor for the SC.4 private care note). */
  readonly leaderCareProfileId: string;
  /**
   * A dedicated active leader used ONLY as the care-note subject in the
   * atomic-rollback proof (#625). Kept out of the tiered set so the forced
   * audit-insert failure keyed on this subject can never perturb the
   * success-path / visibility tests.
   */
  readonly rollbackSubjectProfileId: string;
  /**
   * An UNRELATED active leader (the rollback subject) the Over-Shepherd does NOT
   * cover, plus its care profile. The negative control for OVER_SHEPHERD_SCOPED
   * assertions: if RLS regressed from coverage-scoped to "any leader/care
   * profile is readable", the OS would read these — so the harness asserts it
   * cannot. (#702 review.)
   */
  readonly unrelatedLeaderProfileId: string;
  readonly unrelatedCareProfileId: string;
  /** Tear down everything this run created (service-client, local stack only). */
  readonly teardown: () => Promise<void>;
}

const ROLE_PLAN: ReadonlyArray<{
  key: TierKey;
  role: "super_admin" | "ministry_admin" | "over_shepherd" | "leader";
  fullName: string;
}> = [
  { key: "super_admin", role: "super_admin", fullName: "Integ Super Admin" },
  {
    key: "ministry_admin",
    role: "ministry_admin",
    fullName: "Integ Ministry Admin",
  },
  {
    key: "over_shepherd",
    role: "over_shepherd",
    fullName: "Integ Over-Shepherd",
  },
  { key: "leader", role: "leader", fullName: "Integ Leader" },
];

async function createAuthUser(
  service: SupabaseClient,
  email: string
): Promise<string> {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error)
    throw new Error(`createUser failed for ${email}: ${error.message}`);
  const id = data?.user?.id;
  if (!id) throw new Error(`createUser returned no id for ${email}`);
  return id;
}

async function insertProfile(
  service: SupabaseClient,
  authUserId: string,
  email: string,
  role: string,
  fullName: string
): Promise<string> {
  const { data, error } = await service
    .from("profiles")
    .insert({
      auth_user_id: authUserId,
      email,
      full_name: fullName,
      role,
      status: "active",
    })
    .select("id")
    .single();
  if (error)
    throw new Error(`profile insert failed for ${email}: ${error.message}`);
  return data.id as string;
}

/**
 * Provision the four-tier fixture set against the LOCAL stack and return the
 * authenticated per-tier clients plus a teardown closure. Throws on any setup
 * failure so the spec surfaces a clear cause rather than a misleading assertion.
 */
export async function provisionFixtures(
  env: IntegrationEnv
): Promise<Fixtures> {
  const service = makeServiceClient(env);

  const tiers: Partial<Record<TierKey, Tier>> = {};
  const createdAuthIds: string[] = [];
  const createdProfileIds: string[] = [];

  for (const spec of ROLE_PLAN) {
    const email = `${spec.key}.${RUN_ID}@lifegroups.local`;
    const authUserId = await createAuthUser(service, email);
    createdAuthIds.push(authUserId);
    const profileId = await insertProfile(
      service,
      authUserId,
      email,
      spec.role,
      spec.fullName
    );
    createdProfileIds.push(profileId);
    const client = await signInTier(env, email, PASSWORD);
    tiers[spec.key] = { key: spec.key, email, profileId, authUserId, client };
  }

  const leader = tiers.leader!;
  const overShepherd = tiers.over_shepherd!;

  // Bridge the Over-Shepherd profile to a roster row by email (auth_over_shepherd_id
  // matches case-insensitively on email), then cover the subject Leader.
  const { data: rosterRow, error: rosterErr } = await service
    .from("over_shepherds")
    .insert({
      full_name: "Integ Over-Shepherd Roster",
      email: overShepherd.email,
      active: true,
    })
    .select("id")
    .single();
  if (rosterErr) {
    throw new Error(`over_shepherds insert failed: ${rosterErr.message}`);
  }
  const overShepherdRosterId = rosterRow.id as string;

  const { error: coverageErr } = await service
    .from("shepherd_coverage_assignments")
    .insert({
      shepherd_profile_id: leader.profileId,
      over_shepherd_id: overShepherdRosterId,
      active: true,
    });
  if (coverageErr) {
    throw new Error(
      `shepherd_coverage_assignments insert failed: ${coverageErr.message}`
    );
  }

  // The SC.4 private care note anchors on a care profile for the Leader.
  const { data: careProfileRow, error: careProfileErr } = await service
    .from("shepherd_care_profiles")
    .insert({ shepherd_profile_id: leader.profileId })
    .select("id")
    .single();
  if (careProfileErr) {
    throw new Error(
      `shepherd_care_profiles insert failed: ${careProfileErr.message}`
    );
  }
  const leaderCareProfileId = careProfileRow.id as string;

  // A standalone active leader used only as the atomic-rollback subject (#625).
  // It needs no Auth user or client — the RPC only requires an active
  // leader/co_leader profile to reach the care_notes insert. Tracked in
  // createdProfileIds so teardown removes it in FK-safe order.
  const { data: rollbackSubjectRow, error: rollbackSubjectErr } = await service
    .from("profiles")
    .insert({
      email: `rollback-subject.${RUN_ID}@lifegroups.local`,
      full_name: "Integ Rollback Subject",
      role: "leader",
      status: "active",
    })
    .select("id")
    .single();
  if (rollbackSubjectErr) {
    throw new Error(
      `rollback-subject profile insert failed: ${rollbackSubjectErr.message}`
    );
  }
  const rollbackSubjectProfileId = rollbackSubjectRow.id as string;
  createdProfileIds.push(rollbackSubjectProfileId);

  // A care profile for that unrelated leader — the Over-Shepherd covers the
  // tiered Leader, NOT this one, so it is the negative control proving the OS's
  // coverage scoping (a regression to "read any care profile" would surface it).
  const { data: unrelatedCareRow, error: unrelatedCareErr } = await service
    .from("shepherd_care_profiles")
    .insert({ shepherd_profile_id: rollbackSubjectProfileId })
    .select("id")
    .single();
  if (unrelatedCareErr) {
    throw new Error(
      `unrelated shepherd_care_profiles insert failed: ${unrelatedCareErr.message}`
    );
  }
  const unrelatedCareProfileId = unrelatedCareRow.id as string;

  const teardown = async (): Promise<void> => {
    // Local, disposable scaffolding only. Order matters for FK restricts:
    // care/coverage rows before profiles, profiles before auth users.
    await service
      .from("note_transparency_grants")
      .delete()
      .eq("subject_profile_id", leader.profileId);
    await service
      .from("care_notes")
      .delete()
      .in("author_profile_id", createdProfileIds);
    await service
      .from("prayer_requests")
      .delete()
      .in("author_profile_id", createdProfileIds);
    await service
      .from("shepherd_care_private_notes")
      .delete()
      .eq("care_profile_id", leaderCareProfileId);
    await service
      .from("shepherd_care_note_key_slots")
      .delete()
      .in("created_by_profile_id", createdProfileIds);
    await service
      .from("shepherd_coverage_assignments")
      .delete()
      .eq("over_shepherd_id", overShepherdRosterId);
    await service
      .from("shepherd_care_profiles")
      .delete()
      .in("shepherd_profile_id", createdProfileIds);
    await service
      .from("over_shepherds")
      .delete()
      .eq("id", overShepherdRosterId);
    await service
      .from("audit_events")
      .delete()
      .in("actor_profile_id", createdProfileIds);
    await service.from("profiles").delete().in("id", createdProfileIds);
    for (const id of createdAuthIds) {
      await service.auth.admin.deleteUser(id);
    }
  };

  return {
    runId: RUN_ID,
    superAdmin: tiers.super_admin!,
    ministryAdmin: tiers.ministry_admin!,
    overShepherd,
    leader,
    leaderCareProfileId,
    rollbackSubjectProfileId,
    unrelatedLeaderProfileId: rollbackSubjectProfileId,
    unrelatedCareProfileId,
    teardown,
  };
}
