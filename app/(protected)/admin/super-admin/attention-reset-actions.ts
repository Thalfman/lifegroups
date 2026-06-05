"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSuperAdminSession } from "@/lib/auth/session";
import {
  type ActionResult,
  actionFail,
  actionOk,
  mapRpcError,
} from "@/lib/admin/action-result";
import { isRecord } from "@/lib/admin/validation";
import { isUuid } from "@/lib/shared/uuid";
import {
  rpcSuperAdminResetCareAttention,
  rpcSuperAdminResetHealthAttention,
  rpcSuperAdminResetAttentionRevert,
} from "@/lib/admin/rpc";
import {
  RESET_CARE_ATTENTION_CONFIRM_PHRASE,
  RESET_HEALTH_ATTENTION_CONFIRM_PHRASE,
  CLEAN_SLATE_RESTORE_CONFIRM_PHRASE,
  type AttentionResetSuccess,
  type AttentionResetRevertSuccess,
} from "@/lib/admin/danger-zone";
import {
  isAttentionResetScope,
  type AttentionResetSurface,
} from "@/lib/admin/attention-reset";
import type { AttentionResetSnapshotsRow } from "@/types/database";

const REVALIDATE_PATH = "/admin/super-admin";

function readForm(input: unknown): Record<string, unknown> {
  if (input instanceof FormData) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of input.entries()) {
      out[key] = value === null ? undefined : String(value);
    }
    return out;
  }
  if (isRecord(input)) return input;
  return {};
}

// Read total_rows + scope/entity back from a snapshot row by id (RLS-gated
// SELECT) — never through the uuid return channel.
async function readSnapshotSummary(
  client: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  snapshotId: string
): Promise<{ affected: number; scope: string; entityId: string | null }> {
  const empty = { affected: 0, scope: "global", entityId: null };
  if (!client) return empty;
  const { data } = await client
    .from("attention_reset_snapshots")
    .select("total_rows, scope, entity_id")
    .eq("id", snapshotId)
    .maybeSingle<
      Pick<AttentionResetSnapshotsRow, "total_rows" | "scope" | "entity_id">
    >();
  if (!data) return empty;
  const total = Number(data.total_rows);
  return {
    affected: Number.isFinite(total) ? total : 0,
    scope: String(data.scope),
    entityId: data.entity_id ? String(data.entity_id) : null,
  };
}

// Resolve + validate the scope/entityId/confirm common to both reset actions.
// Bulk (global) requires the surface's type-to-confirm phrase; a per-entity
// reset is gated by the client confirm dialog (still super-admin only), so it
// just needs a valid entity id. Returns a fail result or the parsed values.
function parseResetInput(
  raw: Record<string, unknown>,
  confirmPhrase: string
):
  | { ok: true; scope: "global" | "entity"; entityId: string | null }
  | { ok: false; error: string } {
  const scope = typeof raw.scope === "string" ? raw.scope : "";
  if (!isAttentionResetScope(scope)) {
    return { ok: false, error: "Pick what to reset and try again." };
  }
  if (scope === "entity") {
    const entityId =
      typeof raw.entityId === "string" ? raw.entityId.trim() : "";
    if (!isUuid(entityId)) {
      return {
        ok: false,
        error: "Couldn't tell which row to reset. Refresh and try again.",
      };
    }
    return { ok: true, scope, entityId };
  }
  const confirm = typeof raw.confirm === "string" ? raw.confirm.trim() : "";
  if (confirm !== confirmPhrase) {
    return {
      ok: false,
      error: `Type ${confirmPhrase} exactly to confirm this reset.`,
    };
  }
  return { ok: true, scope, entityId: null };
}

// health-checks-reset: reset the leader-care "Needs attention" card to a clean
// slate — bulk (whole queue) or a single leader. Sets a care reset baseline and
// field-wipes the targeted care profiles, recoverably (snapshot captured first).
export async function superAdminResetCareAttention(
  _prev: ActionResult<AttentionResetSuccess> | undefined,
  input: unknown
): Promise<ActionResult<AttentionResetSuccess>> {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const parsed = parseResetInput(
    readForm(input),
    RESET_CARE_ATTENTION_CONFIRM_PHRASE
  );
  if (!parsed.ok) return actionFail([parsed.error]);

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data: snapshotId, error } = await rpcSuperAdminResetCareAttention(
    client,
    { p_scope: parsed.scope, p_entity_id: parsed.entityId }
  );
  if (error) return actionFail([mapRpcError(error.message)]);
  if (!snapshotId) {
    return actionFail(["The reset did not complete. Please try again."]);
  }

  const summary = await readSnapshotSummary(client, snapshotId);

  revalidatePath(REVALIDATE_PATH);
  revalidatePath("/admin");
  revalidatePath("/admin/shepherd-care");
  if (parsed.entityId) {
    revalidatePath(`/admin/shepherd-care/${parsed.entityId}`);
  }
  return actionOk({
    surface: "care" satisfies AttentionResetSurface,
    scope: parsed.scope,
    entityId: parsed.entityId,
    affected: summary.affected,
    snapshotId,
  });
}

// health-checks-reset: reset the health-check "Needs attention" card to a clean
// slate — bulk (whole queue) or a single group. Sets a health reset baseline
// (no row mutation; "missing" is absence-derived), recoverably.
export async function superAdminResetHealthAttention(
  _prev: ActionResult<AttentionResetSuccess> | undefined,
  input: unknown
): Promise<ActionResult<AttentionResetSuccess>> {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const parsed = parseResetInput(
    readForm(input),
    RESET_HEALTH_ATTENTION_CONFIRM_PHRASE
  );
  if (!parsed.ok) return actionFail([parsed.error]);

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data: snapshotId, error } = await rpcSuperAdminResetHealthAttention(
    client,
    { p_scope: parsed.scope, p_entity_id: parsed.entityId }
  );
  if (error) return actionFail([mapRpcError(error.message)]);
  if (!snapshotId) {
    return actionFail(["The reset did not complete. Please try again."]);
  }

  const summary = await readSnapshotSummary(client, snapshotId);

  revalidatePath(REVALIDATE_PATH);
  revalidatePath("/admin");
  revalidatePath("/admin/group-health");
  return actionOk({
    surface: "health" satisfies AttentionResetSurface,
    scope: parsed.scope,
    entityId: parsed.entityId,
    affected: summary.affected,
    snapshotId,
  });
}

// health-checks-reset: revert an attention reset back to its pre-reset state.
export async function superAdminResetAttentionRevert(
  _prev: ActionResult<AttentionResetRevertSuccess> | undefined,
  input: unknown
): Promise<ActionResult<AttentionResetRevertSuccess>> {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readForm(input);
  const confirm = typeof raw.confirm === "string" ? raw.confirm.trim() : "";
  if (confirm !== CLEAN_SLATE_RESTORE_CONFIRM_PHRASE) {
    return actionFail([
      `Type ${CLEAN_SLATE_RESTORE_CONFIRM_PHRASE} exactly to confirm restoring this reset.`,
    ]);
  }

  const submittedId =
    typeof raw.snapshotId === "string" ? raw.snapshotId.trim() : "";
  if (!isUuid(submittedId)) {
    return actionFail([
      "Couldn't tell which reset to restore. Refresh the page and try again.",
    ]);
  }

  const surface = typeof raw.surface === "string" ? raw.surface : "";
  if (surface !== "care" && surface !== "health") {
    return actionFail([
      "Couldn't tell which card to restore. Refresh and try again.",
    ]);
  }

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data: snapshotId, error } = await rpcSuperAdminResetAttentionRevert(
    client,
    { p_snapshot_id: submittedId }
  );
  if (error) return actionFail([mapRpcError(error.message)]);
  if (!snapshotId) {
    return actionFail(["The restore did not complete. Please try again."]);
  }

  const summary = await readSnapshotSummary(client, snapshotId);

  revalidatePath(REVALIDATE_PATH);
  revalidatePath("/admin");
  revalidatePath("/admin/shepherd-care");
  revalidatePath("/admin/group-health");
  return actionOk({
    surface,
    scope: summary.scope === "entity" ? "entity" : "global",
    entityId: summary.entityId,
    snapshotId,
  });
}
