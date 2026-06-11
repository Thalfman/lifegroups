#!/bin/sh
# Claude Code SessionStart hook: keep the Graphify knowledge graph fresh.
# Installs the pinned CLI if missing, then lets the repo wrapper stage a clean
# corpus and refresh the full graph in the background. Log:
# graphify-out/.update.log (gitignored).
cd "$(dirname "$0")/.." || exit 0

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
    git config merge.graphify.driver "$(command -v graphify) merge-driver %O %A %B"
  fi

  # scripts/graphify.mjs also finds the Windows user Scripts install location
  # when graphify.exe is not on PATH.
  [ -f scripts/graphify.mjs ] && node scripts/graphify.mjs build full --quiet
) >graphify-out/.update.log 2>&1 &

exit 0
