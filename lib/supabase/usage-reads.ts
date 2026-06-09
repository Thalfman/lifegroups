// Phase USAGE.1: read the recent usage_events for the Super Admin Console's
// Usage panel. usage_events is Super-Admin-only by RLS, so this read fails
// closed for every other role; the console only renders it for super_admin.

import { wrapError, type ReadClient, type ReadResult } from "./read-core";
import type { UsageEventsRow } from "@/types/database";

export async function fetchRecentUsageEvents(
  client: ReadClient,
  options: { limit?: number } = {}
): Promise<ReadResult<UsageEventsRow[]>> {
  const limit = options.limit ?? 200;
  const { data, error } = await client
    .from("usage_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error)
    return { data: null, error: wrapError("fetchRecentUsageEvents", error) };
  return { data: data ?? [], error: null };
}
