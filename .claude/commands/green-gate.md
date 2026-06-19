---
description: Iterate lint→typecheck→test:run until the local gate is green
---

Drive this repo's local gate to green. This is an **iterate-until-green** loop,
not a timer.

Run, in order:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test:run`

If all three pass, report **"GREEN GATE PASSED"** and stop.

If any step fails, fix the **smallest** root cause in `app/`, `lib/`,
`components/`, `proxy.ts`, or colocated `**/__tests__/**` code, then re-run from
step 1. The gate trio mirrors `.husky/pre-commit` and `.github/workflows/ci.yml`,
so converging here means the commit/PR won't bounce.

Hard rules:

- Do **not** edit a test expectation to force a pass.
- Do **not** weaken or skip a fitness/security check (`tests/fitness/**`).
- Do **not** touch `supabase/migrations/**` — schema changes go through human
  review.
- Do **not** commit or push from inside this loop.

Stop and ask the human if: the same failure persists after 5 iterations; the fix
would require a migration or schema change; or the failure is a missing toolchain
shim (run `npm ci` per `scripts/verify-toolchain.mjs`, don't loop) or a network
error.
