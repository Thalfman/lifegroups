#!/bin/sh
# Claude Code SessionStart hook: keep the graphify knowledge graph fresh.
# Installs the CLI if missing, then re-extracts changed files (AST-only, no
# API key). Everything runs in the background so session startup is never
# blocked, and the hook always exits 0 so a graph problem can't break a
# session. Log: graphify-out/.update.log (gitignored).
cd "$(dirname "$0")/.." || exit 0

(
  export PATH="$HOME/.local/bin:$PATH"

  if ! command -v graphify >/dev/null 2>&1; then
    if command -v uv >/dev/null 2>&1; then
      uv tool install graphifyy
    elif command -v pipx >/dev/null 2>&1; then
      pipx install graphifyy
    elif command -v python3 >/dev/null 2>&1; then
      python3 -m pip install --user graphifyy
    fi
  fi

  if command -v graphify >/dev/null 2>&1 && [ -f graphify-out/graph.json ]; then
    graphify update .
  fi
) >graphify-out/.update.log 2>&1 &

exit 0
