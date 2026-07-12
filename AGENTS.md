# LifeGroups Codex Review Guidance

Use Codex review comments for high-signal findings only. Focus on P0/P1 issues and prioritize correctness, privacy, auth, RLS, audit integrity, role boundaries, and broken app behavior.

Do not nitpick style-only issues.

Treat these LifeGroups issues as high priority:

- Service-role usage in Next runtime.
- Broad write RLS policies.
- Writes bypassing narrow `SECURITY DEFINER` RPCs.
- Mutation without `audit_events` in the same DB transaction.
- Hard deletes in normal app workflows.
- `staff_viewer` access expansion.
- Member login/auth assumptions.
- Public preview routes exposing private data.
- Leader-facing exposure of `admin_private_note`.
- Admin-only shepherd-care data exposed to leader routes.
- `select("*")` against privacy-sensitive tables.
- Supabase migrations granting broader access than intended.

Several of these invariants are now **machine-checked** by the fitness suite
(`tests/fitness/**`), which runs in the gating CI lane (`npm run test:run`):
no service-role key in `app/**`/`lib/**`, no `select("*")` in runtime code, no
direct `.from(...).insert|update|delete|upsert` table writes, no hardcoded
email/UUID in `lib/auth/**` or RLS migrations, and every `app/**/actions.ts`
routes through the run-action adapter (or a documented exemption). As of the
2026-06-21 audit follow-up, three review-only rules also became static checks:
**no hard deletes** outside the danger-zone RPCs / the one allowlisted leader
check-in (`no-hard-delete.test.ts`), **no broad RLS** read policy
(`using (true)` / `auth.uid() is not null`, `no-broad-rls.test.ts`), and the
**Care Note TS↔SQL visibility** resolver agreeing with a pinned TS mirror of
the RLS `USING` clause over a shared exhaustive input matrix — behavioral, both
note types, both policies (`care-note-visibility-divergence.test.ts`, ADR
0037). The suite also checks
**audit-pairing on every write RPC** (`write-rpc-audit-pairing.test.ts`),
no-sensitive-data-in-logs / audit plaintext, pinned `SECURITY DEFINER`
`search_path`, RLS coverage completeness, and every write action's
**revalidate-path set** pinned against
`tests/fitness/support/revalidate-path-map.ts`
(`write-action-revalidate-paths.test.ts`). A regression fails the build — but
the scans are static and conservative, so keep reviewing the **semantics** by
hand: audit-pairing content correctness (the right before/after fields), RLS
`USING`-clause meaning beyond the pinned care-note resolver, role boundaries,
and the conventions below.

## Security migration conventions (standing rules)

When adding or reviewing privacy-sensitive migrations, hold these rules — they
encode distinctions a careless copy-paste would get wrong:

- **Super-Admin-only tables gate on the role, not the admin check.** A table
  holding Super-Admin-only data (e.g. `account_deletion_requests`, the
  clean-slate / history-reset snapshots) gates SELECT on
  `public.auth_role() = 'super_admin'`, **not** `public.auth_is_admin()` (which
  also admits the Ministry Admin). It carries no write policy — writes flow
  through a `SECURITY DEFINER` RPC that derives the actor server-side. (SEC-4.)
- **Care-note tables: grant-scoped vs creator-scoped are opposite rules.** The
  `care_notes` / `prayer_requests` family (migration `20260608090000`) lets the
  oversight ladder peek **once a transparency grant exists** (`auth_is_admin()`
  - grant; Super Admin sees exactly what the Ministry Admin does, no broader
    bypass). The SC.4 **private** care notes (`20260529008000`) are the inverse:
    **creator-scoped**, excluding even the Super Admin. Never copy one pattern onto
    the other table — it would either leak or over-seal. (SEC-1/SEC-2.)
- **Column-allowlist naming.** Name read allowlists `[SURFACE]_[ENTITY]_COLUMNS`
  (e.g. `LEADER_FOLLOW_UP_COLUMNS`, `ADMIN_FOLLOW_UP_COLUMNS`); reserve a
  `_SAFE` suffix for a list that actively **omits** sensitive columns as a
  trust-boundary signal. (ARCH-7.)

The Codex review loop is advisory only. It must not auto-merge PRs, enable auto-merge, delete branches, trigger Gemini automation, or auto-trigger Claude.

## Agent skills

### Issue tracker

Issues and PRDs are tracked as GitHub issues via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
