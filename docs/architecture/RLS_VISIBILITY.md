# RLS Read-Visibility Matrix

**What each tier can and cannot `SELECT`.** This is the source of truth for the
admin RLS visibility audit — _everything an admin should see, they can; everything
they shouldn't, they can't._ It is kept honest by a regression sweep
(`lib/admin/__tests__/admin-rls-visibility-sweep.test.ts`) that asserts every
RLS-enabled table against the class declared here and **fails the build if a new
RLS table is added without classifying it**.

The oversight ladder (each tier sees what the tier below sees, and more):

> **Super Admin (Tom) ▸ Ministry Admin (Julian) ▸ Over-Shepherd ▸ Leader**

An editable diagram of this ladder and its two exceptions lives at
[`oversight-ladder.drawio`](./oversight-ladder.drawio) (open in
[diagrams.net](https://app.diagrams.net/)).

Read access is enforced in Postgres by RLS `USING` predicates, gating on
`profiles.role` via helper functions — never on hardcoded UUIDs/emails:

- `auth_is_admin()` → `role in ('super_admin','ministry_admin')`.
- `auth_is_admin_or_staff()` → identical to `auth_is_admin()` since `staff_viewer`
  was retired (`20260531140000`); the name is kept so the many SELECT policies
  that call it need no change.
- `auth_role() = 'super_admin'` → Super Admin only.
- `auth_is_leader_of(group_id)`, `over_shepherd_covered_profile_ids()`,
  `auth_over_shepherd_id()` → group / coverage scoping.
- `auth_profile_id()` → the caller's own profile id (self / author / creator).

## Visibility classes

| Class                      | Who may `SELECT`                                                | Predicate shape                                        |
| -------------------------- | --------------------------------------------------------------- | ------------------------------------------------------ |
| **ADMIN_READ**             | Super Admin + Ministry Admin (identical)                        | `auth_is_admin()`                                      |
| **CONFIG_SCOPED**          | Admins read all keys; non-admins read one shared key            | `auth_is_admin() or setting_key = '...'`               |
| **SUPER_ADMIN_ONLY**       | Super Admin only — **Ministry Admin excluded**                  | `auth_role() = 'super_admin'`                          |
| **LEADER_SCOPED**          | Admins read all; a Leader reads their group's rows              | `auth_is_admin_or_staff() or auth_is_leader_of(...)`   |
| **OVER_SHEPHERD_SCOPED**   | Admins read all; an Over-Shepherd reads their coverage          | `auth_is_admin[...]() or <coverage>`                   |
| **CARE_NOTE_EXCEPTION**    | Author always; ladder only on the **same active grant**         | author `or (auth_is_admin() and grant)`                |
| **PRIVATE_NOTE_EXCEPTION** | Creator-only Ministry Admin — **Super Admin excluded**          | `auth_role() = 'ministry_admin' and created_by = self` |
| **NO_READ**                | Nobody via SQL — reachable only through `SECURITY DEFINER` RPCs | _(no SELECT policy)_                                   |

## The matrix (53 RLS-enabled tables)

### ADMIN_READ — both admins, nothing below

`group_metric_settings`, `shepherd_care_admin_notes`, `shepherd_care_follow_ups`,
`leader_pipeline`, `group_categories`, `category_type_targets`,
`member_care_profiles`, `member_care_interactions`, `health_rubrics`,
`prospects`, `leader_rubric_grades`, `group_rubric_grades`,
`group_health_assessments`, `church_attendance_snapshots`,
`multiplication_candidates`, `multiplication_config`,
`multiplication_readiness_rule`, `audience_readiness_rule`, `over_shepherds`,
`launch_planning_scenarios`, `attention_reset_baselines`,
`activity_reset_baselines`, `note_transparency_grants` (the transparency toggle
table itself is admin-only).

### CONFIG_SCOPED — admins read all keys; non-admins read one shared key

`app_settings` (see the fix note below). Admins read every `setting_key`;
non-admins read **only** `metric_defaults`. `launch_planning_assumptions` (the
fixed leak) and `group_health_rubric` stay admin-only, as does any future key.

### SUPER_ADMIN_ONLY — Ministry Admin excluded

`audit_events`, `audit_events_archive`, `platform_config`, `usage_events`,
`invitations`, `tombstones`, `clean_slate_snapshots`, `history_reset_snapshots`,
`attention_reset_snapshots`.

### LEADER_SCOPED — admins read all; leaders read their group's rows

`groups`, `group_leaders`, `members`, `group_memberships`, `attendance_sessions`,
`attendance_records`, `guests`, `follow_ups`, `group_health_updates`,
`group_status_history`, `group_calendar_events`. _(Consolidated into single
`*_read` policies in `20260602020000`.)_

### OVER_SHEPHERD_SCOPED — admins read all; an OS reads their coverage

`profiles`, `shepherd_care_profiles`, `shepherd_care_interactions`,
`shepherd_coverage_assignments` (an OS reads only their **own active**
assignments).

### CARE_NOTE_EXCEPTION

`care_notes`, `prayer_requests`.

### PRIVATE_NOTE_EXCEPTION

`shepherd_care_private_notes`, `shepherd_care_note_key_slots`.

### NO_READ — RPC-only

`invite_redeem_throttle`.

## The two deliberate exceptions

These are the only places the "higher tiers see everything below" rule is broken
on purpose (see `CONTEXT.md` and ADRs [0002], [0003], [0017], [0020]).

1. **Ministry Admin's Private Care Note** (`shepherd_care_private_notes` /
   `_key_slots`, ADR 0002/0003). Readable **only by the Ministry Admin who
   created it** — `auth_role() = 'ministry_admin' and created_by_profile_id =
auth_profile_id()`. The **Super Admin cannot read it** (the policy never
   references `auth_is_admin()` or `super_admin`). Stored client-side encrypted
   (AES-256-GCM, zero-knowledge); the server never holds plaintext.

2. **Author-private Care Notes / Prayer Requests** (`care_notes`,
   `prayer_requests`, ADR 0017/0020). Sealed to their **author** by default. The
   oversight ladder peeks **only when the per-subject transparency grant is ON**,
   and the **Super Admin is gated on the _same_ grant as the Ministry Admin — no
   broader bypass**. The admin arm is always conjoined with the grant `EXISTS`
   (never a bare `or auth_is_admin()`). The toggle table
   (`note_transparency_grants`) is itself admin-only. The pure resolver
   `lib/admin/care-note-visibility.ts` mirrors this RLS truth table for the UI.

## Intentional asymmetries (not bugs)

- **`SUPER_ADMIN_ONLY` set** — the audit trail (`audit_events`,
  `audit_events_archive`), platform configuration (`platform_config`),
  usage telemetry (`usage_events`), shareable invites (`invitations`), and the
  danger-zone snapshots (`tombstones`, `clean_slate_snapshots`,
  `history_reset_snapshots`, `attention_reset_snapshots`) are Tom-only. The
  ladder puts Super Admin above Ministry Admin, so these being invisible to
  Julian is consistent with the ladder, not a gap.
- **`NO_READ` (`invite_redeem_throttle`)** — RLS on, no SELECT policy; touched
  only inside `SECURITY DEFINER` RPCs.

> ⚠️ **Confirm-intent (no code change):** the audit log and platform config are
> deliberately invisible to the **Ministry Admin**. If Julian should be able to
> read the audit trail, that is a product decision to make explicitly — not a
> silent widening of `audit_events` RLS.

## The `app_settings` fix

`app_settings` was readable by **any authenticated user**
(`app_settings_auth_read` → `using (auth.uid() is not null)`), yet it stores the
`launch_planning_assumptions` row whose `notes` field is admin-only (the LP RPCs
redact it from audit metadata). Migration
`20260629000000_seal_app_settings_to_admin.sql` scopes SELECT **per
`setting_key`**:

```sql
using (public.auth_is_admin() or setting_key = 'metric_defaults')
```

- **Admins** read every key.
- **Non-admins** read **only `metric_defaults`** — the shared cadence /
  check-in-due / health thresholds. Live lower-tier surfaces read this key under
  their own RLS client: the Over-Shepherd care directory
  (`app/(protected)/over-shepherd/page.tsx`) and the Leader check-in page
  (`app/(protected)/leader/[groupId]/checkin/page.tsx`). It is also cached
  cross-request via `unstable_cache` (`lib/supabase/cached-config.ts`), so a
  blanket seal would let a non-admin cache the null fallback for everyone. Keeping
  this key readable preserves those paths.
- **`launch_planning_assumptions`** (the actual leak) and **`group_health_rubric`**
  (read only by `/admin` today) stay admin-only, as does any **future** key
  (default-deny for non-admins).

**Rule going forward:** if a lower tier ever needs another key, add it to the
allowlist, or expose a narrow slice through a `SECURITY DEFINER` RPC — the
precedent is `admin_read_feature_flags()`, which lets a Ministry Admin read the
flags it needs out of the Super-Admin-only `platform_config` without widening that
table's SELECT policy. **Do not widen `app_settings` back to all-authenticated.**

## How this stays tied down

CI has no Postgres (live RLS is verified manually per
`supabase/dev/README.md`), so the matrix is enforced statically over the
migration SQL:

- `lib/admin/__tests__/admin-rls-visibility-sweep.test.ts` — the matrix above as
  a typed table, with (a) a **coverage guard** asserting the matrix equals the set
  of RLS-enabled tables, and (b) per-table positive ("can read") + negative
  ("cannot read") assertions pinned to each policy's authoritative migration.
- `lib/admin/__tests__/app-settings-visibility-migration.test.ts` — the seal.
- Helpers live in `lib/admin/__tests__/migration-safety.ts`
  (`listMigrations`, `tablesWithRlsEnabled`, `selectPolicies`,
  `effectiveSelectPolicies`).

[0002]: ../adr/0002-oversight-ladder-and-leader-gating.md
[0003]: ../adr/0003-private-care-note-encryption.md
[0017]: ../adr/0017-reopen-leader-os-logins-and-care-notes.md
[0020]: ../adr/0020-leader-care-note-is-group-scoped.md
