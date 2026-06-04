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
  rpcSuperAdminPermanentDelete,
  rpcSuperAdminPermanentDeletePreflight,
  rpcSuperAdminRestoreTombstone,
} from "@/lib/admin/rpc";
import {
  PERMANENT_DELETE_CONFIRM_PHRASE,
  TOMBSTONE_RESTORE_CONFIRM_PHRASE,
  type DeletionPreflight,
  type DeletionBlocker,
  type PermanentDeleteSuccess,
  type TombstoneRestoreSuccess,
} from "@/lib/admin/danger-zone";
import { findPermanentDeletionEntity } from "@/lib/admin/permanent-deletion";

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

function readStr(raw: Record<string, unknown>, key: string): string {
  return typeof raw[key] === "string" ? (raw[key] as string).trim() : "";
}

// Validate the entity_type + id pair every permanent-deletion action needs: the
// type must be a registered target, the id a real uuid. Returns the validated
// pair or a user-facing error.
function readTarget(
  raw: Record<string, unknown>
): { ok: true; entityType: string; id: string } | { ok: false; error: string } {
  const entityType = readStr(raw, "entityType");
  const id = readStr(raw, "id");
  if (!findPermanentDeletionEntity(entityType)) {
    return { ok: false, error: "That isn't a deletable record type." };
  }
  if (!isUuid(id)) {
    return {
      ok: false,
      error: "Couldn't tell which record to act on. Refresh and try again.",
    };
  }
  return { ok: true, entityType, id };
}

function asNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Defensive trust-boundary read of the jsonb preflight document the RPC returns.
// The target (entityType/entityId) is stamped on by the caller, not the RPC.
function parsePreflight(
  data: unknown
): Omit<DeletionPreflight, "entityType" | "entityId"> {
  const doc = isRecord(data) ? data : {};
  const blockers: DeletionBlocker[] = Array.isArray(doc.blockers)
    ? doc.blockers.filter(isRecord).map((b) => ({
        table: typeof b.table === "string" ? b.table : "",
        column: typeof b.column === "string" ? b.column : "",
        action: typeof b.action === "string" ? b.action : "",
        count: asNumber(b.count),
      }))
    : [];
  const setNull = Array.isArray(doc.set_null)
    ? doc.set_null.filter(isRecord).map((s) => ({
        table: typeof s.table === "string" ? s.table : "",
        column: typeof s.column === "string" ? s.column : "",
        count: asNumber(s.count),
      }))
    : [];
  return {
    deletable: doc.deletable === true,
    confidential: doc.confidential === true,
    forbidden: doc.forbidden === true,
    blockers,
    setNull,
  };
}

// ADR 0014 (#313): preflight a permanent deletion. Reports what blocks it
// (cascade/restrict/no-action dependents, named with counts), the opaque
// confidential block (#314), and the set-null dependents it will null. No
// mutation, no confirm phrase — this only informs the danger-zone panel.
export async function superAdminPermanentDeletePreflight(
  _prev: ActionResult<DeletionPreflight> | undefined,
  input: unknown
): Promise<ActionResult<DeletionPreflight>> {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readForm(input);
  const target = readTarget(raw);
  if (!target.ok) return actionFail([target.error]);

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcSuperAdminPermanentDeletePreflight(client, {
    p_entity_type: target.entityType,
    p_id: target.id,
  });
  if (error) return actionFail([mapRpcError(error.message)]);

  // Stamp the target onto the report so the card can discard it the moment the
  // operator selects a different row.
  return actionOk({
    ...parsePreflight(data),
    entityType: target.entityType,
    entityId: target.id,
  });
}

// ADR 0014 (#312): permanently delete a curated entity. Gate super_admin,
// re-verify the type-to-confirm phrase, then run the snapshot+tombstone+delete
// RPC. The RPC re-checks every guard (role, registered target, blockers,
// confidential) authoritatively.
export async function superAdminPermanentDelete(
  _prev: ActionResult<PermanentDeleteSuccess> | undefined,
  input: unknown
): Promise<ActionResult<PermanentDeleteSuccess>> {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readForm(input);
  const target = readTarget(raw);
  if (!target.ok) return actionFail([target.error]);

  const confirm = readStr(raw, "confirm");
  if (confirm !== PERMANENT_DELETE_CONFIRM_PHRASE) {
    return actionFail([
      `Type ${PERMANENT_DELETE_CONFIRM_PHRASE} exactly to confirm permanent deletion.`,
    ]);
  }

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data: tombstoneId, error } = await rpcSuperAdminPermanentDelete(
    client,
    { p_entity_type: target.entityType, p_id: target.id }
  );
  if (error) return actionFail([mapRpcError(error.message)]);
  if (!tombstoneId) {
    return actionFail(["The deletion did not complete. Please try again."]);
  }

  revalidatePath(REVALIDATE_PATH);
  revalidatePath("/admin");
  return actionOk({
    entityType: target.entityType,
    entityId: target.id,
    tombstoneId,
  });
}

// ADR 0014 (#315): restore a tombstoned row from its snapshot. Gate
// super_admin, re-verify the RESTORE RECORD phrase, then run the restore RPC,
// which re-inserts the row and re-links the captured set-null dependents,
// returning a jsonb {entity_type, entity_id, relinked, skipped} report.
export async function superAdminRestoreTombstone(
  _prev: ActionResult<TombstoneRestoreSuccess> | undefined,
  input: unknown
): Promise<ActionResult<TombstoneRestoreSuccess>> {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readForm(input);
  const tombstoneId = readStr(raw, "tombstoneId");
  if (!isUuid(tombstoneId)) {
    return actionFail([
      "Couldn't tell which tombstone to restore. Refresh and try again.",
    ]);
  }

  const confirm = readStr(raw, "confirm");
  if (confirm !== TOMBSTONE_RESTORE_CONFIRM_PHRASE) {
    return actionFail([
      `Type ${TOMBSTONE_RESTORE_CONFIRM_PHRASE} exactly to confirm restoring the record.`,
    ]);
  }

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } = await rpcSuperAdminRestoreTombstone(client, {
    p_tombstone_id: tombstoneId,
  });
  if (error) return actionFail([mapRpcError(error.message)]);
  const doc = isRecord(data) ? data : {};
  if (typeof doc.entity_id !== "string") {
    return actionFail(["The restore did not complete. Please try again."]);
  }

  revalidatePath(REVALIDATE_PATH);
  revalidatePath("/admin");
  return actionOk({
    tombstoneId,
    entityType: typeof doc.entity_type === "string" ? doc.entity_type : "",
    entityId: doc.entity_id,
    relinked: asNumber(doc.relinked),
    skipped: asNumber(doc.skipped),
  });
}
