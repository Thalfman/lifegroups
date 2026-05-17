# Free Tier Notes

This project targets:
- **Vercel Hobby**
- **Supabase Free**

Phase 4 keeps that posture:
- `@supabase/supabase-js` + `@supabase/ssr` for typed reads and
  cookie-aware auth. No service role key is referenced anywhere.
- Sign-in uses email + password via Supabase Auth so we don't need SMTP /
  magic-link transports on the free tier. Magic links and password reset
  can land later if the deployment configures SMTP.
- RLS helper functions are `security definer` + `stable` and only do small
  `select` lookups against `profiles` / `group_leaders`. At our row counts
  they're cheap; revisit if a group grows past tens of thousands of rows.
- Fallback demo data when env vars are missing, so the Hobby build never
  fails because of unset secrets. Public preview routes (`/admin-preview`,
  `/leader-preview`) always render fallback data regardless of env config.
- No realtime subscriptions, cron, background jobs, or edge functions.
- No third-party paid messaging or analytics services.

Phase 5 will introduce write paths (attendance submission, guest capture,
follow-up updates) and the corresponding INSERT / UPDATE / DELETE RLS
policies; the free-tier posture is expected to hold through that work as
well.
