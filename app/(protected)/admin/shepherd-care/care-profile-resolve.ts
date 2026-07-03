"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/auth/session";
import { fetchShepherdCareProfileByShepherdId } from "@/lib/supabase/shepherd-care-directory-reads";
import { isUuid } from "@/lib/shared/uuid";

// Read-only care-profile resolver (#776 Phase 1, OPP-1). A care follow-up keys
// on `care_profile_id`, but the Care accordion / Notes feed only carry the
// leader's `shepherd_profile_id`. Before offering the "Create follow-up"
// drawer, the client resolves the leader's care profile id through this action
// so a subject profile id is NEVER posted as the care-profile id.
//
// This is a READ, not a write: it adds no RPC, schema, or table mutation — it
// runs the existing reads-seam query behind the admin guard (mirroring the
// read-only preflight in `super-admin/permanent-delete-actions`). It does NOT
// lazily create a profile: matching the detail page, a leader with no care
// profile yet must first log an interaction / set the profile, so the resolver
// returns `id: null` and the drawer explains that rather than writing a
// surprise audit row just from opening the panel.

export type ResolveCareProfileResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

export async function resolveCareProfileId(
  shepherdProfileId: string
): Promise<ResolveCareProfileResult> {
  if (!isUuid(shepherdProfileId)) {
    return { ok: false, error: "Couldn't tell which shepherd to act on." };
  }

  // Ministry-Admin (or Super-Admin) only — same gate the Care writes use.
  const guard = await requireAdminSession();
  if (!guard.ok) return { ok: false, error: guard.error };

  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      ok: false,
      error: "The database isn't available right now. Try again shortly.",
    };
  }

  const result = await fetchShepherdCareProfileByShepherdId(
    client,
    shepherdProfileId
  );
  if (result.error) {
    return {
      ok: false,
      error: "Couldn't load this shepherd's care profile. Try again shortly.",
    };
  }

  return { ok: true, id: result.data?.id ?? null };
}
