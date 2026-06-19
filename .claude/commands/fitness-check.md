---
description: Iterate the fitness suite until P0 security invariants pass
---

A fast, narrow inner-loop for security-sensitive changes (the write path:
`app/**/actions.ts`, `lib/**/*rpc*.ts`, `lib/admin/run-action.ts`, `lib/auth/**`,
`supabase/migrations/**`). Run this **before** the full green gate.

Run:

```
npx vitest run tests/fitness
```

While iterating on one invariant, target its file, e.g.
`npx vitest run tests/fitness/security-definer-search-path.test.ts`.

If green, report **"FITNESS GREEN"** and stop.

If a scan fails, read the failing assertion and fix the **source** so the
invariant holds:

- Route the write through the correct `SECURITY DEFINER` RPC (`admin_*`,
  `leader_*`, `over_shepherd_*`, `super_admin_*`) — no direct table writes.
- Pin `search_path` on `SECURITY DEFINER` functions.
- Use the `run-action` adapter for server actions.
- Drop any `select("*")` and any service-role usage in runtime code.

Then re-run.

Hard rules:

- **Never** weaken, skip, or edit a fitness test to make it pass.
- **Never** widen RLS or add a broad grant to dodge a failure.
- For any new or edited migration, **stop and present the SQL diff for human
  review** — do not auto-apply migrations.

Stop conditions: green; the migration content needs human review; or the only way
to pass would be to alter a fitness test.
