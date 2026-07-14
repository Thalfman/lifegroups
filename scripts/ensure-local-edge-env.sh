#!/usr/bin/env bash
# Prepare the ignored Supabase Edge Function env used by the local E2E stack.
#
# Supabase CLI auto-loads supabase/functions/.env when the local stack starts.
# A clean checkout does not have that ignored file, but redeem-invite now
# correctly fails closed without its IP-HMAC key. Keep one deterministic,
# explicitly non-production value for local/CI E2E only. If a developer already
# has a value in the file, preserve it and export that same value to the Next
# E2E process; never print the value or overwrite local secrets.

set -euo pipefail

LOCAL_EDGE_ENV_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_EDGE_ENV_FILE="$LOCAL_EDGE_ENV_ROOT/supabase/functions/.env"
LOCAL_E2E_RATE_LIMIT_HMAC_SECRET="lifegroups-local-e2e-only-rate-limit-key-v1-do-not-use-in-production"

mkdir -p "$(dirname "$LOCAL_EDGE_ENV_FILE")"

existing_line="$(
  grep -E '^[[:space:]]*RATE_LIMIT_HMAC_SECRET[[:space:]]*=' \
    "$LOCAL_EDGE_ENV_FILE" 2>/dev/null | tail -n 1 || true
)"

if [[ -n "$existing_line" ]]; then
  local_rate_limit_hmac_secret="${existing_line#*=}"
  # Trim dotenv whitespace and a matching pair of simple quotes without
  # sourcing the whole local file as shell code.
  local_rate_limit_hmac_secret="$(
    printf '%s' "$local_rate_limit_hmac_secret" |
      sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
  )"
  if [[ "$local_rate_limit_hmac_secret" == \"*\" ]] ||
    [[ "$local_rate_limit_hmac_secret" == \'*\' ]]; then
    local_rate_limit_hmac_secret="${local_rate_limit_hmac_secret:1:${#local_rate_limit_hmac_secret}-2}"
  fi
  if [[ -z "$local_rate_limit_hmac_secret" ]]; then
    printf '%s\n' \
      '[e2e] ERROR: supabase/functions/.env has an empty RATE_LIMIT_HMAC_SECRET.' \
      >&2
    exit 1
  fi
else
  # The file is ignored by `.env*`. Restrictive permissions protect any other
  # local values that may be added later; append-only behavior preserves an
  # existing developer file byte-for-byte apart from the new local setting.
  umask 077
  printf '\n%s\n%s\n' \
    '# Local E2E only; never copy this value to a deployed environment.' \
    "RATE_LIMIT_HMAC_SECRET=$LOCAL_E2E_RATE_LIMIT_HMAC_SECRET" \
    >>"$LOCAL_EDGE_ENV_FILE"
  local_rate_limit_hmac_secret="$LOCAL_E2E_RATE_LIMIT_HMAC_SECRET"
fi

export RATE_LIMIT_HMAC_SECRET="$local_rate_limit_hmac_secret"
unset existing_line local_rate_limit_hmac_secret LOCAL_E2E_RATE_LIMIT_HMAC_SECRET
