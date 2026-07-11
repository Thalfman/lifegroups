import "server-only";

import type { AccountDeletionRequestsRow, ProfilesRow } from "@/types/database";
import {
  columns,
  unwrapEmbed,
  wrapError,
  type EmbeddedToOne,
  type ReadClient,
  type ReadResult,
} from "./read-core";

const SUPER_ADMIN_ACCOUNT_DELETION_REQUEST_COLUMNS =
  columns<AccountDeletionRequestsRow>()(
    "id",
    "profile_id",
    "reason",
    "status",
    "requested_at"
  );

const SUPER_ADMIN_ACCOUNT_DELETION_PROFILE_COLUMNS = columns<ProfilesRow>()(
  "id",
  "full_name",
  "email"
);

const PENDING_REQUEST_SELECT =
  `${SUPER_ADMIN_ACCOUNT_DELETION_REQUEST_COLUMNS.select}, ` +
  `profile:profiles!account_deletion_requests_profile_id_fkey (` +
  `${SUPER_ADMIN_ACCOUNT_DELETION_PROFILE_COLUMNS.select})`;

type PendingRequestJoinRow = Pick<
  AccountDeletionRequestsRow,
  "id" | "profile_id" | "reason" | "status" | "requested_at"
> & {
  profile: EmbeddedToOne<Pick<ProfilesRow, "id" | "full_name" | "email">>;
};

export type PendingAccountDeletionRequest = {
  id: string;
  profileId: string;
  requesterName: string;
  requesterEmail: string;
  reason: string | null;
  status: "pending";
  requestedAt: string;
};

export async function fetchPendingAccountDeletionRequests(
  client: ReadClient
): Promise<ReadResult<PendingAccountDeletionRequest[]>> {
  const { data, error } = await client
    .from("account_deletion_requests")
    .select(PENDING_REQUEST_SELECT)
    .eq("status", "pending")
    .order("requested_at", { ascending: true });

  if (error) {
    return {
      data: null,
      error: wrapError("fetchPendingAccountDeletionRequests", error.message),
    };
  }

  const requests: PendingAccountDeletionRequest[] = [];
  for (const row of (data ?? []) as unknown as PendingRequestJoinRow[]) {
    const profile = unwrapEmbed(row.profile);
    if (!profile || !row.profile_id || row.status !== "pending") {
      return {
        data: null,
        error: new Error(
          "fetchPendingAccountDeletionRequests: pending row has no requester profile"
        ),
      };
    }
    requests.push({
      id: row.id,
      profileId: row.profile_id,
      requesterName: profile.full_name,
      requesterEmail: profile.email,
      reason: row.reason,
      status: "pending",
      requestedAt: row.requested_at,
    });
  }

  return { data: requests, error: null };
}
