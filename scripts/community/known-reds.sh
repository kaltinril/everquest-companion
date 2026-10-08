#!/usr/bin/env bash
# Run the unit suite and pass only if every failing test is one the community build is KNOWN to
# fail, by name. Used by .github/workflows/community-release.yml; runs locally the same way.
#
#   scripts/community/known-reds.sh
#
# THE KNOWN REDS are the TEST build's own doing, listed in scripts/community/known-reds.txt with the
# reason for each. A new failure, a crash with no named failure, or a known red that stops failing
# (the list should then shrink) all stop the release.
set -uo pipefail

repo=$(git rev-parse --show-toplevel)
cd "$repo"
list="scripts/community/known-reds.txt"
out=$(mktemp)
trap 'rm -f "$out"' EXIT

npm test >"$out" 2>&1
status=$?

# node:test prints each failure as "✖ <name> (<n>ms)", then repeats them under "✖ failing tests:".
failing=$(grep -E '^✖ ' "$out" | grep -v '^✖ failing tests:' | sed -E 's/ \([0-9.]+ms\)$//; s/^✖ //' | sort -u)
known=$(grep -vE '^\s*(#|$)' "$list" | sort -u)

grep -E 'ℹ (tests|pass|fail)' "$out"

if [ $status -ne 0 ] && [ -z "$failing" ]; then
  echo "STOP: the suite failed without naming a failing test; see the output above" >&2
  tail -40 "$out" >&2
  exit 1
fi

new=$(comm -23 <(echo "$failing") <(echo "$known") | grep -v '^$' || true)
fixed=$(comm -13 <(echo "$failing") <(echo "$known") | grep -v '^$' || true)

if [ -n "$new" ]; then
  echo "STOP: failing tests that are not known reds:" >&2
  echo "$new" | sed 's/^/  /' >&2
  exit 1
fi
if [ -n "$fixed" ]; then
  echo "STOP: known reds that now pass; take them out of $list:" >&2
  echo "$fixed" | sed 's/^/  /' >&2
  exit 1
fi
echo "unit suite: only the known reds failed ($(echo "$known" | wc -l | tr -d ' '))"
