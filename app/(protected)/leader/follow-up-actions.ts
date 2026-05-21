"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/session";
import { isLeaderRole } from "@/lib/auth/roles";
import { startActionLog } from "@/lib/observability/instrument";
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

// Returns the kind so the caller can emit a single terminal log line with
// the correct outcome (denied vs fail) and stage. Logging stays at the
// callsite to avoid the helper duplicating the per-action outcome line.
type RequireLeaderResult =
  | { ok: true; profileId: string }
  | { ok: false; kind: "anonymous" | "profile_missing" | "inactive" | "not_leader"; error: string }
  | { ok: false; kind: "backend_error"; stage: "profile_lookup" | "leader_assignments"; error: string };

async function requireLeaderActor(): Promise<RequireLeaderResult> {
  const session = await getCurrentSession();
  switch (session.kind) {
    case "anonymous":
      return { ok: false, kind: "anonymous", error: "You need to sign in to do that." };
    case "profile_missing":
      return { ok: false, kind: "profile_missing", error: "Your account isn't set up yet." };
    case "backend_error":
      return {
        ok: false,
        kind: "backend_error",
        stage: session.stage,
        error: "Service is temporarily unavailable. Please try again.",
      };
    case "authenticated": {
      if (session.profile.status !== "active")
        return { ok: false, kind: "inactive", error: "Your account isn't active." };
      if (!isLeaderRole(session.profile.role))
        return {
          ok: false,
          kind: "not_leader",
          error: "Only an assigned leader or co-leader can update this follow-up.",
        };
      return { ok: true, profileId: session.profile.id };
    }
  }
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
  const ctx = startActionLog("leader.follow_up.update_status");

  const auth = await requireLeaderActor();
  if (!auth.ok) {
    if (auth.kind === "backend_error") {
      // Transient backend failure -- surface as "fail" (with stage) rather
      // than "denied", which would imply the user was authenticated and
      // refused. The auth_backend_error code is the same taxonomy used by
      // the central session helper in lib/auth/session.ts.
      ctx.finish("fail", { error_code: "auth_backend_error", stage: auth.stage });
    } else {
      ctx.finish("denied", { error_code: "auth_denied", reason: auth.kind });
    }
    return actionFail([auth.error]);
  }

  const raw = payloadFromInput(input);
  const v = validateLeaderUpdateFollowUpStatusPayload(raw);
  if (!v.ok) {
    ctx.finish("fail", {
      error_code: "validation_failed",
      actor_profile_id: auth.profileId,
    });
    return actionFail(v.errors);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", {
      error_code: "supabase_not_configured",
      actor_profile_id: auth.profileId,
    });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await rpcLeaderUpdateFollowUpStatus(client, {
    p_follow_up_id: v.value.follow_up_id,
    p_status: v.value.status,
  });

  if (error) {
    ctx.finish("fail", {
      error_code: "rpc_error",
      rpc_token: error.message,
      actor_profile_id: auth.profileId,
      target_follow_up_id: v.value.follow_up_id,
    });
    return actionFail([mapRpcError(error.message)]);
  }
  if (!data) {
    ctx.finish("fail", {
      error_code: "rpc_no_data",
      actor_profile_id: auth.profileId,
      target_follow_up_id: v.value.follow_up_id,
    });
    return actionFail(["The follow-up wasn't updated. Please try again."]);
  }

  revalidateAll();
  ctx.finish("ok", {
    actor_profile_id: auth.profileId,
    target_follow_up_id: v.value.follow_up_id,
    new_status: v.value.status,
  });
  return actionOk({ id: data });
}
