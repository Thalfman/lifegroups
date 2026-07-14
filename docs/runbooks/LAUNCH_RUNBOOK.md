# Launch Runbook — go-live checklist

What must be true before Julian runs his ministry on this app, in the order
to do it. Produced by the 2026-06 launch-readiness review (docs, code, live
database, live deployment). Each item names an owner: **Tom** (Supabase /
Vercel / GitHub dashboards — account-holder access) or **Eng** (repo or
MCP/CLI work an engineering session can do and verify).

The launch wave is deliberate (ADR 0009/0016/0017): **Julian + Tom first**,
Over-Shepherds shortly after, Leaders last. Since ADR 0024 the
`leader_surface` flag is **on (and verified) by default**, so the Leader wave
is gated by _account issuance_, not the flag — but that gate only holds once
no leader accounts exist. Today production still has 3 `leader` + 1
`co_leader` accounts, and `requireLeader()` admits any **active** leader
profile while the flag is live, so anyone holding (or resetting) those
credentials can reach `/leader` right now. Completing the account audit
(§5) — archiving/deactivating those four — is therefore a **blocker** for
calling Leader access invite-gated; after that, no Leader gets an invite
until Julian's explicit go-ahead.

## 1. Platform safety net

- [x] **Supabase org on Pro** (daily backups, no auto-pause) — verified
      2026-06-10. _Tom_
- [x] **Backups visible**: Dashboard → Database → Backups shows recent
      scheduled snapshots; latest observed backup was 2026-06-09 07:34:09
      +0000 — verified 2026-06-10 via Supabase dashboard. _Eng_
- [x] **Branch protection on `main`**: requires the CI checks
      (`lint + typecheck + build + test` and
      `accessible-name check (playwright + axe)`) before merge — verified
      2026-06-10 via GitHub branch protection API. Branch protection matches
      required checks on the **exact job name string** (renaming a job in
      `ci.yml` silently un-requires it — update the protected contexts in the
      same change), and the protected-context strings themselves can only be
      verified from GitHub's branch-protection settings/API, not from the
      repo. The RLS integration harness gates RLS-relevant PRs as path-gated
      steps **inside** the `lint + typecheck + build + test` job (#811), so it
      adds no separate required check. _Eng_

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
- [x] **Security advisors clean**: re-run 2026-06-11 via MCP `get_advisors` —
      0 errors; the WARNs are the by-design SECURITY DEFINER RPC pattern
      (every RPC re-checks the caller's role internally) plus
      `peek_invitation` for `anon` (the invite token is the credential).
      Re-run after any RLS/grant-touching migration. _Eng_
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
      `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`,
      `RATE_LIMIT_HMAC_SECRET`, `LOG_HASH_SALT`,
      `TRUSTED_PROXY=vercel`. **Never** a service-role key. Upstash supplies
      distributed login/forgot-password/invite throttling; public telemetry retains a
      bounded per-process fallback during an Upstash gap. _Tom + Eng_
      Production service-role key removed from Vercel env settings 2026-06-10;
      Vercel reported a new deployment is needed for the change to affect the
      deployed runtime. Still missing in Production: `NEXT_PUBLIC_SITE_URL`,
      `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`,
      `RATE_LIMIT_HMAC_SECRET`, `LOG_HASH_SALT`, `TRUSTED_PROXY=vercel`.
      _Tom + Eng_
- [ ] **Shared rate-limit HMAC secret present in Supabase**:
      `redeem-invite` has `RATE_LIMIT_HMAC_SECRET` set as an Edge Function
      secret, with the same value as Vercel. It fails closed without it. The
      secret never uses a `NEXT_PUBLIC_` name and never appears in logs.
      Rotation is an intentional rate-limit-bucket reset. _Eng_

## 4. Production surface hygiene

- [x] **Delete the `test-flag` Edge Function** from the project — deleted
      from production project `juvytverslrcqbkxgkvg` and verified
      2026-06-10; production at that point had only `invite-user` and `redeem-invite`.
      _Eng_
- [ ] **Remove `manage-test-auth-users` from production** (it exists for
      local/test-user seeding; production should run only `invite-user`,
      `redeem-invite`, and `purge-profile-auth`). It was deleted 2026-06-09, but the Supabase GitHub
      integration **redeployed it minutes later** — its deploy-to-production
      step pushes every function declared in `supabase/config.toml` on each
      push to `main` (see [`RELEASE.md`](./RELEASE.md) § Edge Functions).
      Re-verified still ACTIVE in production 2026-06-11. Do it in this order: 1. Merge the `enabled = false` guard on the function's `config.toml`
      block (so the next push to `main` can't redeploy it). _Eng_ 2. Then delete it:
      `supabase functions delete manage-test-auth-users --project-ref juvytverslrcqbkxgkvg`
      (or Dashboard → Edge Functions → delete). _Tom_ 3. **Verify immediately** — before any other runbook step continues:
      the production function list (Dashboard → Edge Functions, or MCP
      `list_edge_functions` against `juvytverslrcqbkxgkvg`) shows exactly
      `invite-user` + `redeem-invite` + `purge-profile-auth`. Catches a missed, failed, or
      wrong-project deletion on the spot. _Tom + Eng_ 4. After the **next** merge to `main`, re-check the same list to
      confirm the integration no longer redeploys it. _Eng_

      Known side effect: the Super-Admin console's **Test accounts** panel
      calls this function for its status chip, so with the function deleted
      it reports the tooling as not deployed and its actions fail. That is
      the **expected production posture**, not a regression — issue #522
      tracks rendering it as a calm "not installed" state.

## 5. Real data in, test data out

- [ ] **Audit the 8 existing accounts**: as of 2026-06-11 production has 1
      `super_admin`, **3** `ministry_admin`s, 3 `leader`s, 1 `co_leader`,
      0 `over_shepherd`s (one `ministry_admin` more than the 2026-06-10
      count — identify it during the audit). Keep Tom (`super_admin`) +
      Julian (`ministry_admin`); remove or archive every test/demo account
      and its profile. The 3 `leader` + 1 `co_leader` accounts are the
      priority: `leader_surface` is live (ADR 0024), so they can reach
      `/leader` until archived/deactivated — this item blocks the "Leader
      access is invite-gated" claim in the intro. _Tom + Julian_
- [ ] **Load the real roster**: groups, leaders, members (Super-Admin bulk
      import accepts CSV: `full_name`, email, phone, groups). Today: 21
      groups but 1 member row — rosters are not loaded. _Julian_
- [ ] **Configure Settings**: Group + Leader health rubrics, care cadence,
      multiplication trigger (global default → per-group-type override as
      Julian wants it). _Julian_
- [ ] **Run "Prepare for launch"** from the Super-Admin console
      (`super_admin_launch_prep`): wipes accumulated test history
      (recoverable snapshot first) and mutes the needs-attention queues so
      Home starts calm instead of red. _Tom_

## 6. Go / no-go

- [ ] **Per-role smoke test**: Tom (super-admin console, danger zone
      visible; the Test accounts chip reporting the seeding function as not
      deployed is the expected production posture per §4 / issue #522, not a
      failure), Julian (Care accordion incl. transparency toggle → Plan
      funnel → Multiply boards, no dead links), a scratch leader account
      (lands on `/leader` and sees only its own group — `leader_surface` is
      on by default per ADR 0024; remove the scratch account afterwards).
      _Tom + Julian_
- [ ] **Julian sign-off**: he runs one real week's workflow (log a care
      interaction, add a prospect, check Multiply) and agrees it replaces
      the spreadsheet. _Julian_

## After launch (wave 2+, separate efforts)

1. **Over-Shepherds**: create their accounts, assign coverage, verify the
   `/over-shepherd` surface against real data, then invite the three of
   them.
2. **Leaders**: only after Julian's explicit go-ahead — `leader_surface` is
   already on + verified (ADR 0024), so the gate is sending the invites.
   Before the first batch, re-run the RLS smoke checks with a real leader
   account (sees only their own group; no `admin_private_note` anywhere).
3. **Periodic hygiene**: re-run Supabase advisors after any
   RLS/grant-touching migration (see [`RELEASE.md`](./RELEASE.md)); verify
   backups monthly (see [`BACKUP_AND_RESTORE.md`](./BACKUP_AND_RESTORE.md)).
