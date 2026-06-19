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
routes through the run-action adapter (or a documented exemption). A regression
fails the build — but the scans are static and conservative, so keep reviewing
the rest of the list (audit pairing, broad RLS, hard deletes, role boundaries)
by hand.

The Codex review loop is advisory only. It must not auto-merge PRs, enable auto-merge, delete branches, trigger Gemini automation, or auto-trigger Claude.

## Agent skills

### Issue tracker

Issues and PRDs are tracked as GitHub issues via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Claude Code loops

Reusable, repo-specific loop workflows (the green gate, the fitness inner-loop, and PR CI watch) and the loops we deliberately don't run live in `docs/agents/claude-loops.md`, with saved commands in `.claude/commands/`. They honor the advisory-only rule above — no auto-merge, no auto-applied migrations.
