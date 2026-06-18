#!/bin/bash
# SessionStart hook: install dependencies so lint, typecheck, build, and tests
# work in Claude Code on the web sessions (each cloud session is a fresh VM).
# Web-only, fresh-startup only, idempotent: skips when deps are already present
# and keeps verbose install output out of the model's context.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# Skip when dependencies are already installed (e.g. a cached/resumed container).
if [ -x node_modules/.bin/vitest ]; then
  echo "Dependencies already present; skipping npm install."
  exit 0
fi

# Redirect verbose install/audit/warning output to a log file so it does not
# flood the first model request; surface only a one-line summary on stdout.
log="$(mktemp)"
if npm install --no-audit --no-fund >"$log" 2>&1; then
  echo "Dependencies installed via npm install (log: $log)."
else
  status=$?
  echo "npm install failed (exit $status); last lines:" >&2
  tail -n 20 "$log" >&2
  exit "$status"
fi
