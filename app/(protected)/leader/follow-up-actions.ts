"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/session";
import { isLeaderRole } from "@/lib/auth/roles";
import { validateLeaderUpdateFollowUpStatusPayload } from "@/lib/admin/validation";
import {
  type ActionResult,
  actionFail,
  actionOk,
  mapRpcError,
} from "@/lib/leader/action-result";
import { rpcLeaderUpdateFollowUpStatus } from "@/lib/leader/rpc";

const REVALIDATE_PATHS = ["/leader", "/admin/follow-ups", "/admin"] as const;

function revalidateAll(): void {
  for (const path of REVALIDATE_PATHS) revalidatePath(path);
}

async function requireLeaderActor(): Promise<
  | { ok: true; profileId: string }
  | { ok: false; error: string }
> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "You need to sign in to do that." };
  if (!session.profile) return { ok: false, error: "Your account isn't set up yet." };
  if (session.profile.status !== "active")
    return { ok: false, error: "Your account isn't active." };
  if (!isLeaderRole(session.profile.role))
    return {
      ok: false,
      error: "Only an assigned leader or co-leader can update this follow-up.",
    };
  return { ok: true, profileId: session.profile.id };
}

function payloadFromInput(input: unknown): Record<string, unknown> {
  if (input instanceof FormData) {
    return {
      follow_up_id: input.get("follow_up_id") ?? undefined,
      status: input.get("status") ?? undefined,
    };
  }
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

export async function leaderUpdateFollowUpStatus(
  _prev: ActionResult<{ id: string }> | undefined,
  input: FormData | { follow_up_id: string; status: "in_progress" | "done" },
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireLeaderActor();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = payloadFromInput(input);
  const v = validateLeaderUpdateFollowUpStatusPayload(raw);
  if (!v.ok) return actionFail(v.errors);

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcLeaderUpdateFollowUpStatus(client, {
    p_follow_up_id: v.value.follow_up_id,
    p_status: v.value.status,
  });

  if (error) return actionFail([mapRpcError(error.message)]);
  if (!data) return actionFail(["The follow-up wasn't updated. Please try again."]);

  revalidateAll();
  return actionOk({ id: data });
}
