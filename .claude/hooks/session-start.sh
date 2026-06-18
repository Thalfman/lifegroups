#!/bin/bash
# SessionStart hook: install dependencies so lint, typecheck, build, and tests
# work in Claude Code on the web sessions (each cloud session is a fresh VM).
# Web-only: no-op on local machines that manage their own dependencies.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# Prefer `npm install` (not `npm ci`) so the post-hook container cache is reused.
npm install
