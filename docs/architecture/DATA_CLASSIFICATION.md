# Data Classification

The single source of truth for **how sensitive each table and column is**, so
later checks (logging redaction, RLS coverage, audit metadata) can enforce it
rather than re-deciding case by case. The taxonomy lives here; the
machine-readable, test-importable manifest lives in
[`lib/security/data-classification.ts`](../../lib/security/data-classification.ts)
and is derived from the real schema (`types/database.ts`, `supabase/migrations/`).

The RLS coverage manifest (issue #693) consumes `sensitiveTables()` from that
module, so this classification is the input that decides which tables **must**
carry an RLS visibility assertion.

## Taxonomy

| Classification         | Examples (this schema)                                                                                                                                               | Storage                      | Access                                          | Logging / audit                         | Retention                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------- | --------------------------------------- | --------------------------- |
| `operational_metadata` | group names, meeting day, category/cell config, rubric definitions, nav/route config                                                                                 | Plaintext                    | Role-scoped                                     | Safe in structured logs if non-personal | Long-lived                  |
| `pii`                  | `profiles`/`members` names, emails, phones; `guests`/`prospects`/`over_shepherds` contact; `household_name`                                                          | Plaintext / normalized       | Role-scoped by ladder + assignment              | Do not log raw values                   | Active + policy window      |
| `sensitive_care`       | `care_notes.body`, `shepherd_care_interactions.notes`, `attendance_sessions.leader_note`, `group_health_assessments.spiritual_growth_note`, `care_sensitivity_flag`  | Restricted rows              | Author / assigned role / grant-gated            | Never log raw text                      | Explicit                    |
| `prayer_request`       | `prayer_requests.body` (+ subject, status, updates)                                                                                                                  | Restricted rows              | Author-private unless grant                     | Never log raw text                      | Explicit                    |
| `admin_private`        | `shepherd_care_admin_notes.admin_summary`, `follow_ups.admin_private_note`, `groups.admin_notes`, `group_metric_settings.admin_metric_notes`, `over_shepherds.notes` | Restricted                   | Creator / Ministry-Admin only                   | Never log raw / decrypted               | Shorter preferred (TBD)     |
| `encrypted_private`    | `shepherd_care_private_notes.{ciphertext,iv}`, `shepherd_care_note_key_slots.*` (wrapped DEK, salts)                                                                 | Encrypted payload + metadata | Creator only — **hidden even from Super Admin** | Logs may include record IDs only        | Explicit                    |
| `audit`                | `audit_events.*`, `audit_events_archive.*`, `group_status_history`                                                                                                   | Append-only                  | Admin / super_admin only                        | No sensitive plaintext                  | Long retention              |
| `invite_auth`          | `invitations.token_hash`, `invite_redeem_throttle.throttle_key`                                                                                                      | Tokenized / hashed           | Narrow admin / Edge Function                    | Never log raw tokens                    | Expire tokens, retain audit |
| `danger_zone_snapshot` | `tombstones.{row_snapshot,set_null_dependents}`, `clean_slate_snapshots.payload`, history/attention reset snapshots                                                  | Restricted                   | Super admin / explicit policy                   | No sensitive plaintext unless approved  | Expire / archive by policy  |
| `policy_tbd`           | unresolved cases (e.g. `account_deletion_requests.reason`)                                                                                                           | Treat as sensitive           | Most restrictive that fits                      | Keep out of logs / audit metadata       | Conservative                |

## Default rule — sensitive until proven otherwise

If a column could contain **pastoral care, prayer, private notes, personal
contact data, tokens, secrets, or freeform user text**, it is sensitive until
proven otherwise. This rule is encoded as `looksSensitiveByName(column)` in the
manifest module, and a test asserts that **no `operational_metadata` column in
the manifest matches the rule** — a sensitive-looking name must be classified as
a sensitive class (or `policy_tbd`). Adding a freeform column without a
classification is therefore a test failure, not a silent leak.

Only `operational_metadata` is non-sensitive; every other classification —
including `policy_tbd` — counts as sensitive (`isSensitive()`), which keeps it
out of logs and audit metadata.

## `policy_tbd` handling

Unknown policy decisions do **not** block. Mark the table/column `policy_tbd` in
the manifest; it is treated as sensitive (kept out of logs/audit metadata) until
classified more narrowly. `policyTbdTables()` surfaces them so the gap is
visible rather than hidden.

## Visibility exceptions (do not regress)

Two deliberate exceptions are reflected in the access column above and enforced
by RLS (see [`RLS_VISIBILITY.md`](./RLS_VISIBILITY.md)):

- **`encrypted_private`** — the Ministry Admin's client-encrypted Private Care
  Note is readable only by its creator, **hidden even from the Super Admin**.
- **`sensitive_care` / `prayer_request` (author-private)** — `care_notes` and
  `prayer_requests` are sealed to their author until the Ministry Admin flips
  that subject's transparency grant, after which the ladder peeks on the same
  grant (no Super-Admin bypass).

## Keeping it current

When a migration adds a table or a freeform/contact/token column, add it to
`lib/security/data-classification.ts`. The manifest test enforces internal
consistency and the default rule; the RLS coverage manifest (#693) will flag a
newly-sensitive table that lacks an RLS assertion.
