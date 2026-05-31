#!/usr/bin/env bash
# Block dangerous git commands before they execute.
set -euo pipefail

INPUT=$(cat)
CMD=$(echo "$INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"command"[[:space:]]*:[[:space:]]*"//; s/"$//')

# Strip quoted spans so words inside commit messages / args don't false-match.
# Unescape JSON \" first, then remove "..." and '...' regions.
SCAN=${CMD//\\\"/\"}
SCAN=$(echo "$SCAN" | sed -E 's/"[^"]*"//g; s/'\''[^'\'']*'\''//g')

# Patterns are extended regexes matched against the de-quoted command.
# Anchored to the git subcommand position to avoid matching substrings in paths/args.
DANGEROUS=(
  '(^|[;&|] *)git +([^;&|]* )?push'
  'git +([^;&|]* )?reset +([^;&|]* )?--hard'
  'git +([^;&|]* )?clean +([^;&|]* )?-[a-z]*f'
  'git +([^;&|]* )?branch +([^;&|]* )?-D'
  'git +([^;&|]* )?checkout +\.'
  'git +([^;&|]* )?restore +\.'
)

for pattern in "${DANGEROUS[@]}"; do
  if [[ "$SCAN" =~ $pattern ]]; then
    echo "BLOCKED: '$CMD' matches dangerous git pattern. The user has prevented you from doing this." >&2
    exit 2
  fi
done

exit 0
