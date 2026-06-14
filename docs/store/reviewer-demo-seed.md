# Reviewer / demo seed

Status: Living document
Owner: Tom
Phase: Mobile store roadmap §6 (reviewer demo accounts)

A reproducible, fully **synthetic** dataset that fills the Ministry Admin,
Over-Shepherd, and Leader surfaces so Apple/Google reviewers see meaningful,
non-empty workflows — with no real ministry or pastoral content.

- **Seed file:** [`supabase/seed/reviewer_demo_seed.sql`](../../supabase/seed/reviewer_demo_seed.sql)
- **Scope split with #564:** this seed creates the _records_; #564 stands up the
  review environment and provisions the reviewer **Auth users**, which link to
  the seeded profiles by email.

## What it creates

- **Cells** — a small category catalog (`20s-30s`, `Young families`, `50s+`) and
  active `audience × category` cells.
- **Groups** — five demo groups across those cells, with varied health.
- **People** — eighteen demo members spread across the groups.
- **Leaders** — leader profiles, each assigned to a group.
- **Over-Shepherd** — an over-shepherd directory row plus its login profile
  (same email, so the coverage bridge resolves), covering the demo leaders.
- **Care Notes & Prayer Requests** — a few over-shepherd notes about leaders and
  a leader note/request about a group, exercising both arms of the one-subject
  model.

## Reviewer login emails (provisioned by #564)

| Role           | Email                                        |
| -------------- | -------------------------------------------- |
| Ministry Admin | `reviewer.admin@reviewerdemo.example`        |
| Over-Shepherd  | `reviewer.overshepherd@reviewerdemo.example` |
| Leader         | `reviewer.leader@reviewerdemo.example`       |

All other records use `@reviewerdemo.example` addresses too, so the whole
dataset is obviously synthetic.

## How to run

Apply it the same way as the other `supabase/seed/*.sql` files — through the
Supabase SQL editor, `supabase db push`, or `psql` — against whichever Supabase
project #564 selects (it hardcodes no project):

```bash
psql "$DATABASE_URL" -f supabase/seed/reviewer_demo_seed.sql
```

It is **idempotent**: every insert is guarded, so re-running it is a no-op. It
is data-only — it adds no policies, uses no service-role key, changes no RLS,
and performs no hard deletes.

## Guarantees (enforced by a static test)

`lib/admin/__tests__/reviewer-demo-seed.test.ts` pins that the seed stays
idempotent, fully synthetic (`@reviewerdemo.example` only), data-only (no
policies / RLS / service-role / `SECURITY DEFINER`), free of hard deletes, and
covers every role surface.
