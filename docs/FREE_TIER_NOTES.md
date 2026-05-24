# Free Tier Notes

This project targets:

- **Vercel Hobby**
- **Supabase Free**
- **Upstash Redis Free** (optional — used only for forgot-password
  throttling)

Posture the app maintains to stay inside those tiers:

- `@supabase/supabase-js` + `@supabase/ssr` for typed reads and
  cookie-aware auth. No service role key in the Next runtime.
- Sign-in is email + password via Supabase Auth so no SMTP / magic-
  link transport is required. The forgot-password flow uses Supabase's
  built-in reset email; SMTP is only needed if you customize it.
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
