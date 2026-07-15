import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { makeServiceClient } from "./clients";
import type { IntegrationEnv } from "./env";
import type { Fixtures } from "./fixtures";
import { grantFixtureProvisioning } from "./local-grants";

export const PRIORITY_SUPER_ADMIN_TABLES = [
  "account_deletion_requests",
  "invitations",
  "tombstones",
  "clean_slate_snapshots",
  "history_reset_snapshots",
  "attention_reset_snapshots",
] as const;

export type PrioritySuperAdminTable =
  (typeof PRIORITY_SUPER_ADMIN_TABLES)[number];

export interface PriorityRlsFixtures {
  readonly superAdminOnlyRowIds: Readonly<
    Record<PrioritySuperAdminTable, string>
  >;
  readonly leaderScoped: {
    readonly assignedGroupId: string;
    readonly assignedMemberId: string;
    readonly unrelatedGroupId: string;
    readonly unrelatedMemberId: string;
    // Wave-3 graduation fixtures (#902): one row tied to the assigned group
    // per read arm, plus an unrelated-group negative control per table.
    readonly assignedGuestId: string;
    readonly firstAttendedGuestId: string;
    readonly unrelatedGuestId: string;
    readonly relatedFollowUpId: string;
    readonly assignedToFollowUpId: string;
    readonly unrelatedFollowUpId: string;
    readonly assignedAttendanceSessionId: string;
    readonly unrelatedAttendanceSessionId: string;
    readonly assignedHealthUpdateId: string;
    readonly unrelatedHealthUpdateId: string;
  };
  readonly teardown: () => Promise<void>;
}

async function insertAndReturnId(
  service: SupabaseClient,
  table: string,
  values: Record<string, unknown>
): Promise<string> {
  const { data, error } = await service
    .from(table)
    .insert(values)
    .select("id")
    .single();
  if (error)
    throw new Error(`${table} fixture insert failed: ${error.message}`);
  const id = data?.id;
  if (typeof id !== "string") {
    throw new Error(`${table} fixture insert returned no id`);
  }
  return id;
}

async function deleteIds(
  service: SupabaseClient,
  table: string,
  ids: readonly string[]
): Promise<void> {
  const { error } = await service
    .from(table)
    .delete()
    .in("id", [...ids]);
  if (error)
    throw new Error(`${table} fixture teardown failed: ${error.message}`);
}

/**
 * Seed the high-risk tables promoted by the July 11 live-RLS ratchet.
 * Provisioning uses the local service client; every assertion uses the
 * authenticated tier clients from the base fixture.
 */
export async function provisionPriorityRlsFixtures(
  env: IntegrationEnv,
  base: Pick<Fixtures, "runId" | "superAdmin" | "leader">
): Promise<PriorityRlsFixtures> {
  await grantFixtureProvisioning();
  const service = makeServiceClient(env);

  const assignedGroupId = await insertAndReturnId(service, "groups", {
    name: `RLS assigned group ${base.runId}`,
    lifecycle_status: "active",
    health_status: "healthy",
    group_type: "Integration",
  });
  const unrelatedGroupId = await insertAndReturnId(service, "groups", {
    name: `RLS unrelated group ${base.runId}`,
    lifecycle_status: "active",
    health_status: "healthy",
    group_type: "Integration",
  });

  const groupLeaderId = await insertAndReturnId(service, "group_leaders", {
    group_id: assignedGroupId,
    profile_id: base.leader.profileId,
    role: "leader",
    active: true,
  });

  const assignedMemberId = await insertAndReturnId(service, "members", {
    full_name: `RLS assigned member ${base.runId}`,
    status: "active",
  });
  const unrelatedMemberId = await insertAndReturnId(service, "members", {
    full_name: `RLS unrelated member ${base.runId}`,
    status: "active",
  });
  const assignedMembershipId = await insertAndReturnId(
    service,
    "group_memberships",
    {
      group_id: assignedGroupId,
      member_id: assignedMemberId,
      role: "member",
      status: "active",
    }
  );
  const unrelatedMembershipId = await insertAndReturnId(
    service,
    "group_memberships",
    {
      group_id: unrelatedGroupId,
      member_id: unrelatedMemberId,
      role: "member",
      status: "active",
    }
  );

  // guests carries two leader read arms (first-attended group OR assigned
  // group); seed one row per arm plus an unrelated-group negative control.
  const assignedGuestId = await insertAndReturnId(service, "guests", {
    full_name: `RLS assigned guest ${base.runId}`,
    assigned_group_id: assignedGroupId,
  });
  const firstAttendedGuestId = await insertAndReturnId(service, "guests", {
    full_name: `RLS first-attended guest ${base.runId}`,
    first_attended_group_id: assignedGroupId,
  });
  const unrelatedGuestId = await insertAndReturnId(service, "guests", {
    full_name: `RLS unrelated guest ${base.runId}`,
    first_attended_group_id: unrelatedGroupId,
    assigned_group_id: unrelatedGroupId,
  });

  // follow_ups also has two leader arms: a led related_group_id OR being the
  // assignee (assigned_to) directly, with no group at all.
  const relatedFollowUpId = await insertAndReturnId(service, "follow_ups", {
    type: "care",
    title: `RLS group follow-up ${base.runId}`,
    related_group_id: assignedGroupId,
  });
  const assignedToFollowUpId = await insertAndReturnId(service, "follow_ups", {
    type: "leader",
    title: `RLS assignee follow-up ${base.runId}`,
    assigned_to: base.leader.profileId,
  });
  const unrelatedFollowUpId = await insertAndReturnId(service, "follow_ups", {
    type: "care",
    title: `RLS unrelated follow-up ${base.runId}`,
    related_group_id: unrelatedGroupId,
  });

  const assignedAttendanceSessionId = await insertAndReturnId(
    service,
    "attendance_sessions",
    { group_id: assignedGroupId, meeting_week: "2026-01-05" }
  );
  const unrelatedAttendanceSessionId = await insertAndReturnId(
    service,
    "attendance_sessions",
    { group_id: unrelatedGroupId, meeting_week: "2026-01-05" }
  );

  const assignedHealthUpdateId = await insertAndReturnId(
    service,
    "group_health_updates",
    { group_id: assignedGroupId, update_week: "2026-01-05", pulse: "healthy" }
  );
  const unrelatedHealthUpdateId = await insertAndReturnId(
    service,
    "group_health_updates",
    { group_id: unrelatedGroupId, update_week: "2026-01-05", pulse: "watch" }
  );

  const accountDeletionRequestId = await insertAndReturnId(
    service,
    "account_deletion_requests",
    {
      profile_id: base.leader.profileId,
      status: "pending",
    }
  );
  const tokenHash = createHash("sha256")
    .update(`priority-rls:${base.runId}`)
    .digest("hex");
  const invitationId = await insertAndReturnId(service, "invitations", {
    token_hash: tokenHash,
    role: "leader",
    group_id: assignedGroupId,
    single_use: true,
    max_uses: 1,
    used_count: 0,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    created_by_profile_id: base.superAdmin.profileId,
  });
  const tombstoneId = await insertAndReturnId(service, "tombstones", {
    entity_type: "group",
    table_name: "groups",
    entity_id: unrelatedGroupId,
    row_snapshot: { id: unrelatedGroupId, fixture: true },
    set_null_dependents: [],
    deleted_by: base.superAdmin.profileId,
  });

  const cleanSlateSnapshotId = await insertAndReturnId(
    service,
    "clean_slate_snapshots",
    {
      created_by: base.superAdmin.profileId,
      kind: "clean_slate_history",
      payload: { schema_version: 1, fixture: true },
      row_counts: {},
      total_rows: 0,
    }
  );
  const historyResetSnapshotId = await insertAndReturnId(
    service,
    "history_reset_snapshots",
    {
      created_by: base.superAdmin.profileId,
      category: "attendance",
      kind: "history_reset",
      payload: { schema_version: 1, fixture: true },
      row_counts: {},
      total_rows: 0,
    }
  );
  const attentionResetSnapshotId = await insertAndReturnId(
    service,
    "attention_reset_snapshots",
    {
      created_by: base.superAdmin.profileId,
      surface: "care",
      scope: "global",
      entity_id: null,
      kind: "attention_reset",
      payload: { schema_version: 1, fixture: true },
      row_counts: {},
      total_rows: 0,
    }
  );

  const superAdminOnlyRowIds = {
    account_deletion_requests: accountDeletionRequestId,
    invitations: invitationId,
    tombstones: tombstoneId,
    clean_slate_snapshots: cleanSlateSnapshotId,
    history_reset_snapshots: historyResetSnapshotId,
    attention_reset_snapshots: attentionResetSnapshotId,
  } satisfies Record<PrioritySuperAdminTable, string>;

  const teardown = async (): Promise<void> => {
    await Promise.all(
      PRIORITY_SUPER_ADMIN_TABLES.map((table) =>
        deleteIds(service, table, [superAdminOnlyRowIds[table]])
      )
    );
    // follow_ups can reference guests, so it goes first among the wave-3 rows.
    await deleteIds(service, "follow_ups", [
      relatedFollowUpId,
      assignedToFollowUpId,
      unrelatedFollowUpId,
    ]);
    await deleteIds(service, "guests", [
      assignedGuestId,
      firstAttendedGuestId,
      unrelatedGuestId,
    ]);
    await deleteIds(service, "attendance_sessions", [
      assignedAttendanceSessionId,
      unrelatedAttendanceSessionId,
    ]);
    await deleteIds(service, "group_health_updates", [
      assignedHealthUpdateId,
      unrelatedHealthUpdateId,
    ]);
    await deleteIds(service, "group_memberships", [
      assignedMembershipId,
      unrelatedMembershipId,
    ]);
    await deleteIds(service, "members", [assignedMemberId, unrelatedMemberId]);
    await deleteIds(service, "group_leaders", [groupLeaderId]);
    await deleteIds(service, "groups", [assignedGroupId, unrelatedGroupId]);
  };

  return {
    superAdminOnlyRowIds,
    leaderScoped: {
      assignedGroupId,
      assignedMemberId,
      unrelatedGroupId,
      unrelatedMemberId,
      assignedGuestId,
      firstAttendedGuestId,
      unrelatedGuestId,
      relatedFollowUpId,
      assignedToFollowUpId,
      unrelatedFollowUpId,
      assignedAttendanceSessionId,
      unrelatedAttendanceSessionId,
      assignedHealthUpdateId,
      unrelatedHealthUpdateId,
    },
    teardown,
  };
}
