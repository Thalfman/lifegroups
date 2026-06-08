# Free Tier Notes

This project targets:

- **Vercel Hobby**
- **Supabase Free**
- **Upstash Redis Free** (optional — used only for forgot-password
  throttling)

Posture the app maintains to stay inside those tiers:

- `@supabase/supabase-js` + `@supabase/ssr` for typed reads and
  cookie-aware auth. No service role key in the Next runtime.
- Sign-in is email + password via Supabase Auth (no magic-link
  transport). **Any flow that emails the user — invites, password
  reset — requires a custom SMTP provider configured in the Supabase
  dashboard.** Supabase's built-in/default sender is test-only: it is
  heavily rate-limited and does not reliably deliver to real
  recipients, so invite emails silently fail to arrive without custom
  SMTP. See [EMAIL_DELIVERY.md](./EMAIL_DELIVERY.md) for the exact
  setup. The per-person admin invite's "Copy invite link" button is a
  zero-dependency fallback for onboarding new and rostered people.
- RLS helper SQL functions are `security definer` + `stable` and only
  do small `select` lookups against `profiles` / `group_leaders`.
  Cheap at our row counts; revisit if a single group passes tens of
  thousands of rows.
- Fallback demo data when env vars are missing, so a build never fails
  because of unset secrets. Protected routes redirect to `/login`
  instead of throwing.
- No realtime subscriptions, no cron, no background jobs in the Next
  runtime.
- Service-role workflows (invite user, manage test auth users) live in
  Supabase Edge Functions so they don't push the Next runtime onto a
  paid tier or require a long-lived service key in Vercel.
- No third-party paid messaging or analytics services.
