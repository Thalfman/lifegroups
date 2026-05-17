# Free Tier Notes

This project targets:
- **Vercel Hobby**
- **Supabase Free**

Phase 3 delivery stays lightweight:
- Read-only Supabase client (`@supabase/supabase-js`) created with the anon key.
- A handful of small selects per page load, composed into dashboard DTOs in
  TypeScript — no stored procedures or large joins.
- Fallback demo data when env vars are missing, so the Hobby build never fails
  because of unset secrets.
- No auth, no RLS, no service-role key in any client or server path.
- No write paths (no inserts, updates, deletes, or RPCs that mutate).
- No realtime subscriptions, cron, background jobs, or edge functions.
- No third-party paid messaging or analytics services.
