#!/usr/bin/env bash
# Shared seeded local-stack plumbing (#597, extracted for #812).
#
# Sourced — never executed — by scripts/seeded-auth-route-smoke.sh and
# scripts/e2e.sh. Callers must already be running under `set -euo pipefail`
# from the repo root, and may set LOG_TAG before sourcing to label output.
#
# On source, this file:
#
#   1. Reads the running local stack's URL + keys from `supabase status -o env`.
#   2. Applies the operational seed (phase2_seed.sql) so groups/profiles exist.
#   3. Runs `npm run seed:test-auth` to create the seeded Auth users and link
#      them to profiles (the EXISTING local test-auth tooling — no new
#      seed/schema/policy is introduced here), then exports the app's Supabase
#      env (URL + publishable key) for whatever the caller serves next.
#
# It REFUSES to run against a remote Supabase: the seeded lanes create
# throwaway Auth users and must never touch a real project.
#
# SECURITY: the service-role key must NEVER reach the Next runtime the caller
# builds and serves afterwards (repo invariant: no service-role key in the Next
# runtime). The privileged seed env — the service-role key and the
# ENABLE_TEST_AUTH_USERS gate — is passed INLINE to the seed command below and
# is never `export`ed into the shell, so a later `npx playwright test` / Next
# webServer cannot inherit it.
#
# Required tools on PATH: supabase (CLI), psql, node/npm.

LOG_TAG="${LOG_TAG:-seeded-stack}"
log() { printf '[%s] %s\n' "$LOG_TAG" "$*"; }
fail() {
  printf '[%s] ERROR: %s\n' "$LOG_TAG" "$*" >&2
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
  *) fail "Refusing to run: API_URL '$SUPABASE_URL_LOCAL' is not a local stack. The seeded lanes only target a local Supabase." ;;
esac

log "Local stack: $SUPABASE_URL_LOCAL"

# --- 2. Apply the operational seed -------------------------------------------
# `supabase start` applies migrations under supabase/migrations/. The seeded
# auth tooling links profiles that the operational seed provides, so apply it
# here. phase2_seed.sql inserts fixed-email rows into unique columns, so a
# second apply against the SAME stack would abort on conflict. Make the step
# rerunnable: skip the apply when the seed is already present (a known seeded
# profile email), so a failed-then-retried local run — or a second attempt
# against a still-running stack — doesn't fall over before the auth users are
# seeded. (CI uses a fresh stack each run, where the guard is simply a no-op.)
SEED_MARKER_EMAIL="avery.bennett@example.org"
if psql "$DB_URL_LOCAL" -tAc \
  "select 1 from profiles where email = '$SEED_MARKER_EMAIL' limit 1" \
  2>/dev/null | grep -q 1; then
  log "phase2 seed already present — skipping re-apply (rerunnable)."
else
  log "Applying supabase/seed/phase2_seed.sql..."
  psql "$DB_URL_LOCAL" -v ON_ERROR_STOP=1 -f supabase/seed/phase2_seed.sql >/dev/null
fi

# --- 3. Seed throwaway Auth users via the existing test-auth tooling ----------
# scripts/seed-test-auth-users.ts requires ENABLE_TEST_AUTH_USERS=true, a local
# URL, a service-role key, and the TEST_* email/password pairs. The emails are
# pinned to KNOWN_TEST_EMAILS in scripts/test-auth-shared.ts; the passwords come
# from the workflow env (or sensible local defaults below).
# SECURITY: see the header — the service-role key and the gate are inline-only.
export NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_URL_LOCAL"

export TEST_ADMIN_EMAIL="${TEST_ADMIN_EMAIL:-test.admin@lifegroups.local}"
export TEST_ADMIN_PASSWORD="${TEST_ADMIN_PASSWORD:-route-smoke-admin-pw}"
export TEST_LEADER1_EMAIL="${TEST_LEADER1_EMAIL:-test.leader1@lifegroups.local}"
export TEST_LEADER1_PASSWORD="${TEST_LEADER1_PASSWORD:-route-smoke-leader1-pw}"
export TEST_LEADER2_EMAIL="${TEST_LEADER2_EMAIL:-test.leader2@lifegroups.local}"
export TEST_LEADER2_PASSWORD="${TEST_LEADER2_PASSWORD:-route-smoke-leader2-pw}"
export TEST_COLEADER_EMAIL="${TEST_COLEADER_EMAIL:-test.coleader@lifegroups.local}"
export TEST_COLEADER_PASSWORD="${TEST_COLEADER_PASSWORD:-route-smoke-coleader-pw}"
export TEST_OVERSHEPHERD_EMAIL="${TEST_OVERSHEPHERD_EMAIL:-test.overshepherd@lifegroups.local}"
export TEST_OVERSHEPHERD_PASSWORD="${TEST_OVERSHEPHERD_PASSWORD:-route-smoke-overshepherd-pw}"

log "Seeding test auth users..."
ENABLE_TEST_AUTH_USERS="true" \
  SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY_LOCAL" \
  npm run --silent seed:test-auth

# --- 4. Export the app's Supabase env for the caller's server ----------------
# The app reads SUPABASE_URL / *_PUBLISHABLE_KEY; the caller serves it next
# (via Playwright's webServer) and runs its own specs against it.
export SUPABASE_URL="$SUPABASE_URL_LOCAL"
export NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_URL_LOCAL"
export SUPABASE_PUBLISHABLE_KEY="$ANON_KEY_LOCAL"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$ANON_KEY_LOCAL"
