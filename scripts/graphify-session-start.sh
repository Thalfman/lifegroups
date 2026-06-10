#!/bin/sh
# Claude Code SessionStart hook: keep the graphify knowledge graph fresh.
# Installs the CLI if missing, then re-extracts changed files (AST-only, no
# API key). Everything runs in the background so session startup is never
# blocked, and the hook always exits 0 so a graph problem can't break a
# session. Log: graphify-out/.update.log (gitignored).
cd "$(dirname "$0")/.." || exit 0

# Pinned (single source of truth: .graphify-version) so an auto-run hook
# never pulls an unreviewed upstream release and so every machine writes
# graph artifacts with the same version. Bump deliberately and re-verify.
GRAPHIFY_VERSION="$(cat .graphify-version 2>/dev/null)"
[ -n "$GRAPHIFY_VERSION" ] || exit 0

(
  export PATH="$HOME/.local/bin:$PATH"

  if ! command -v graphify >/dev/null 2>&1; then
    if command -v uv >/dev/null 2>&1; then
      uv tool install "graphifyy==$GRAPHIFY_VERSION"
    elif command -v pipx >/dev/null 2>&1; then
      pipx install "graphifyy==$GRAPHIFY_VERSION"
    elif command -v python3 >/dev/null 2>&1; then
      python3 -m pip install --user "graphifyy==$GRAPHIFY_VERSION"
    fi
  fi

  if command -v graphify >/dev/null 2>&1; then
    # JSON-aware merge for graph.json (see .gitattributes); absolute path so
    # merges work in shells where ~/.local/bin isn't on PATH.
    git config merge.graphify.driver "$(command -v graphify) merge-driver %O %A %B"
    if [ "$(graphify --version 2>/dev/null | awk '{print $2}')" = "$GRAPHIFY_VERSION" ]; then
      [ -f graphify-out/graph.json ] && graphify update .
    else
      echo "graphify on PATH is not $GRAPHIFY_VERSION; skipping auto-update so graph artifacts stay reproducible"
    fi
  fi
) >graphify-out/.update.log 2>&1 &

exit 0
