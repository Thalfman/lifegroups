#!/usr/bin/env bash
# doc-inventory.sh — factual spine for a doc sweep.
# Lists every markdown doc with last-commit date/age + line count, and scans
# for dead relative links. Read-only; makes no changes.
#
# Usage: scripts/doc-inventory.sh [REPO_ROOT]   (default: current directory)

set -euo pipefail

ROOT="${1:-.}"
cd "$ROOT"

# Directories never worth inventorying. `.agents`/`.claude`/`.cursor` hold
# installed skill & tooling docs — not the project's own documentation — so they
# are pruned to keep the signal on docs that drift as the app evolves.
PRUNE=( .git node_modules .next dist build out coverage vendor .turbo .vercel
        .agents .claude .cursor )

# Build a find prune expression.
prune_expr=()
for d in "${PRUNE[@]}"; do
  prune_expr+=( -name "$d" -o )
done
unset 'prune_expr[${#prune_expr[@]}-1]'  # drop trailing -o

mapfile -t FILES < <(
  find . \( "${prune_expr[@]}" \) -prune -o \
       -type f \( -iname '*.md' -o -iname '*.mdx' \) -print | sort
)

have_git=0
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then have_git=1; fi

echo "# Doc inventory"
echo "# root: $(pwd)"
echo "# generated: $(date '+%Y-%m-%d %H:%M:%S')"
echo "# files: ${#FILES[@]}"
echo

# ---- Inventory table -------------------------------------------------------
printf '%-58s %-12s %-16s %6s\n' "FILE" "LAST COMMIT" "AGE" "LINES"
printf '%-58s %-12s %-16s %6s\n' "----" "-----------" "---" "-----"
for f in "${FILES[@]}"; do
  rel="${f#./}"
  lines=$(wc -l < "$f" | tr -d ' ')
  if [ "$have_git" -eq 1 ]; then
    if git ls-files --error-unmatch -- "$f" >/dev/null 2>&1; then
      # Tracked. In a shallow clone `git log` may lack history for a path; that
      # is a missing-history signal, NOT an untracked file — keep them distinct.
      date=$(git log -1 --format=%cs -- "$f" 2>/dev/null || true)
      age=$(git log -1 --format=%cr -- "$f" 2>/dev/null || true)
      [ -z "$date" ] && { date="(no history)"; age="shallow?"; }
    else
      date="(untracked)"; age="-"
    fi
  else
    date="(no git)"; age="-"
  fi
  printf '%-58s %-12s %-16s %6s\n' "$rel" "$date" "$age" "$lines"
done

# ---- Dead relative-link scan ----------------------------------------------
echo
echo "# Dead relative links (target file does not exist)"
echo "# (skips http(s)://, mailto:, and pure #anchor links)"
dead=0
for f in "${FILES[@]}"; do
  dir=$(dirname "$f")
  # Extract markdown link targets in two forms, so parens inside a target don't
  # truncate it:
  #   1. angle-wrapped  ](<...>)  — target may contain '(' ')' e.g. Next.js
  #      route groups like (protected); read everything between < and >.
  #   2. plain          ](target) — target has no '<' and no ')'; stop at ')'.
  while IFS= read -r target; do
    [ -z "$target" ] && continue
    case "$target" in
      http://*|https://*|mailto:*|\#*|/*) continue ;;  # external / abs / anchor
    esac
    # strip anchor and query
    path="${target%%#*}"; path="${path%%\?*}"
    [ -z "$path" ] && continue
    if [ ! -e "$dir/$path" ]; then
      printf '  %-50s -> %s\n' "${f#./}" "$target"
      dead=$((dead+1))
    fi
  done < <(
    {
      # `|| true` so a no-match grep (exit 1 under `set -o pipefail`) does not
      # abort the block before the second extractor runs.
      { grep -oE '\]\(<[^>]*>\)' "$f" 2>/dev/null | sed -E 's/^\]\(<//; s/>\)$//'; } || true
      { grep -oE '\]\([^<)][^)]*\)' "$f" 2>/dev/null | sed -E 's/^\]\(//; s/\)$//'; } || true
    }
  )
done
[ "$dead" -eq 0 ] && echo "  none found"
echo
echo "# dead-link count: $dead"
