# Seed Data (Phase 2)

## Purpose
The Phase 2 seed script provides fake-but-realistic operational data for local dashboard prototyping once Supabase is connected in later phases.

## Included scenarios
- 1 ministry admin, 1 staff viewer, 3 leaders.
- 5 life groups with mixed lifecycle/health states.
- Includes planned pause with expected return + restart reminder.
- 40 members with group memberships.
- 4 weeks of attendance sessions + attendance records.
- 7 guests across different pipeline stages.
- 8 follow-up tasks with mixed priority/status.
- 3 group health pulse updates.

## Applying later
When Supabase CLI/project is connected in a future phase:
1. Run migration(s) under `supabase/migrations`.
2. Run seed SQL under `supabase/seed/phase2_seed.sql`.

## Privacy
All records are fictional placeholders with generic operational notes and no sensitive pastoral detail.
