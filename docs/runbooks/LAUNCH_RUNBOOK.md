# Launch Runbook — go-live checklist

What must be true before Julian runs his ministry on this app, in the order
to do it. Produced by the 2026-06 launch-readiness review (docs, code, live
database, live deployment). Each item names an owner: **Tom** (Supabase /
Vercel / GitHub dashboards — account-holder access) or **Eng** (repo or
MCP/CLI work an engineering session can do and verify).

The launch wave is deliberate (ADR 0009/0016/0017): **Julian + Tom first**,
Over-Shepherds shortly after, Leaders stay behind the `leader_surface` flag
until Julian's explicit go-ahead.

## 1. Platform safety net

- [x] **Supabase org on Pro** (daily backups, no auto-pause) — verified
      2026-06-10. _Tom_
- [x] **Backups visible**: Dashboard → Database → Backups shows recent
      scheduled snapshots; latest observed backup was 2026-06-09 07:34:09
      +0000 — verified 2026-06-10 via Supabase dashboard. _Eng_
- [x] **Branch protection on `main`**: requires the CI checks
      (`lint + typecheck + test` and
      `accessible-name check (playwright + axe)`) before merge — verified
      2026-06-10 via GitHub branch protection API. _Eng_

## 2. Schema parity (the drift fix)

- [x] **Pending migrations applied** to `juvytverslrcqbkxgkvg` under their
      repo version numbers: `20260628_phase_usage_tracking`,
      `20260629_seal_app_settings_to_admin` (RLS fix — until applied,
      `app_settings` was readable by every authenticated user),
      `20260630_db_hygiene_capture_rls_auto_enable` — applied + verified
      2026-06-10. _Eng_
- [x] **Migration history repaired**: the two rows applied ad-hoc as
      `202606091414xx` re-recorded as `20260627000000` / `20260627010000`
      (function bodies verified identical to the repo fixes first); remote
      history now matches `supabase/migrations/` exactly, 112 ≡ 112 —
      verified 2026-06-10. _Eng_
- [x] **Post-fix probes clean**: `app_settings` sealed per-key
      (`auth_is_admin() or setting_key = 'metric_defaults'`), `usage_events`
      RLS on, `set_updated_at` `search_path` pinned, `audit_events_archive`
      has a PK, `rls_auto_enable` EXECUTE revoked from API roles — verified
      2026-06-10. _Eng_
- [ ] From now on, every release follows [`RELEASE.md`](./RELEASE.md) —
      schema and code ship together. _Everyone_

## 3. Auth lifecycle, end to end

- [x] **Custom SMTP configured** in Supabase Auth (the default sender is
      test-only and silently drops mail) — enabled and saved in Supabase Auth
      SMTP settings, verified 2026-06-10 via Supabase dashboard. _Eng_
- [x] **Leaked-password protection enabled** (Auth → Settings → Password
      security: HaveIBeenPwned check) — enabled on the Email provider and
      verified 2026-06-10 via Supabase dashboard. _Eng_
- [ ] **Live test of the full loop**: invite a scratch user by email →
      redeem → sign in → forgot-password → reset → sign in again → remove
      the user. The "Copy invite link" fallback also works without SMTP, but
      launch should not depend on it. _Tom + Eng_
- [ ] **Vercel env vars present** (Project → Settings → Environment
      Variables, Production): `NEXT_PUBLIC_SUPABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`,
      `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (forgot-password + invite-redeem throttles are permissive without them),
      `LOG_HASH_SALT`, `TRUSTED_PROXY=vercel`. **Never** a service-role key.
      Production service-role key removed from Vercel env settings 2026-06-10;
      Vercel reported a new deployment is needed for the change to affect the
      deployed runtime. Still missing in Production: `NEXT_PUBLIC_SITE_URL`,
      `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `LOG_HASH_SALT`,
      `TRUSTED_PROXY=vercel`. _Tom + Eng_

## 4. Production surface hygiene

- [x] **Delete the `test-flag` Edge Function** from the project — deleted
      from production project `juvytverslrcqbkxgkvg` and verified
      2026-06-10; production now has only `invite-user` and `redeem-invite`.
      _Eng_
- [x] **Remove `manage-test-auth-users` from production** (it exists for
      local/test-user seeding; production should run only `invite-user` and
      `redeem-invite`) — deleted from production project
      `juvytverslrcqbkxgkvg` and verified 2026-06-10; production now has
      only `invite-user` and `redeem-invite`. _Eng_

## 5. Real data in, test data out

- [ ] **Audit the 7 existing accounts**: today production has 1
      `super_admin`, 2 `ministry_admin`s, 3 `leader`s, 0 `over_shepherd`s.
      Keep Tom (`super_admin`) + Julian (`ministry_admin`); remove or archive
      every test/demo account and its profile. _Tom + Julian_
- [ ] **Load the real roster**: groups, leaders, members (Super-Admin bulk
      import accepts CSV: `full_name`, email, phone, groups). Today: 21
      groups but 1 member row — rosters are not loaded. _Julian_
- [ ] **Configure Settings**: Group + Leader health rubrics, care cadence,
      multiplication trigger (global → per-type → per-cell as Julian
      wants it). _Julian_
- [ ] **Run "Prepare for launch"** from the Super-Admin console
      (`super_admin_launch_prep`): wipes accumulated test history
      (recoverable snapshot first) and mutes the needs-attention queues so
      Home starts calm instead of red. _Tom_

## 6. Go / no-go

- [ ] **Per-role smoke test**: Tom (super-admin console, danger zone
      visible), Julian (Care accordion incl. transparency toggle → Plan
      funnel → Multiply boards, no dead links), a leader account (lands on
      `/unauthorized` while `leader_surface` is off). _Tom + Julian_
- [ ] **Julian sign-off**: he runs one real week's workflow (log a care
      interaction, add a prospect, check Multiply) and agrees it replaces
      the spreadsheet. _Julian_

## After launch (wave 2+, separate efforts)

1. **Over-Shepherds**: create their accounts, assign coverage, verify the
   `/over-shepherd` surface against real data, then invite the three of
   them.
2. **Leaders**: only after Julian's explicit go-ahead — flip
   `leader_surface` per the verify-before-flip rule (ADR 0009), having
   re-run the RLS smoke checks with a real leader account first.
3. **Periodic hygiene**: re-run Supabase advisors after any
   RLS/grant-touching migration (see [`RELEASE.md`](./RELEASE.md)); verify
   backups monthly (see [`BACKUP_AND_RESTORE.md`](./BACKUP_AND_RESTORE.md)).
