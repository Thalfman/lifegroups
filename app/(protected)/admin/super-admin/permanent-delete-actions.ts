"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSuperAdminSession } from "@/lib/auth/session";
import type { AppSupabaseClient } from "@/lib/supabase/types";
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
import { readFormPayloadStringified } from "@/lib/shared/form-data";
import { log } from "@/lib/observability/logger";
import { adminJsonRpc, adminRpc } from "@/lib/admin/rpc";
import {
  buildErrorLines,
  extractErrorBody,
  makeMapFnError,
  makeTokenForStatus,
} from "@/lib/admin/edge-fn-error";
import {
  PERMANENT_DELETE_CONFIRM_PHRASE,
  TOMBSTONE_RESTORE_CONFIRM_PHRASE,
  requireConfirmPhrase,
  type DeletionPreflight,
  type DeletionBlocker,
  type PermanentDeleteSuccess,
  type TombstoneRestoreSuccess,
} from "@/lib/admin/danger-zone";
import {
  findPermanentDeletionEntity,
  findPermanentDeletionEntityByTable,
  isInlineDeletableEntityType,
  PERMANENT_DELETION_PAGE_SIZE,
  type PermanentDeletionTargetPage,
} from "@/lib/admin/permanent-deletion";

const REVALIDATE_PATHS = ["/admin/super-admin", "/admin"] as const;
const PROFILE_DELETE_REVALIDATE_PATHS = [
  "/admin/super-admin",
  "/admin/people",
  "/admin",
] as const;

// redirect(), notFound(), and related Next control-flow APIs throw an object
// whose digest the framework must receive. Keep this local instead of importing
// Next's private `next/dist` predicate.
function isNextNavigationError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const digest = (error as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") ||
      digest === "NEXT_NOT_FOUND" ||
      digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"))
  );
}

function revalidateProfileDeletePaths(): void {
  for (const path of PROFILE_DELETE_REVALIDATE_PATHS) {
    try {
      revalidatePath(path);
    } catch (error) {
      if (isNextNavigationError(error)) throw error;
      // The DB/Auth deletion has committed. Cache refresh is post-commit work,
      // so report only stable, non-sensitive fields and keep refreshing the
      // remaining surfaces without turning success into a misleading failure.
      log.warn({
        event: "action_revalidation_failed",
        route_or_action: "super_admin.permanent_delete_profile",
        outcome: "fail",
        error_code: "revalidation_failed",
        revalidate_path: path,
      });
    }
  }
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

// Target rows are intentionally loaded only after the operator chooses an
// entity type. One extra row determines whether a next page exists without a
// count query; the stable per-entity ordering lives in the curated registry.
export async function superAdminLoadPermanentDeletionTargets(
  _prev: ActionResult<PermanentDeletionTargetPage> | undefined,
  input: unknown
): Promise<ActionResult<PermanentDeletionTargetPage>> {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readFormPayloadStringified(input);
  const entityType = readStr(raw, "entityType");
  const entity = findPermanentDeletionEntity(entityType);
  if (!entity) return actionFail(["That isn't a deletable record type."]);

  const page = Number(readStr(raw, "page"));
  if (!Number.isSafeInteger(page) || page < 0) {
    return actionFail(["That target page isn't valid. Refresh and try again."]);
  }

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const offset = page * PERMANENT_DELETION_PAGE_SIZE;
  try {
    const rows = await entity.fetchItems(client, {
      offset,
      limit: PERMANENT_DELETION_PAGE_SIZE + 1,
    });
    const hasNext = rows.length > PERMANENT_DELETION_PAGE_SIZE;
    return actionOk({
      entityType,
      page,
      items: rows.slice(0, PERMANENT_DELETION_PAGE_SIZE),
      hasPrevious: page > 0,
      hasNext,
    });
  } catch {
    return actionFail([
      `${entity.pluralLabel} could not be loaded. Try again in a moment.`,
    ]);
  }
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
    ? doc.blockers.filter(isRecord).map((b) => {
        const table = typeof b.table === "string" ? b.table : "";
        const entity = findPermanentDeletionEntityByTable(table);
        const ids: string[] = [];
        return {
          table,
          column: typeof b.column === "string" ? b.column : "",
          action: typeof b.action === "string" ? b.action : "",
          count: asNumber(b.count),
          ids,
          entityType: entity?.entityType ?? null,
        };
      })
    : [];
  const setNull = Array.isArray(doc.set_null)
    ? doc.set_null.filter(isRecord).map((s) => ({
        table: typeof s.table === "string" ? s.table : "",
        column: typeof s.column === "string" ? s.column : "",
        count: asNumber(s.count),
      }))
    : [];
  // #880: the operational assignment rows a profile purge removes
  // in-transaction (captured on the tombstone) — announced, never blocking.
  const cleanup = Array.isArray(doc.cleanup)
    ? doc.cleanup.filter(isRecord).map((c) => ({
        table: typeof c.table === "string" ? c.table : "",
        column: typeof c.column === "string" ? c.column : "",
        count: asNumber(c.count),
      }))
    : [];
  return {
    deletable: doc.deletable === true,
    confidential: doc.confidential === true,
    forbidden: doc.forbidden === true,
    blockers,
    setNull,
    cleanup,
  };
}
// The preflight RPC owns the authoritative blocker count. For blocker tables
// that are also curated deletion targets, add up to ten stable IDs through the
// caller's normal RLS-protected session. A denied/failed detail read never
// changes the count or deletability decision; it only withholds shortcuts.
async function enrichBlockerIds(
  client: AppSupabaseClient,
  blockers: DeletionBlocker[],
  targetId: string
): Promise<DeletionBlocker[]> {
  return Promise.all(
    blockers.map(async (blocker) => {
      const entity = findPermanentDeletionEntityByTable(blocker.table);
      if (!entity || !blocker.column) return blocker;

      const { data, error } = await client
        .from(entity.tableName)
        .select("id")
        .eq(blocker.column, targetId)
        .order("id", { ascending: true })
        .limit(10);
      if (error) return blocker;

      const rows = (data ?? []) as unknown as Array<{ id: unknown }>;
      const ids = rows
        .map((row) => row.id)
        .filter((id): id is string => typeof id === "string" && isUuid(id));
      return { ...blocker, ids };
    })
  );
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

  const raw = readFormPayloadStringified(input);
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
  const parsed = parsePreflight(data);
  const blockers = await enrichBlockerIds(client, parsed.blockers, target.id);
  return actionOk({
    ...parsed,
    blockers,
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
    const confirmError = requireConfirmPhrase(
      raw.confirm,
      PERMANENT_DELETE_CONFIRM_PHRASE,
      `Type ${PERMANENT_DELETE_CONFIRM_PHRASE} exactly to confirm permanent deletion.`
    );
    if (confirmError) return { ok: false, errors: [confirmError] };
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

type ProfilePurgeEdgeResponse = {
  ok: boolean;
  code?: string;
  profileId?: string;
  tombstoneId?: string;
  authUserState?: "deleted" | "already_missing" | "not_linked";
  warnings?: string[];
  errors?: string[];
  missing?: string[];
};

const PROFILE_PURGE_ERROR_MESSAGES: Record<string, string> = {
  missing_authorization_header:
    "Your session token didn't reach the purge function. Sign out, sign back in, and retry.",
  invalid_or_expired_session:
    "Your session is invalid or expired. Sign out, sign back in, and retry.",
  profile_not_found:
    "Your auth user has no linked app profile. Ask another super admin to repair it.",
  profile_not_active:
    "Your Super-Admin profile is inactive. Ask another super admin to reactivate it.",
  super_admin_required: "Only a Super Admin can permanently delete an account.",
  invalid_payload: "The selected profile is invalid. Refresh and try again.",
  invalid_input: "The selected profile is invalid. Refresh and try again.",
  profile_lookup_failed:
    "The purge function could not verify your Super-Admin profile. Retry shortly.",
  duplicate_profiles_for_auth_user:
    "Your sign-in is linked to more than one profile. Repair that account link before retrying.",
  forbidden_target: "Super-Admin profiles cannot be permanently deleted.",
  has_confidential_records:
    "This person has confidential records and cannot be permanently deleted; disable the account instead.",
  has_blocking_dependents:
    "This person still has dependent records that block permanent deletion.",
  missing_entity:
    "That profile no longer exists and has no retriable purge record.",
  db_purge_failed:
    "The profile purge did not complete. No Auth deletion was attempted.",
  auth_delete_failed:
    "The profile was purged, but its sign-in account was not removed. Retry this action with the same profile; the function will resume from the tombstone.",
  audit_record_failed:
    "The sign-in account was removed, but its audit record was not finalized. Retry this action to finish the audit step.",
  missing_edge_function_env:
    "The purge function is missing required Supabase secrets. Check its deployment configuration.",
  function_not_deployed_or_wrong_name:
    "The purge function is not deployed. Deploy purge-profile-auth and retry.",
  invalid_json_body: "The purge function received an invalid request.",
  method_not_allowed:
    "The purge function received an unsupported request method.",
};

const mapProfilePurgeError = makeMapFnError(PROFILE_PURGE_ERROR_MESSAGES);
const profilePurgeTokenForStatus = makeTokenForStatus({
  unauthorized: "invalid_or_expired_session",
  forbidden: "super_admin_required",
  notFound: "function_not_deployed_or_wrong_name",
  serverError: "db_purge_failed",
  fallback: "db_purge_failed",
});

function profilePurgeErrorLines(
  source: Partial<ProfilePurgeEdgeResponse>,
  status: number | null
): string[] {
  const code =
    source.code ?? source.errors?.[0] ?? profilePurgeTokenForStatus(status);
  return buildErrorLines({
    status,
    code,
    mapFnError: mapProfilePurgeError,
    messages: PROFILE_PURGE_ERROR_MESSAGES,
    missing: source.missing,
    extras: source.errors,
    warnings: source.warnings,
  });
}

// Profile targets cross the approved service-role boundary, so they deliberately
// stay outside the Write Action Runner (ADR 0035). The Edge Function re-checks
// the caller and owns DB purge -> Auth delete -> audit/retry orchestration.
async function runProfilePermanentDelete(
  input: unknown,
  options: {
    requireTypedConfirmation: boolean;
  }
): Promise<ActionResult<PermanentDeleteSuccess>> {
  const auth = await requireSuperAdminSession();
  if (!auth.ok) return actionFail([auth.error]);

  const raw = readFormPayloadStringified(input);
  const target = readTarget(raw);
  if (!target.ok) return actionFail([target.error]);
  if (options.requireTypedConfirmation) {
    const confirmError = requireConfirmPhrase(
      raw.confirm,
      PERMANENT_DELETE_CONFIRM_PHRASE,
      `Type ${PERMANENT_DELETE_CONFIRM_PHRASE} exactly to confirm permanent deletion.`
    );
    if (confirmError) return actionFail([confirmError]);
  } else if (!isInlineDeletableEntityType(target.entityType)) {
    return actionFail(["That record type can't be deleted from here."]);
  }

  const client = await createSupabaseServerClient();
  if (!client) return actionFail(["Database is not configured."]);

  const { data, error } =
    await client.functions.invoke<ProfilePurgeEdgeResponse>(
      "purge-profile-auth",
      { body: { profileId: target.id } }
    );
  if (error) {
    const { status, body } =
      await extractErrorBody<ProfilePurgeEdgeResponse>(error);
    return actionFail(profilePurgeErrorLines(body ?? {}, status));
  }
  if (!data) return actionFail(["The purge function returned no response."]);
  if (!data.ok) return actionFail(profilePurgeErrorLines(data, 200));
  if (
    data.profileId !== target.id ||
    !data.tombstoneId ||
    !isUuid(data.tombstoneId)
  ) {
    return actionFail([
      "The purge function reported success but returned incomplete data. Retry is safe.",
    ]);
  }

  revalidateProfileDeletePaths();
  return actionOk(deleteSuccess(data.tombstoneId, target));
}

export async function superAdminPermanentDelete(
  prev: ActionResult<PermanentDeleteSuccess> | undefined,
  input: unknown
): Promise<ActionResult<PermanentDeleteSuccess>> {
  const raw = readFormPayloadStringified(input);
  if (readStr(raw, "entityType") === "profile") {
    return runProfilePermanentDelete(raw, {
      requireTypedConfirmation: true,
    });
  }
  return runAdminWriteAction(PERMANENT_DELETE_SPEC, prev, raw);
}

function inlineDeleteRevalidatePaths(raw: Record<string, unknown>): string[] {
  const path = readStr(raw, "path");
  return path.startsWith("/admin") ? [path, "/admin"] : ["/admin"];
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
  revalidate: (_value, raw) => inlineDeleteRevalidatePaths(raw),
  noDataError: "The deletion did not complete. Please try again.",
};

export async function superAdminInlineDelete(
  prev: ActionResult<PermanentDeleteSuccess> | undefined,
  input: unknown
): Promise<ActionResult<PermanentDeleteSuccess>> {
  const raw = readFormPayloadStringified(input);
  if (readStr(raw, "entityType") === "profile") {
    return runProfilePermanentDelete(raw, {
      requireTypedConfirmation: false,
    });
  }
  return runAdminWriteAction(INLINE_DELETE_SPEC, prev, raw);
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
    const confirmError = requireConfirmPhrase(
      raw.confirm,
      TOMBSTONE_RESTORE_CONFIRM_PHRASE,
      `Type ${TOMBSTONE_RESTORE_CONFIRM_PHRASE} exactly to confirm restoring the record.`
    );
    if (confirmError) return { ok: false, errors: [confirmError] };
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
