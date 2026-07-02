import type { AuditEventsRow, FollowUpsRow } from "@/types/database";
import type { FollowUpStatus } from "@/types/enums";
import {
  columns,
  wrapError,
  type ReadClient,
  type ReadResult,
  type RowOf,
} from "./read-core";

// Phase 5C.0 — follow-up + guest-follow-up + recent-audit read models.
// Extracted from the retired read-models barrel so the follow-up read domain
// has its own home.

/**
 * Leader-safe follow_ups column list. `admin_private_note` is intentionally
 * **omitted** here so leader read paths never return it, even though the
 * table-level RLS SELECT policy currently exposes the column to any caller
 * with row access. This constant is the **defensive privacy boundary** for
 * the `/leader` surface.
 *
 * Privacy contract (Phase 5C.0 / 5C.1):
 *  - Every leader-facing query against `follow_ups` MUST select via this
 *    constant (or a narrower allowlist), never `select("*")`.
 *  - Every leader-facing helper MUST return `LeaderFollowUpRow` (which omits
 *    `admin_private_note` at the type level — see below).
 *  - Column-level RLS / a leader-safe Postgres view is documented as a
 *    future hardening item in `docs/PHASE_5C_1_PRIVACY_HARDENING.md`. Until
 *    that lands, this allowlist + type omission is the boundary.
 *
 * If you change this list the row type follows automatically (it is derived,
 * not hand-maintained); re-run the verification grep in
 * `docs/PHASE_5C_1_VERIFICATION.md`.
 */

/**
 * The leader-safe **key universe** for `follow_ups`: every column except the
 * admin-only `admin_private_note`. Binding {@link LEADER_FOLLOW_UP_COLUMNS} to
 * this type via `columns<…>()` is what makes adding `admin_private_note` to the
 * leader list a **compile error** (it is not a key of this type), not merely a
 * verification-grep failure. This is the type-level half of the boundary; the
 * derived `.select` string is the runtime half — both come from one list now.
 */
type LeaderSafeFollowUp = Omit<FollowUpsRow, "admin_private_note">;

export const LEADER_FOLLOW_UP_COLUMNS = columns<LeaderSafeFollowUp>()(
  "id",
  "type",
  "title",
  "related_group_id",
  "related_member_id",
  "related_guest_id",
  "assigned_to",
  "priority",
  "due_date",
  "status",
  "leader_visible_note",
  "created_at",
  "updated_at",
  "completed_at"
);

/**
 * Leader-safe row type for `follow_ups`, **derived** from
 * {@link LEADER_FOLLOW_UP_COLUMNS} so it cannot drift from what is actually
 * selected. Any helper that fetches follow-ups for a leader-facing page MUST
 * return this type; by construction it never includes `admin_private_note`.
 */
export type LeaderFollowUpRow = RowOf<typeof LEADER_FOLLOW_UP_COLUMNS>;

/**
 * Admin follow-ups column allowlist. Unlike {@link LEADER_FOLLOW_UP_COLUMNS}
 * this one **deliberately includes `admin_private_note`** — it is the
 * admin-only surface. Bound to the full `FollowUpsRow` via the same
 * `columns<…>()` primitive, so the admin-private exposure stays explicit at the
 * read seam and the row type is derived (not a parallel hand-maintained Pick).
 */
const ADMIN_FOLLOW_UP_COLUMNS = columns<FollowUpsRow>()(
  "id",
  "type",
  "title",
  "related_group_id",
  "related_member_id",
  "related_guest_id",
  "assigned_to",
  "priority",
  "due_date",
  "status",
  "leader_visible_note",
  "admin_private_note",
  "created_at"
);

/**
 * Domain read-model for the `/admin/follow-ups` directory, **derived** from
 * {@link ADMIN_FOLLOW_UP_COLUMNS}. Includes the admin-only `admin_private_note`
 * by design.
 */
export type AdminFollowUpEntry = RowOf<typeof ADMIN_FOLLOW_UP_COLUMNS>;

/**
 * **Admin-only** follow-ups reader. Returns the full row including
 * `admin_private_note` and is intended for `/admin/follow-ups` and other
 * admin server contexts only.
 *
 * Do **not** call from any leader code path (`app/(protected)/leader/`,
 * `components/leader/`, `lib/leader/`). Leader paths must use
 * {@link fetchFollowUpsForLeader} which selects through
 * {@link LEADER_FOLLOW_UP_COLUMNS} and returns {@link LeaderFollowUpRow}.
 */
export async function fetchFollowUpsForAdmin(
  client: ReadClient,
  options: { statuses?: FollowUpStatus[]; limit?: number } = {}
): Promise<ReadResult<AdminFollowUpEntry[]>> {
  let query = client
    .from("follow_ups")
    .select(ADMIN_FOLLOW_UP_COLUMNS.select)
    .order("priority", { ascending: false })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (options.statuses && options.statuses.length > 0) {
    query = query.in("status", options.statuses);
  }
  if (options.limit) query = query.limit(options.limit);
  const { data, error } = await query
    .range(0, 9999)
    .returns<AdminFollowUpEntry[]>();
  if (error)
    return { data: null, error: wrapError("fetchFollowUpsForAdmin", error) };
  return { data: data ?? [], error: null };
}

/**
 * Leader-safe follow-ups reader. Selects via {@link LEADER_FOLLOW_UP_COLUMNS}
 * (which omits `admin_private_note`) and returns {@link LeaderFollowUpRow}.
 * Visibility: rows where `assigned_to = profileId` OR `related_group_id` is
 * in the caller's active leader/co_leader assignments. The OR clause is
 * enforced both here (in the PostgREST `or(...)` predicate) and at the RLS
 * layer by the Phase 4 `follow_ups_leader_read` policy.
 */
export async function fetchFollowUpsForLeader(
  client: ReadClient,
  options: { profileId: string; assignedGroupIds: readonly string[] }
): Promise<ReadResult<LeaderFollowUpRow[]>> {
  const { profileId, assignedGroupIds } = options;
  // Build an OR clause: assigned_to = me, OR related_group_id IN my groups.
  // We always include the assigned_to predicate; the group clause is added
  // only when there is at least one assigned group, so leaders with zero
  // assignments still see follow-ups owned personally.
  const orParts = [`assigned_to.eq.${profileId}`];
  if (assignedGroupIds.length > 0) {
    // PostgREST `in.(uuid,uuid,...)` -- uuids are safe identifiers, no quoting needed.
    orParts.push(`related_group_id.in.(${assignedGroupIds.join(",")})`);
  }
  const { data, error } = await client
    .from("follow_ups")
    .select(LEADER_FOLLOW_UP_COLUMNS.select)
    .or(orParts.join(","))
    .order("priority", { ascending: false })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .returns<LeaderFollowUpRow[]>();
  if (error)
    return { data: null, error: wrapError("fetchFollowUpsForLeader", error) };
  return { data: data ?? [], error: null };
}

// Counts open + in_progress follow-ups per guest. Single query, grouped
// client-side so the guest list stays free of N+1 round trips.
export async function fetchGuestFollowUpCounts(
  client: ReadClient,
  guestIds: string[]
): Promise<ReadResult<Map<string, number>>> {
  if (guestIds.length === 0) return { data: new Map(), error: null };
  const { data, error } = await client
    .from("follow_ups")
    .select("related_guest_id, status")
    .in("related_guest_id", guestIds)
    .in("status", ["open", "in_progress"])
    .returns<{ related_guest_id: string | null; status: FollowUpStatus }[]>();
  if (error)
    return { data: null, error: wrapError("fetchGuestFollowUpCounts", error) };
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    if (!row.related_guest_id) continue;
    counts.set(
      row.related_guest_id,
      (counts.get(row.related_guest_id) ?? 0) + 1
    );
  }
  return { data: counts, error: null };
}

// Returns { id, full_name } for guests the caller can see via RLS. Leaders
// only see guests tied to a group they lead; admins see all. The UI uses
// the returned set to render guest names on follow-up cards safely (any
// guest id missing from the set is rendered as "Guest" without a name).
export async function fetchGuestNamesByIds(
  client: ReadClient,
  guestIds: string[]
): Promise<ReadResult<Map<string, string>>> {
  if (guestIds.length === 0) return { data: new Map(), error: null };
  const { data, error } = await client
    .from("guests")
    .select("id, full_name")
    .in("id", guestIds)
    .returns<{ id: string; full_name: string }[]>();
  if (error)
    return { data: null, error: wrapError("fetchGuestNamesByIds", error) };
  return {
    data: new Map((data ?? []).map((r) => [r.id, r.full_name])),
    error: null,
  };
}

// Column allowlist for the recent-audit reader (#495); every AuditEventsRow
// column (the activity feeds render actor attribution + metadata), pinned by
// a colocated test so a future audit column cannot silently widen this read.
export const AUDIT_EVENT_COLUMNS = [
  "id",
  "actor_profile_id",
  "action",
  "entity_type",
  "entity_id",
  "metadata",
  "created_at",
  "actor_name",
  "actor_email",
] as const satisfies readonly (keyof AuditEventsRow)[];

const AUDIT_EVENT_SELECT = AUDIT_EVENT_COLUMNS.join(", ");

export async function fetchRecentAuditEvents(
  client: ReadClient,
  options: { limit?: number; actionsLike?: string | string[] } = {}
): Promise<ReadResult<AuditEventsRow[]>> {
  const limit = options.limit ?? 25;
  let query = client
    .from("audit_events")
    .select(AUDIT_EVENT_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (options.actionsLike) {
    if (Array.isArray(options.actionsLike)) {
      // PostgREST OR syntax. Each pattern becomes `action.like."<value>"`
      // and they're joined by commas. The value must be wrapped in double
      // quotes when it contains a `.` (or `,`, `(`, `)`, `:`) because the
      // PostgREST grammar uses unquoted dots as `column.operator.value`
      // separators -- without quotes, a pattern like `admin.%` is parsed
      // as four tokens and rejected at the API boundary.
      // Reject patterns that themselves contain `"`, `,`, or `(` so we
      // don't end up constructing a malformed filter expression.
      for (const pat of options.actionsLike) {
        if (/["(),]/.test(pat)) {
          return {
            data: null,
            error: wrapError(
              "fetchRecentAuditEvents",
              new Error(`unsafe actionsLike pattern: ${pat}`)
            ),
          };
        }
      }
      const orExpr = options.actionsLike
        .map((pat) => `action.like."${pat}"`)
        .join(",");
      query = query.or(orExpr);
    } else {
      query = query.like("action", options.actionsLike);
    }
  }
  const { data, error } = await query.returns<AuditEventsRow[]>();
  if (error)
    return { data: null, error: wrapError("fetchRecentAuditEvents", error) };
  return { data: data ?? [], error: null };
}
