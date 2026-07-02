// Request-scoped groups read (perf: collapse the duplicate full-groups read).
//
// On a first /admin launch the full groups table is read twice on the SAME
// request: once in the dashboard batch (Boundary A, via
// supabaseAdminDashboardReads) and again in the Multiply grid (Boundary B, via
// supabaseMultiplyGridReads). Both call fetchAllGroups() with no shared cache,
// so opening Home issues the SAME groups read twice. This module owns one
// client + one fetchAllGroups, wrapped in React.cache (mirroring
// loadAdminFeatureFlags / getCurrentSession), so both boundaries share a single
// round-trip per request.
//
// Deliberately per-request React.cache, NOT cross-request unstable_cache:
// fetchAllGroups returns the full GroupsRow (incl. admin_notes) and the groups
// table is RLS-gated to the admin role, so cross-request data-cache sharing is
// exactly the posture cached-config.ts excludes for admin-only / RLS-divergent
// reads. React.cache memoizes within one render only — precisely the duplicate
// being removed here (Boundary A and Boundary B run in the same request).
//
// Fails safe to an empty list with no error when the DB is not configured (the
// no-client demo/preview path), matching what both call sites did before by
// guarding on `client` themselves.

import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchAllGroups } from "@/lib/supabase/group-reads";
import type { ReadResult } from "@/lib/supabase/read-core";
import type { GroupsRow } from "@/types/database";

// The full groups read for the current request, read once and shared. Returns
// the same ReadResult<GroupsRow[]> shape fetchAllGroups returns, so it drops
// straight into both reads-seam bindings without touching the pure builders or
// the firstError gate (which inspects groupsResult.error).
export const loadAllGroupsForAdmin = cache(
  async (): Promise<ReadResult<GroupsRow[]>> => {
    const client = await createSupabaseServerClient();
    if (!client) return { data: [], error: null };
    return fetchAllGroups(client);
  }
);
