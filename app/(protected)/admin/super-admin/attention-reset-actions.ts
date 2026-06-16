"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSuperAdminSession } from "@/lib/auth/session";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type AdminWriteActionSpec,
  type ValidationResult,
} from "@/lib/admin/run-action";
import { isUuid } from "@/lib/shared/uuid";
import { adminRpc } from "@/lib/admin/rpc";
import {
  RESET_CARE_ATTENTION_CONFIRM_PHRASE,
  RESET_HEALTH_ATTENTION_CONFIRM_PHRASE,
  CLEAN_SLATE_RESTORE_CONFIRM_PHRASE,
  type AttentionResetSuccess,
  type AttentionResetRevertSuccess,
} from "@/lib/admin/danger-zone";
import { isAttentionResetScope } from "@/lib/admin/attention-reset";
import type { AttentionResetSnapshotsRow } from "@/types/database";

// Read total_rows + scope/entity back from a snapshot row by id (RLS-gated
// SELECT) — never through the uuid return channel. Called from inside each
// spec's `rpc` (which holds the client).
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

type ResetInput = { scope: "global" | "entity"; entityId: string | null };

// Resolve + validate the scope/entityId/confirm common to both reset actions.
// Bulk (global) requires the surface's type-to-confirm phrase; a per-entity
// reset is gated by the client confirm dialog (still super-admin only), so it
// just needs a valid entity id.
function validateResetInput(
  raw: Record<string, unknown>,
  confirmPhrase: string
): ValidationResult<ResetInput> {
  const scope = typeof raw.scope === "string" ? raw.scope : "";
  if (!isAttentionResetScope(scope)) {
    return { ok: false, errors: ["Pick what to reset and try again."] };
  }
  if (scope === "entity") {
    const entityId =
      typeof raw.entityId === "string" ? raw.entityId.trim() : "";
    if (!isUuid(entityId)) {
      return {
        ok: false,
        errors: ["Couldn't tell which row to reset. Refresh and try again."],
      };
    }
    return { ok: true, value: { scope, entityId } };
  }
  const confirm = typeof raw.confirm === "string" ? raw.confirm.trim() : "";
  if (confirm !== confirmPhrase) {
    return {
      ok: false,
      errors: [`Type ${confirmPhrase} exactly to confirm this reset.`],
    };
  }
  return { ok: true, value: { scope, entityId: null } };
}

// health-checks-reset: reset the leader-care "Needs attention" card to a clean
// slate — bulk (whole queue) or a single leader. Sets a care reset baseline and
// field-wipes the targeted care profiles, recoverably (snapshot captured first).
const RESET_CARE_ATTENTION_SPEC: AdminWriteActionSpec<
  ResetInput,
  AttentionResetSuccess,
  AttentionResetSuccess
> = {
  name: "super_admin.reset_care_attention",
  auth: requireSuperAdminSession,
  keys: ["scope", "entityId", "confirm"],
  validate: (raw) =>
    validateResetInput(raw, RESET_CARE_ATTENTION_CONFIRM_PHRASE),
  fields: (_actor, value) => ({ scope: value.scope }),
  rpc: async (client, value) => {
    const { data: snapshotId, error } = await adminRpc(
      client,
      "super_admin_reset_care_attention",
      { p_scope: value.scope, p_entity_id: value.entityId }
    );
    if (error) return { data: null, error };
    if (!snapshotId) return { data: null, error: null };
    const summary = await readSnapshotSummary(client, snapshotId);
    return {
      data: {
        surface: "care",
        scope: value.scope,
        entityId: value.entityId,
        affected: summary.affected,
        snapshotId,
      },
      error: null,
    };
  },
  result: (data) => data,
  revalidate: (value) => {
    const paths = ["/admin/super-admin", "/admin", "/admin/shepherd-care"];
    if (value.entityId) paths.push(`/admin/shepherd-care/${value.entityId}`);
    return paths;
  },
  noDataError: "The reset did not complete. Please try again.",
};

export async function superAdminResetCareAttention(
  prev: ActionResult<AttentionResetSuccess> | undefined,
  input: unknown
): Promise<ActionResult<AttentionResetSuccess>> {
  return runAdminWriteAction(RESET_CARE_ATTENTION_SPEC, prev, input);
}

// health-checks-reset: reset the health-check "Needs attention" card to a clean
// slate — bulk (whole queue) or a single group. Sets a health reset baseline
// (no row mutation; "missing" is absence-derived), recoverably.
const RESET_HEALTH_ATTENTION_SPEC: AdminWriteActionSpec<
  ResetInput,
  AttentionResetSuccess,
  AttentionResetSuccess
> = {
  name: "super_admin.reset_health_attention",
  auth: requireSuperAdminSession,
  keys: ["scope", "entityId", "confirm"],
  validate: (raw) =>
    validateResetInput(raw, RESET_HEALTH_ATTENTION_CONFIRM_PHRASE),
  fields: (_actor, value) => ({ scope: value.scope }),
  rpc: async (client, value) => {
    const { data: snapshotId, error } = await adminRpc(
      client,
      "super_admin_reset_health_attention",
      { p_scope: value.scope, p_entity_id: value.entityId }
    );
    if (error) return { data: null, error };
    if (!snapshotId) return { data: null, error: null };
    const summary = await readSnapshotSummary(client, snapshotId);
    return {
      data: {
        surface: "health",
        scope: value.scope,
        entityId: value.entityId,
        affected: summary.affected,
        snapshotId,
      },
      error: null,
    };
  },
  result: (data) => data,
  revalidate: () => ["/admin/super-admin", "/admin", "/admin/group-health"],
  noDataError: "The reset did not complete. Please try again.",
};

export async function superAdminResetHealthAttention(
  prev: ActionResult<AttentionResetSuccess> | undefined,
  input: unknown
): Promise<ActionResult<AttentionResetSuccess>> {
  return runAdminWriteAction(RESET_HEALTH_ATTENTION_SPEC, prev, input);
}

// health-checks-reset: revert an attention reset back to its pre-reset state.
const RESET_ATTENTION_REVERT_SPEC: AdminWriteActionSpec<
  { snapshotId: string; surface: "care" | "health" },
  AttentionResetRevertSuccess,
  AttentionResetRevertSuccess
> = {
  name: "super_admin.reset_attention_revert",
  auth: requireSuperAdminSession,
  keys: ["confirm", "snapshotId", "surface"],
  validate: (
    raw
  ): ValidationResult<{ snapshotId: string; surface: "care" | "health" }> => {
    const confirm = typeof raw.confirm === "string" ? raw.confirm.trim() : "";
    if (confirm !== CLEAN_SLATE_RESTORE_CONFIRM_PHRASE) {
      return {
        ok: false,
        errors: [
          `Type ${CLEAN_SLATE_RESTORE_CONFIRM_PHRASE} exactly to confirm restoring this reset.`,
        ],
      };
    }
    const submittedId =
      typeof raw.snapshotId === "string" ? raw.snapshotId.trim() : "";
    if (!isUuid(submittedId)) {
      return {
        ok: false,
        errors: [
          "Couldn't tell which reset to restore. Refresh the page and try again.",
        ],
      };
    }
    const surface = typeof raw.surface === "string" ? raw.surface : "";
    if (surface !== "care" && surface !== "health") {
      return {
        ok: false,
        errors: ["Couldn't tell which card to restore. Refresh and try again."],
      };
    }
    return { ok: true, value: { snapshotId: submittedId, surface } };
  },
  rpc: async (client, value) => {
    const { data: snapshotId, error } = await adminRpc(
      client,
      "super_admin_reset_attention_revert",
      { p_snapshot_id: value.snapshotId }
    );
    if (error) return { data: null, error };
    if (!snapshotId) return { data: null, error: null };
    const summary = await readSnapshotSummary(client, snapshotId);
    return {
      data: {
        surface: value.surface,
        scope: summary.scope === "entity" ? "entity" : "global",
        entityId: summary.entityId,
        snapshotId,
      },
      error: null,
    };
  },
  result: (data) => data,
  revalidate: () => [
    "/admin/super-admin",
    "/admin",
    "/admin/shepherd-care",
    "/admin/group-health",
  ],
  noDataError: "The restore did not complete. Please try again.",
};

export async function superAdminResetAttentionRevert(
  prev: ActionResult<AttentionResetRevertSuccess> | undefined,
  input: unknown
): Promise<ActionResult<AttentionResetRevertSuccess>> {
  return runAdminWriteAction(RESET_ATTENTION_REVERT_SPEC, prev, input);
}
