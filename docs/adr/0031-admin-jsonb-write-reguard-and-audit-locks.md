# Admin jsonb-write RPCs: TS owns shape, DB re-guards top-level + serialises the audit snapshot

The `admin_*` jsonb-write family — the SECURITY DEFINER RPCs that persist a jsonb
config and write a paired `audit_events` row — shares one defensive shape. A
[Codex review on #414](https://github.com/Thalfman/lifegroups/pull/414) raised two
P2 points against `admin_set_audience_readiness_rule` that both turned out to be
**family-wide conventions, not one-RPC bugs** (#415). This ADR records the
direction for the whole family so the conventions stay consistent and reviewers
stop re-litigating them per RPC.

**Status:** Accepted (#415). One fix — the audit advisory lock — was applied to
`admin_set_audience_readiness_rule` in #414 ahead of this decision; this ADR
generalises it.

## Two layers, two owners

Every admin jsonb-write RPC splits validation across two tiers:

- The **TS validator/decoder is the authoritative shape-validator.** It owns the
  full nested shape — the pillar objects, the criterion arrays, the numeric
  bounds — and is unit-tested without a DB (e.g. `lib/admin/validation/`,
  `lib/admin/cell-readiness.ts`). This is the ADR-0001 contract: the action
  supplies pure data to `runAdminWriteAction`, and the validator is the pure
  function that pins the shape. ADR-0005 → ADR-0012 settled _where_ that
  validator lives (centralised, clustered behind a barrel); they did **not** speak
  to how deep the DB re-guards.
- The **RPC re-guards** authz (RLS + `auth_is_admin()` / `auth_profile_id()`),
  the **top-level** jsonb shape (`jsonb_typeof(p_x) <> 'object'`, or `'array'`
  for the rubric), and writes the audit row. It is the DB trust boundary because
  EXECUTE is granted to any authenticated admin, so a direct caller can reach it
  without going through the TS client.

## Decision 1 — the DB re-guards top-level shape only; it does **not** deep-validate nested jsonb

We keep the split as-is and **document it as intentional**, rather than teaching
the DB tier to deep-validate nested fragments. Concretely: the RPCs continue to
re-guard only the top-level `jsonb_typeof`, and the TS decoder remains the single
authoritative validator of nested shape. We explicitly reject both alternatives
that would push nested validation into plpgsql:

- **Per-RPC nested re-validation** — duplicating the decoder in ~17 functions.
  It would drift from the TS source of truth the moment either side changed.
- **A shared plpgsql validator helper** — one source, but still a _second_
  implementation of the same shape rules in a second language, kept in lockstep
  with the TS decoder by hand. The maintenance cost outweighs the benefit.

### The residual risk we are accepting

A trusted, authenticated admin calling an RPC **out-of-band** (bypassing the TS
client) can persist a top-level-valid object whose nested fragments are malformed
— e.g. `{"interest":{"min":"oops"}}`. On read, the defensive decoder treats a
_present-but-malformed_ pillar as an override filling built-in defaults, so a bad
direct write can override a tier instead of inheriting it. This is **low
severity** and accepted:

- it requires a trusted admin acting out-of-band — not reachable from the app UI;
- the action is **audited** (the paired `audit_events` row records actor +
  before/after); and
- the decoder **degrades safely** — a malformed fragment falls back to defaults;
  there is no crash, no corruption, no privilege change.

If that risk profile ever changes (e.g. a non-admin path reaches one of these
RPCs, or a malformed fragment could escalate rather than degrade), revisit and
add nested validation **once, in TS, behind the existing decoder** — never as a
plpgsql fork.

## Decision 2 — pre-read+upsert RPCs must serialise concurrent same-key writers before the audit snapshot

An RPC that snapshots the prior value with `SELECT … FOR UPDATE` and then upserts
via `ON CONFLICT DO UPDATE` has a first-insert race: for a brand-new key,
`FOR UPDATE` locks nothing (no row exists yet), so two concurrent writers both
pre-read `NULL`, and the `ON CONFLICT` loser overwrites the winner while auditing
`before: null`. Only the **audited `before`** is affected — never the persisted
data — and the window is narrow (single-admin config writes), so this too is low
severity. But the audit trail is the point of the paired-row discipline, so we
fix it.

**Invariant:** any admin RPC that audits a before/after pair by pre-reading the
conflict row and then upserting must **serialise concurrent same-key writers
before the snapshot.** Three mechanisms satisfy it; an RPC needs exactly one:

1. a `FOR UPDATE` lock on a **parent row** whose identity covers the conflict key
   (e.g. locking `groups[group_id]` when the conflict key is
   `(group_id, period_month)`);
2. an `INSERT … ON CONFLICT DO NOTHING` **pre-create** before the snapshot, so the
   row is guaranteed to exist (concurrent writers serialise on the unique index);
   or
3. a per-key `pg_advisory_xact_lock(hashtext('<table>'), hashtext('<key text>'))`
   taken before the snapshot — for RPCs that lock only their own conflict row and
   so have nothing else to serialise on.

`admin_set_audience_readiness_rule` adopted mechanism (3) in #414. A review of the
whole pre-read+upsert family (#415) found **four** other RPCs that lock only their
own conflict row and so needed it; they are brought up to the exemplar in
`…_phase_groups7_audit_before_advisory_locks.sql`. Every other sibling already
satisfies the invariant via (1) or (2) and is intentionally left unchanged — no
redundant locks.

### Per-RPC record

RPCs using mechanism (3) — per-key advisory lock (the bare pre-read+upsert set):

| RPC                                       | Conflict key                         | Note               |
| ----------------------------------------- | ------------------------------------ | ------------------ |
| `admin_set_audience_readiness_rule`       | `(ministry_year, audience_category)` | lock added in #414 |
| `admin_set_readiness_rule`                | `(ministry_year)`                    | lock added in #415 |
| `admin_set_multiplication_config`         | `(group_type, ministry_year)`        | lock added in #415 |
| `admin_set_health_rubric`                 | `(kind)`                             | lock added in #415 |
| `admin_record_church_attendance_snapshot` | `(snapshot_date)`                    | lock added in #415 |

RPCs already serialised by mechanism (1)/(2) — left unchanged:

| RPC                                    | Conflict key                       | Already serialised by                           |
| -------------------------------------- | ---------------------------------- | ----------------------------------------------- |
| `admin_set_cell_trigger_overrides`     | `(audience_category, category_id)` | `FOR UPDATE` on `group_categories[category_id]` |
| `admin_set_category_type_cell`         | `(audience_category, category_id)` | `FOR UPDATE` on `group_categories[category_id]` |
| `admin_set_category_type_target_count` | `(audience_category, category_id)` | `FOR UPDATE` on `group_categories[category_id]` |
| `admin_set_group_health_ratings`       | `(group_id, period_month)`         | `FOR UPDATE` on `groups[group_id]`              |
| `admin_upsert_group_health_assessment` | `(group_id, period_month)`         | `FOR UPDATE` on `groups[group_id]`              |
| `admin_set_group_rubric_grade`         | `(group_id, ministry_year)`        | `FOR UPDATE` on `groups[group_id]`              |
| `admin_set_leader_rubric_grade`        | `(profile_id, ministry_year)`      | `FOR UPDATE` on `profiles[profile_id]`          |
| `admin_upsert_group_metric_settings`   | `(group_id)`                       | `FOR UPDATE` on `groups[group_id]`              |
| `admin_upsert_shepherd_care_profile`   | `(shepherd_profile_id)`            | `INSERT … ON CONFLICT DO NOTHING` pre-create    |

## Consequences

- New admin jsonb-write RPCs follow both decisions: top-level `jsonb_typeof`
  re-guard only (nested shape stays in TS), and one of the three serialisation
  mechanisms before any audited pre-read+upsert. A bare pre-read+upsert (no parent
  row, no pre-create) **must** take the per-key advisory lock.
- The locks are applied via forward `CREATE OR REPLACE FUNCTION` migrations that
  reproduce each function verbatim plus the lock; no shipped migration is edited,
  and `CREATE OR REPLACE` preserves each function's EXECUTE lockdown and COMMENT.
- Migration-safety tests assert the advisory-lock invariant for the bare set (lock
  present, before the snapshot) alongside the existing SECURITY DEFINER + paired-
  audit assertions. Mechanisms (1)/(2) are structural and verified by the per-RPC
  record above rather than a static substring check.
