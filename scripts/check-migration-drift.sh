#!/usr/bin/env bash
# Fail when production's applied migration history diverges from
# supabase/migrations/ (issue #905; the prod/`main` drift guard behind
# .github/workflows/prod-migrations.yml).
#
# Requires a linked project (`supabase link --project-ref …`) and the
# SUPABASE_ACCESS_TOKEN / SUPABASE_DB_PASSWORD env the workflow exports.
# `supabase migration list` prints Local | Remote | Time rows: a version in
# Local with an empty Remote is a PENDING migration (main is ahead of prod);
# a version in Remote with an empty Local is a REMOTE-ONLY row (prod carries
# history the repo doesn't know — exactly how the 2026-06 histories diverged).
# Either direction is drift; both fail loudly, never silently.
set -euo pipefail

list_output=$(supabase migration list)
printf '%s\n' "$list_output"

# Newer CLI versions draw the table with box characters; normalize to ASCII
# pipes so the field split below works on either format.
normalized=$(printf '%s\n' "$list_output" | sed 's/│/|/g')

pending=$(printf '%s\n' "$normalized" | awk -F'|' '
  NF >= 2 {
    l = $1; r = $2
    gsub(/[[:space:]]/, "", l); gsub(/[[:space:]]/, "", r)
    if (l ~ /^[0-9]+$/ && r == "") print l
  }')

remote_only=$(printf '%s\n' "$normalized" | awk -F'|' '
  NF >= 2 {
    l = $1; r = $2
    gsub(/[[:space:]]/, "", l); gsub(/[[:space:]]/, "", r)
    if (r ~ /^[0-9]+$/ && l == "") print r
  }')

summary() {
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf '%s\n' "$1" >>"$GITHUB_STEP_SUMMARY"
  fi
}

status=0
if [ -n "$pending" ]; then
  echo "::error::Pending migrations not applied to production:" \
    "$(printf '%s' "$pending" | tr '\n' ' ')— run the 'Production migrations'" \
    "workflow with 'apply' from the approved branch (docs/runbooks/RELEASE.md)."
  summary "❌ **Pending in prod:** $(printf '%s' "$pending" | tr '\n' ' ')"
  status=1
fi
if [ -n "$remote_only" ]; then
  echo "::error::Production carries migration versions the repo does not:" \
    "$(printf '%s' "$remote_only" | tr '\n' ' ')— histories have diverged;" \
    "reconcile per docs/runbooks/RELEASE.md before applying anything."
  summary "❌ **Remote-only versions:** $(printf '%s' "$remote_only" | tr '\n' ' ')"
  status=1
fi

if [ "$status" -eq 0 ]; then
  echo "Migration histories agree: production matches supabase/migrations/."
  summary "✅ Production migration history matches \`supabase/migrations/\`."
fi
exit "$status"
