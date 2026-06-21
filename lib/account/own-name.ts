// Narrow, RLS-scoped read of the caller's own name state (ADR 0032). Shared
// by /reset-password (page + action) and /welcome so the placeholder-aware
// prefill logic lives once. Column allowlist — never select("*").

import type { AppSupabaseClient } from "@/lib/supabase/types";

export type OwnNameState = {
  pending: boolean;
  // Prefill for the "Your name" field. Fresh invites store the email as the
  // full_name placeholder, which would be a useless prefill, so it maps to
  // ""; a relinked profile keeps its real name for the person to confirm.
  prefill: string;
};

// Returns null when the read fails, no profile row is linked, or the row
// shape is unexpected — callers degrade (treat as not pending) rather than
// block; the /welcome gate is the safety net for a missed pending name.
export async function readOwnNameState(
  client: AppSupabaseClient,
  authUserId: string
): Promise<OwnNameState | null> {
  const { data, error } = await client
    .from("profiles")
    .select("full_name, full_name_pending, email")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as {
    full_name?: unknown;
    full_name_pending?: unknown;
    email?: unknown;
  };
  if (
    typeof row.full_name !== "string" ||
    typeof row.email !== "string" ||
    typeof row.full_name_pending !== "boolean"
  ) {
    return null;
  }
  const pending = row.full_name_pending;
  const prefill = pending && row.full_name !== row.email ? row.full_name : "";
  return { pending, prefill };
}
