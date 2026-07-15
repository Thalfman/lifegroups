#!/usr/bin/env bash
# E2E lane runner (#812).
#
# One-command happy-path E2E run against the REAL stack: a LOCAL seeded
# Supabase CLI stack, real sign-in, real Server Actions, real SECURITY DEFINER
# RPCs, real RLS — no stubbed actions and no a11y harness. The stack plumbing
# (status read, localhost-only guard, operational seed apply, and
# `npm run seed:test-auth`) lives in scripts/seeded-local-stack.sh (shared with
# the route smoke, #597) and runs when it is sourced below.
#
# Run locally with `npm run test:e2e`. If no local stack is running it starts
# one (`supabase start`, needs Docker); in CI (.github/workflows/e2e.yml) the
# workflow pre-starts the stack so that step is a no-op. It refuses to run
# against a remote Supabase (guard in the sourced plumbing): the lane creates
# throwaway Auth users and writes real rows, and must never touch a real
# project. The default PR lane (ci.yml) never calls this.
#
# Required tools on PATH: supabase (CLI), psql, node/npm, Docker (locally).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

command -v supabase >/dev/null 2>&1 || {
  printf '[e2e] ERROR: supabase CLI not found on PATH.\n' >&2
  exit 1
}

# redeem-invite fails closed without its IP-HMAC key. Prepare the ignored local
# Edge env before a possible `supabase start`, and export the exact same value
# so the Next E2E process uses one consistent local-only identifier key.
# shellcheck source=scripts/ensure-local-edge-env.sh
. "$ROOT_DIR/scripts/ensure-local-edge-env.sh"


# One-command local run: start the local stack when none is up. `supabase
# status` exits non-zero when the stack isn't running.
if ! supabase status >/dev/null 2>&1; then
  printf '[e2e] %s\n' "No running local Supabase stack — running 'supabase start'..."
  supabase start
fi

LOG_TAG="e2e"
# Reads the local stack, applies the seed, seeds the test auth users, and
# exports the app's Supabase env (defines log/fail; aborts on any non-local
# stack). The seed's own privileged env (SUPABASE_SERVICE_ROLE_KEY + the
# ENABLE_TEST_AUTH_USERS gate) stays inline on the seed command in there and is
# never exported into this shell — so the Next server Playwright builds below
# cannot inherit it under the name the runtime would read.
# shellcheck source=scripts/seeded-local-stack.sh
. "$ROOT_DIR/scripts/seeded-local-stack.sh"

# The E2E specs read E2E_* creds and skip cleanly if any are unset.
export E2E_ADMIN_EMAIL="$TEST_ADMIN_EMAIL"
export E2E_ADMIN_PASSWORD="$TEST_ADMIN_PASSWORD"
export E2E_OVER_SHEPHERD_EMAIL="$TEST_OVERSHEPHERD_EMAIL"
export E2E_OVER_SHEPHERD_PASSWORD="$TEST_OVERSHEPHERD_PASSWORD"
export E2E_LEADER_EMAIL="$TEST_LEADER1_EMAIL"
export E2E_LEADER_PASSWORD="$TEST_LEADER1_PASSWORD"
# The unrelated second Shepherd (leads TEST Life Group B) — the negative
# control for the leader-authored write specs' ladder assertions (#903).
export E2E_LEADER2_EMAIL="$TEST_LEADER2_EMAIL"
export E2E_LEADER2_PASSWORD="$TEST_LEADER2_PASSWORD"

# Service-role access for the PLAYWRIGHT TEST PROCESS ONLY (tests/e2e/db.ts):
# audit-pairing assertions and the invite spec's super-admin fixture (the seed
# tooling refuses to create a super_admin). Two layers keep the repo invariant
# (no service-role key in the Next runtime): the name is deliberately NOT
# SUPABASE_SERVICE_ROLE_KEY (runtime code never reads any E2E_* variable), and
# playwright.e2e.config.ts blanks E2E_SERVICE_ROLE_KEY in the webServer env so
# the served app's process holds no service-role credential at all.
export E2E_SUPABASE_URL="$SUPABASE_URL_LOCAL"
export E2E_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY_LOCAL"

# The invite-redeem spec provisions/reuses its own super_admin via
# tests/e2e/db.ts ensureSuperAdmin() (create-or-reuse, local stack only);
# these are the credentials it pins.
export E2E_SUPER_ADMIN_EMAIL="${E2E_SUPER_ADMIN_EMAIL:-test.superadmin@lifegroups.local}"
export E2E_SUPER_ADMIN_PASSWORD="${E2E_SUPER_ADMIN_PASSWORD:-route-smoke-superadmin-pw}"

# Playwright builds + serves the app itself (webServer in
# playwright.e2e.config.ts) with NO a11y harness — the real routes only. Pass
# CI=1 so it builds the production output rather than `next dev`; set
# E2E_WEBSERVER (mirroring A11Y_WEBSERVER) to iterate against a dev server.
log "Running E2E specs..."
CI=1 npx playwright test --config playwright.e2e.config.ts

log "E2E lane complete."
