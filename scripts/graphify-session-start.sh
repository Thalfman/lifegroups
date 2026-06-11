#!/bin/sh
# Claude Code SessionStart hook: keep the clean Product Surface graph fresh.
# The hook runs in the background and always exits 0. Log:
# graphify-out/.update.log (gitignored).
cd "$(dirname "$0")/.." || exit 0

GRAPHIFY_VERSION="$(cat .graphify-version 2>/dev/null)"
[ -n "$GRAPHIFY_VERSION" ] || exit 0

(
  export PATH="$HOME/.local/bin:$APPDATA/Python/Python312/Scripts:$PATH"
  mkdir -p graphify-out

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

  npm run graph:product
) >graphify-out/.update.log 2>&1 &

exit 0
