// PRD-SAC6 Feature 1 (#294): Clean Slate snapshot export. This is the app's
// first Route Handler. Route handlers do NOT run inside the (protected) layout,
// so its session guard does not apply here — the super-admin check must be
// explicit (return 403 when the caller is not a super_admin). The snapshot is
// then read under the caller's own session, so RLS is the second layer of
// defense. The response streams the snapshot payload as a JSON file download.

import { getCurrentSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/shared/uuid";
import type { CleanSlateSnapshotsRow } from "@/types/database";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ snapshotId: string }> }
): Promise<Response> {
  const { snapshotId } = await params;

  // Explicit super-admin gate — the (protected) layout guard is not in effect.
  // Checks active status as well as role, matching the session guards
  // (resolveGuardVerdict): a deactivated super_admin with a still-live cookie
  // session must not pass the app-layer gate on a full-database export.
  const session = await getCurrentSession();
  if (
    session.kind !== "authenticated" ||
    session.profile.role !== "super_admin" ||
    session.profile.status !== "active"
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  if (!isUuid(snapshotId)) {
    return new Response("Not found", { status: 404 });
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    return new Response("Database is not configured.", { status: 503 });
  }

  // RLS (super-admin-only SELECT) is the second layer; the explicit gate above
  // is the first.
  const { data, error } = await client
    .from("clean_slate_snapshots")
    .select("payload")
    .eq("id", snapshotId)
    .maybeSingle<Pick<CleanSlateSnapshotsRow, "payload">>();

  if (error) {
    return new Response("Failed to read snapshot.", { status: 500 });
  }
  if (!data) {
    return new Response("Not found", { status: 404 });
  }

  // The payload is the import-ready shape (schema_version + per-table arrays).
  const body = JSON.stringify(data.payload, null, 2);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="clean-slate-${snapshotId}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
