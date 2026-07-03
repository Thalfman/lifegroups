// NOTE: deliberately NOT marked "server-only" — pure helpers/types in this
// module are still value-imported by client-bundled dashboard demo/fixture
// code; splitting those out is tracked by the #816 module-split work.
import type { GuestsRow } from "@/types/database";
import type { GuestPipelineStage } from "@/types/enums";
import {
  columns,
  wrapError,
  type ReadClient,
  type ReadResult,
} from "./read-core";

// Supabase REST responses default-cap rows at ~1000. Free-tier dashboards stay well
// below this, but we widen the cap with an explicit range so pipeline counts stop
// silently truncating once a project crosses the default. Beyond ~10k guests this
// should switch to per-stage `count: exact` queries instead of row reads.
const GUEST_PAGE_LIMIT = 10000;

/**
 * Domain read-model for the guests directory. Exposes only the fields the
 * `/admin/guests` surface renders, so audit columns and any future schema
 * additions stay behind the read seam instead of flowing into the page and
 * its components as a raw `GuestsRow`. `Pick` from `GuestsRow` keeps the
 * field names and types byte-for-byte aligned with the table.
 */
export type GuestDirectoryEntry = Pick<
  GuestsRow,
  | "id"
  | "full_name"
  | "email"
  | "phone"
  | "first_attended_group_id"
  | "first_attended_date"
  | "pipeline_stage"
  | "assigned_group_id"
  | "follow_up_owner_id"
  | "notes"
  | "created_at"
>;

const ADMIN_GUEST_DIRECTORY_COLUMNS = columns<GuestDirectoryEntry>()(
  "id",
  "full_name",
  "email",
  "phone",
  "first_attended_group_id",
  "first_attended_date",
  "pipeline_stage",
  "assigned_group_id",
  "follow_up_owner_id",
  "notes",
  "created_at"
);

export async function fetchGuests(
  client: ReadClient
): Promise<ReadResult<GuestDirectoryEntry[]>> {
  const { data, error } = await client
    .from("guests")
    .select(ADMIN_GUEST_DIRECTORY_COLUMNS.select)
    .order("created_at", { ascending: false })
    .range(0, GUEST_PAGE_LIMIT - 1)
    .returns<GuestDirectoryEntry[]>();
  if (error) return { data: null, error: wrapError("fetchGuests", error) };
  return { data: data ?? [], error: null };
}

export const GUEST_PIPELINE_STAGES: GuestPipelineStage[] = [
  "new",
  "contacted",
  "interested",
  "assigned",
  "attended",
  "placed",
  "not_now",
];
