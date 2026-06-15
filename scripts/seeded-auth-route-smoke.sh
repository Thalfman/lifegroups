#!/usr/bin/env bash
# Seeded-auth route smoke runner (#597).
#
# Drives the opt-in route-smoke against a LOCAL seeded Supabase CLI stack:
#
#   1. Reads the running local stack's URL + keys from `supabase status -o env`.
#   2. Applies the operational seed (phase2_seed.sql) so groups/profiles exist.
#   3. Runs `npm run seed:test-auth` to create the seeded Auth users and link
#      them to profiles (this is the EXISTING local test-auth tooling — no new
#      seed/schema/policy is introduced here).
#   4. Runs the seeded-auth Playwright specs (role-routing + leader-routes +
#      mobile-smoke), with the app served against the local stack and the
#      A11Y harness enabled, supplying the creds those specs read.
#
# It is invoked by .github/workflows/seeded-auth-route-smoke.yml, and is just as
# runnable locally once `supabase start` is up. It REFUSES to run against a
# remote Supabase: the smoke creates throwaway Auth users and must never touch a
# real project. The default CI lane never calls this; it is opt-in only.
#
# Required tools on PATH: supabase (CLI), psql, node/npm.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() { printf '[route-smoke] %s\n' "$*"; }
fail() {
  printf '[route-smoke] ERROR: %s\n' "$*" >&2
  exit 1
}

command -v supabase >/dev/null 2>&1 || fail "supabase CLI not found on PATH."
command -v psql >/dev/null 2>&1 || fail "psql not found on PATH."

# --- 1. Read the local stack's connection details ----------------------------
# `supabase status -o env` emits shell-assignable KEY="value" lines. We only
# trust a stack whose API URL is local; anything else aborts before any writes.
log "Reading local Supabase status..."
STATUS_ENV="$(supabase status -o env)" || fail "Could not read 'supabase status'. Is the local stack started ('supabase start')?"

get_status() {
  # Extract VALUE from a `KEY=VALUE` or `KEY="VALUE"` line emitted by
  # supabase status -o env (older versions quote, newer ones may not).
  printf '%s\n' "$STATUS_ENV" \
    | sed -n "s/^$1=//p" \
    | head -n1 \
    | sed -e 's/^"//' -e 's/"$//'
}

SUPABASE_URL_LOCAL="$(get_status API_URL)"
ANON_KEY_LOCAL="$(get_status ANON_KEY)"
SERVICE_ROLE_KEY_LOCAL="$(get_status SERVICE_ROLE_KEY)"
DB_URL_LOCAL="$(get_status DB_URL)"

[ -n "$SUPABASE_URL_LOCAL" ] || fail "API_URL missing from supabase status."
[ -n "$ANON_KEY_LOCAL" ] || fail "ANON_KEY missing from supabase status."
[ -n "$SERVICE_ROLE_KEY_LOCAL" ] || fail "SERVICE_ROLE_KEY missing from supabase status."
[ -n "$DB_URL_LOCAL" ] || fail "DB_URL missing from supabase status."

case "$SUPABASE_URL_LOCAL" in
  http://127.0.0.1:* | http://localhost:* | http://[::1]:*) ;;
  *) fail "Refusing to run: API_URL '$SUPABASE_URL_LOCAL' is not a local stack. This smoke only targets a local Supabase." ;;
esac

log "Local stack: $SUPABASE_URL_LOCAL"

# --- 2. Apply the operational seed -------------------------------------------
# `supabase start` applies migrations under supabase/migrations/. The seeded
# auth tooling links profiles that the operational seed provides, so apply it
# here. Idempotent enough for repeated runs in a fresh CI stack.
log "Applying supabase/seed/phase2_seed.sql..."
psql "$DB_URL_LOCAL" -v ON_ERROR_STOP=1 -f supabase/seed/phase2_seed.sql >/dev/null

# --- 3. Seed throwaway Auth users via the existing test-auth tooling ----------
# scripts/seed-test-auth-users.ts requires ENABLE_TEST_AUTH_USERS=true, a local
# URL, a service-role key, and the TEST_* email/password pairs. The emails are
# pinned to KNOWN_TEST_EMAILS in scripts/test-auth-shared.ts; the passwords come
# from the workflow env (or sensible local defaults below).
export ENABLE_TEST_AUTH_USERS="true"
export NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_URL_LOCAL"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY_LOCAL"

export TEST_ADMIN_EMAIL="${TEST_ADMIN_EMAIL:-test.admin@lifegroups.local}"
export TEST_ADMIN_PASSWORD="${TEST_ADMIN_PASSWORD:-route-smoke-admin-pw}"
export TEST_LEADER1_EMAIL="${TEST_LEADER1_EMAIL:-test.leader1@lifegroups.local}"
export TEST_LEADER1_PASSWORD="${TEST_LEADER1_PASSWORD:-route-smoke-leader1-pw}"
export TEST_LEADER2_EMAIL="${TEST_LEADER2_EMAIL:-test.leader2@lifegroups.local}"
export TEST_LEADER2_PASSWORD="${TEST_LEADER2_PASSWORD:-route-smoke-leader2-pw}"
export TEST_COLEADER_EMAIL="${TEST_COLEADER_EMAIL:-test.coleader@lifegroups.local}"
export TEST_COLEADER_PASSWORD="${TEST_COLEADER_PASSWORD:-route-smoke-coleader-pw}"

log "Seeding test auth users..."
npm run --silent seed:test-auth

# --- 4. Run the seeded-auth route smoke --------------------------------------
# Serve the app against the local stack with the harness enabled, then run only
# the seeded-auth specs. The app reads SUPABASE_URL / *_PUBLISHABLE_KEY; the
# specs read A11Y_*_EMAIL / *_PASSWORD and skip cleanly if any are unset.
export SUPABASE_URL="$SUPABASE_URL_LOCAL"
export NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_URL_LOCAL"
export SUPABASE_PUBLISHABLE_KEY="$ANON_KEY_LOCAL"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$ANON_KEY_LOCAL"

export A11Y_ADMIN_EMAIL="$TEST_ADMIN_EMAIL"
export A11Y_ADMIN_PASSWORD="$TEST_ADMIN_PASSWORD"
export A11Y_LEADER_EMAIL="$TEST_LEADER1_EMAIL"
export A11Y_LEADER_PASSWORD="$TEST_LEADER1_PASSWORD"

# Playwright builds + serves the app itself (webServer in playwright.config.ts),
# inlining NEXT_PUBLIC_A11Y_HARNESS at build time. Pass CI=1 so it builds the
# production output rather than `next dev`.
log "Running seeded-auth route smoke specs..."
CI=1 npx playwright test \
  tests/a11y/role-routing.spec.ts \
  tests/a11y/leader-routes.spec.ts \
  tests/a11y/mobile-smoke.spec.ts

log "Route smoke complete."
