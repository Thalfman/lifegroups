"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSuperAdminSession } from "@/lib/auth/session";
import {
  type ActionResult,
  actionFail,
  actionOk,
  mapRpcError,
} from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type AdminWriteActionSpec,
  type ValidationResult,
} from "@/lib/admin/run-action";
import { isRecord } from "@/lib/admin/validation";
import { isUuid } from "@/lib/shared/uuid";
import { adminJsonRpc, adminRpc } from "@/lib/admin/rpc";
import {
  PERMANENT_DELETE_CONFIRM_PHRASE,
  TOMBSTONE_RESTORE_CONFIRM_PHRASE,
  type DeletionPreflight,
  type DeletionBlocker,
  type PermanentDeleteSuccess,
  type TombstoneRestoreSuccess,
} from "@/lib/admin/danger-zone";
import {
  findPermanentDeletionEntity,
  isInlineDeletableEntityType,
} from "@/lib/admin/permanent-deletion";

const REVALIDATE_PATHS = ["/admin/super-admin", "/admin"] as const;

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
//
// Stays hand-rolled (not a Write Action Runner spec): it is a pure read with no
// mutation and no paired audit_events row, so it is not part of the write-path
// logging gap the runner closes.
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

  const { data, error } = await adminJsonRpc(
    client,
    "super_admin_permanent_delete_preflight",
    {
      p_entity_type: target.entityType,
      p_id: target.id,
    }
  );
  if (error) return actionFail([mapRpcError(error.message)]);

  // Stamp the target onto the report so the card can discard it the moment the
  // operator selects a different row.
  return actionOk({
    ...parsePreflight(data),
    entityType: target.entityType,
    entityId: target.id,
  });
}

type DeleteTarget = { entityType: string; id: string };

// Shared success builder: the tombstone id comes from the RPC (`D`), the entity
// identity from the validated target.
function deleteSuccess(
  tombstoneId: string,
  value: DeleteTarget
): PermanentDeleteSuccess {
  return { entityType: value.entityType, entityId: value.id, tombstoneId };
}

// ADR 0014 (#312): permanently delete a curated entity. Gate super_admin,
// re-verify the type-to-confirm phrase, then run the snapshot+tombstone+delete
// RPC. The RPC re-checks every guard (role, registered target, blockers,
// confidential) authoritatively.
const PERMANENT_DELETE_SPEC: AdminWriteActionSpec<
  DeleteTarget,
  PermanentDeleteSuccess
> = {
  name: "super_admin.permanent_delete",
  auth: requireSuperAdminSession,
  keys: ["entityType", "id", "confirm"],
  validate: (raw): ValidationResult<DeleteTarget> => {
    const target = readTarget(raw);
    if (!target.ok) return { ok: false, errors: [target.error] };
    const confirm = readStr(raw, "confirm");
    if (confirm !== PERMANENT_DELETE_CONFIRM_PHRASE) {
      return {
        ok: false,
        errors: [
          `Type ${PERMANENT_DELETE_CONFIRM_PHRASE} exactly to confirm permanent deletion.`,
        ],
      };
    }
    return {
      ok: true,
      value: { entityType: target.entityType, id: target.id },
    };
  },
  fields: (_actor, value) => ({
    entity_type: value.entityType,
    target_entity_id: value.id,
  }),
  rpc: (client, value) =>
    adminRpc(client, "super_admin_permanent_delete", {
      p_entity_type: value.entityType,
      p_id: value.id,
    }),
  result: deleteSuccess,
  revalidate: () => REVALIDATE_PATHS,
  noDataError: "The deletion did not complete. Please try again.",
};

export async function superAdminPermanentDelete(
  prev: ActionResult<PermanentDeleteSuccess> | undefined,
  input: unknown
): Promise<ActionResult<PermanentDeleteSuccess>> {
  return runAdminWriteAction(PERMANENT_DELETE_SPEC, prev, input);
}

// ADR 0014 (SAD9): the lighter sibling of superAdminPermanentDelete that backs
// the inline super-admin-only Delete control. Same super-admin gate +
// registered-target/uuid validation + snapshot-then-delete RPC, but NO
// type-to-confirm phrase — the inline confirm popover is the deliberate confirm
// step. Revalidates the caller's surface path plus /admin so the just-deleted
// row disappears in place. The RPC re-checks role, registered target, blockers,
// and the confidential block authoritatively, so dropping the phrase weakens
// nothing the engine guarantees.
const INLINE_DELETE_SPEC: AdminWriteActionSpec<
  DeleteTarget,
  PermanentDeleteSuccess
> = {
  name: "super_admin.inline_delete",
  auth: requireSuperAdminSession,
  keys: ["entityType", "id", "path"],
  validate: (raw): ValidationResult<DeleteTarget> => {
    const target = readTarget(raw);
    if (!target.ok) return { ok: false, errors: [target.error] };
    // The no-phrase quick-confirm is only justified for the entity types the
    // inline control renders. Every other registered danger-zone target still
    // requires the PERMANENTLY DELETE phrase, so refuse them here even though
    // readTarget (the shared validator) accepts the whole registry.
    if (!isInlineDeletableEntityType(target.entityType)) {
      return {
        ok: false,
        errors: ["That record type can't be deleted from here."],
      };
    }
    return {
      ok: true,
      value: { entityType: target.entityType, id: target.id },
    };
  },
  fields: (_actor, value) => ({
    entity_type: value.entityType,
    target_entity_id: value.id,
  }),
  rpc: (client, value) =>
    adminRpc(client, "super_admin_permanent_delete", {
      p_entity_type: value.entityType,
      p_id: value.id,
    }),
  result: deleteSuccess,
  // Targeted revalidation of the surface the control was rendered on. `path`
  // arrives from the client (usePathname); accept it only when it begins with
  // /admin so a forged value can't trigger arbitrary revalidation.
  revalidate: (_value, raw) => {
    const path = readStr(raw, "path");
    return path.startsWith("/admin") ? [path, "/admin"] : ["/admin"];
  },
  noDataError: "The deletion did not complete. Please try again.",
};

export async function superAdminInlineDelete(
  prev: ActionResult<PermanentDeleteSuccess> | undefined,
  input: unknown
): Promise<ActionResult<PermanentDeleteSuccess>> {
  return runAdminWriteAction(INLINE_DELETE_SPEC, prev, input);
}

// ADR 0014 (#315): restore a tombstoned row from its snapshot. Gate
// super_admin, re-verify the RESTORE RECORD phrase, then run the restore RPC,
// which re-inserts the row and re-links the captured set-null dependents,
// returning a jsonb {entity_type, entity_id, relinked, skipped} report. The
// trust-boundary parse of that document happens in `rpc`; a document with no
// entity_id reads as no-data.
const RESTORE_TOMBSTONE_SPEC: AdminWriteActionSpec<
  { tombstoneId: string },
  TombstoneRestoreSuccess,
  TombstoneRestoreSuccess
> = {
  name: "super_admin.restore_tombstone",
  auth: requireSuperAdminSession,
  keys: ["tombstoneId", "confirm"],
  validate: (raw): ValidationResult<{ tombstoneId: string }> => {
    const tombstoneId = readStr(raw, "tombstoneId");
    if (!isUuid(tombstoneId)) {
      return {
        ok: false,
        errors: [
          "Couldn't tell which tombstone to restore. Refresh and try again.",
        ],
      };
    }
    const confirm = readStr(raw, "confirm");
    if (confirm !== TOMBSTONE_RESTORE_CONFIRM_PHRASE) {
      return {
        ok: false,
        errors: [
          `Type ${TOMBSTONE_RESTORE_CONFIRM_PHRASE} exactly to confirm restoring the record.`,
        ],
      };
    }
    return { ok: true, value: { tombstoneId } };
  },
  rpc: async (client, value) => {
    const { data, error } = await adminJsonRpc(
      client,
      "super_admin_restore_tombstone",
      { p_tombstone_id: value.tombstoneId }
    );
    if (error) return { data: null, error };
    const doc = isRecord(data) ? data : {};
    if (typeof doc.entity_id !== "string") return { data: null, error: null };
    return {
      data: {
        tombstoneId: value.tombstoneId,
        entityType: typeof doc.entity_type === "string" ? doc.entity_type : "",
        entityId: doc.entity_id,
        relinked: asNumber(doc.relinked),
        skipped: asNumber(doc.skipped),
      },
      error: null,
    };
  },
  result: (data) => data,
  revalidate: () => REVALIDATE_PATHS,
  noDataError: "The restore did not complete. Please try again.",
};

export async function superAdminRestoreTombstone(
  prev: ActionResult<TombstoneRestoreSuccess> | undefined,
  input: unknown
): Promise<ActionResult<TombstoneRestoreSuccess>> {
  return runAdminWriteAction(RESTORE_TOMBSTONE_SPEC, prev, input);
}
