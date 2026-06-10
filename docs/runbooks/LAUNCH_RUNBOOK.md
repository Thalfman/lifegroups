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
- [ ] **Backups visible**: Dashboard → Database → Backups shows a recent
      snapshot; skim [`BACKUP_AND_RESTORE.md`](./BACKUP_AND_RESTORE.md) so
      the restore ladder isn't read for the first time during an incident.
      _Tom_
- [ ] **Branch protection on `main`**: require the CI checks (lint /
      typecheck / test + a11y) before merge. GitHub → Settings → Branches.
      _Tom_

## 2. Schema parity (the drift fix)

- [ ] **Pending migrations applied** to `juvytverslrcqbkxgkvg` under their
      repo version numbers: `20260628_phase_usage_tracking`,
      `20260629_seal_app_settings_to_admin` (RLS fix — until applied,
      `app_settings` is readable by every authenticated user),
      `20260630_db_hygiene_capture_rls_auto_enable`. _Eng_
- [ ] **Migration history repaired**: the two rows applied ad-hoc as
      `202606091414xx` re-recorded as `20260627000000` / `20260627010000`
      with repo-identical content, so `supabase migration list` shows local ≡
      remote. _Eng_
- [ ] **Advisors re-run clean**: no `app_settings` exposure, no mutable
      `search_path`, no missing-PK INFO on `audit_events_archive`. _Eng_
- [ ] From now on, every release follows [`RELEASE.md`](./RELEASE.md) —
      schema and code ship together. _Everyone_

## 3. Auth lifecycle, end to end

- [ ] **Custom SMTP configured** in Supabase Auth (the default sender is
      test-only and silently drops mail) — exact steps in
      [`EMAIL_DELIVERY.md`](../architecture/EMAIL_DELIVERY.md). _Tom_
- [ ] **Leaked-password protection enabled** (Auth → Settings → Password
      security: HaveIBeenPwned check). _Tom_
- [ ] **Live test of the full loop**: invite a scratch user by email →
      redeem → sign in → forgot-password → reset → sign in again → remove
      the user. The "Copy invite link" fallback also works without SMTP, but
      launch should not depend on it. _Tom + Eng_
- [ ] **Vercel env vars present** (Project → Settings → Environment
      Variables, Production): `NEXT_PUBLIC_SUPABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`,
      `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (forgot-password + invite-redeem throttles are permissive without them),
      `LOG_HASH_SALT`, `TRUSTED_PROXY=vercel`. **Never** a service-role key.
      _Tom_

## 4. Production surface hygiene

- [ ] **Delete the `test-flag` Edge Function** from the project — it is a
      scratch function with no source in the repo. Dashboard → Edge
      Functions (or `supabase functions delete test-flag`). _Tom_
- [ ] **Remove `manage-test-auth-users` from production** (it exists for
      local/test-user seeding; production should run only `invite-user` and
      `redeem-invite`): `supabase functions delete manage-test-auth-users`.
      If kept instead, confirm its env gates (`ENABLE_TEST_AUTH_USERS`)
      are unset in function secrets. _Tom_

## 5. Real data in, test data out

- [ ] **Audit the 7 existing accounts**: today production has 1
      super*admin, 2 ministry_admins, 3 leaders, 0 over_shepherds. Keep
      Tom (super_admin) + Julian (ministry_admin); remove or archive every
      test/demo account and its profile. \_Tom + Julian*
- [ ] **Load the real roster**: groups, leaders, members (Super-Admin bulk
      import accepts CSV: full*name, email, phone, groups). Today: 21
      groups but 1 member row — rosters are not loaded. \_Julian*
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
