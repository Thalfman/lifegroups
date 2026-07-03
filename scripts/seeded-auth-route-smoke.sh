#!/usr/bin/env bash
# Seeded-auth route smoke runner (#597).
#
# Drives the opt-in route-smoke against a LOCAL seeded Supabase CLI stack. The
# stack plumbing — status read, localhost-only guard, operational seed apply,
# and `npm run seed:test-auth` — lives in scripts/seeded-local-stack.sh
# (shared with the E2E lane, #812) and runs when it is sourced below. This
# runner then serves the app with the A11Y harness enabled and runs the
# seeded-auth Playwright specs (role-routing + leader-routes + mobile-smoke),
# supplying the creds those specs read.
#
# It is invoked by .github/workflows/seeded-auth-route-smoke.yml, and is just as
# runnable locally once `supabase start` is up. It REFUSES to run against a
# remote Supabase (guard in the sourced plumbing): the smoke creates throwaway
# Auth users and must never touch a real project. The default CI lane never
# calls this; it is opt-in only.
#
# Required tools on PATH: supabase (CLI), psql, node/npm.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LOG_TAG="route-smoke"
# Reads the local stack, applies the seed, seeds the test auth users, and
# exports the app's Supabase env (defines log/fail; aborts on any non-local
# stack). The service-role key stays inline on the seed command in there and is
# never exported into this shell.
# shellcheck source=scripts/seeded-local-stack.sh
. "$ROOT_DIR/scripts/seeded-local-stack.sh"

# --- Run the seeded-auth route smoke ------------------------------------------
# Serve the app against the local stack with the harness enabled, then run only
# the seeded-auth specs. The specs read A11Y_*_EMAIL / *_PASSWORD and skip
# cleanly if any are unset.
export A11Y_ADMIN_EMAIL="$TEST_ADMIN_EMAIL"
export A11Y_ADMIN_PASSWORD="$TEST_ADMIN_PASSWORD"
export A11Y_LEADER_EMAIL="$TEST_LEADER1_EMAIL"
export A11Y_LEADER_PASSWORD="$TEST_LEADER1_PASSWORD"
export A11Y_OVER_SHEPHERD_EMAIL="$TEST_OVERSHEPHERD_EMAIL"
export A11Y_OVER_SHEPHERD_PASSWORD="$TEST_OVERSHEPHERD_PASSWORD"

# Playwright builds + serves the app itself (webServer in playwright.config.ts),
# inlining NEXT_PUBLIC_A11Y_HARNESS at build time. Pass CI=1 so it builds the
# production output rather than `next dev`.
log "Running seeded-auth route smoke specs..."
CI=1 npx playwright test \
  tests/a11y/role-routing.spec.ts \
  tests/a11y/leader-routes.spec.ts \
  tests/a11y/mobile-smoke.spec.ts

log "Route smoke complete."
