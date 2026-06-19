#!/usr/bin/env bash
# run-eval.sh — run a plan-billed agent over eval cases and collect raw outputs.
#
# Usage:
#   scripts/run-eval.sh <agent-name> [repo-dir] [evals-dir]
#
# Defaults: repo-dir=., evals-dir=my-plan-agent/evals
#
# For each cases/<case>/input.md it runs the agent headless on your subscription
# (plain `claude -p`, no --bare, no API key) and appends a record to
# results-vN.json (N = next unused version). Grading the outputs against each
# case's expected.md is done by you / Claude, not this script.

set -euo pipefail

AGENT="${1:?usage: run-eval.sh <agent-name> [repo-dir] [evals-dir]}"
REPO_DIR="${2:-.}"
EVALS_DIR="${3:-my-plan-agent/evals}"
CASES_DIR="$EVALS_DIR/cases"

if [ -n "${ANTHROPIC_API_KEY:-}" ] || [ -n "${ANTHROPIC_AUTH_TOKEN:-}" ]; then
  echo "ANTHROPIC_API_KEY/AUTH_TOKEN is set — that bills per token. Unset it for plan-billed evals." >&2
  exit 1
fi
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }
[ -d "$CASES_DIR" ] || { echo "no cases dir at $CASES_DIR" >&2; exit 1; }

# Pick the next results version.
N=1
while [ -f "$EVALS_DIR/results-v$N.json" ]; do N=$((N + 1)); done
OUT="$EVALS_DIR/results-v$N.json"

echo "Running agent '$AGENT' over cases in $CASES_DIR → $OUT"
records="[]"

for case_dir in "$CASES_DIR"/*/; do
  [ -f "$case_dir/input.md" ] || continue
  name="$(basename "$case_dir")"
  task="$(cat "$case_dir/input.md")"
  echo "  • $name"

  resp="$(cd "$REPO_DIR" && claude -p "Use the $AGENT agent for this task:

$task" --output-format json || echo '{}')"

  rec="$(jq -n \
    --arg name "$name" \
    --arg output "$(printf '%s' "$resp" | jq -r '.result // ""')" \
    --arg sid "$(printf '%s' "$resp" | jq -r '.session_id // ""')" \
    --argjson cost "$(printf '%s' "$resp" | jq '.total_cost_usd // 0')" \
    '{name: $name, verdict: "fail", output: $output, notes: "review vs expected.md", session_id: $sid, total_cost_usd: $cost}')"
  records="$(jq --argjson r "$rec" '. + [$r]' <<<"$records")"
done

jq -n \
  --arg agent "$AGENT" \
  --argjson version "$N" \
  --argjson cases "$records" \
  '{agent: $agent, version: $version, changed: "", cases: $cases}' >"$OUT"

echo "Wrote $OUT. Now grade each case's output against its expected.md and set verdict pass/fail."
