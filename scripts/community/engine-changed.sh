#!/usr/bin/env bash
# Prints "yes" when this branch touches an engine input, "no" when it does not. The gate runs
# `cargo test` only on yes (RULES.md rule 11; docs/community/agent/WORKFLOW.md, Gate).
#
#   bash scripts/community/engine-changed.sh [base]     (base defaults to main_community)
#
# Changed = `git diff --name-only <base>...HEAD`, plus uncommitted and untracked files, so a
# half-committed tree never reads as "no". The paths are in scripts/community/engine-inputs.txt.
set -euo pipefail

base="${1:-main_community}"
repo=$(git rev-parse --show-toplevel)
cd "$repo"

mapfile -t inputs < <(tr -d '\r' < scripts/community/engine-inputs.txt | grep -v '^#' | grep -v '^[[:space:]]*$')
[ "${#inputs[@]}" -gt 0 ] || { echo "engine-changed: no paths in engine-inputs.txt" >&2; exit 2; }

# Each git call on its own line, so a bad base fails the script instead of reading as "no".
committed=$(git diff --name-only "$base"...HEAD)
uncommitted=$(git diff --name-only HEAD)
untracked=$(git ls-files --others --exclude-standard)
changed=$(printf '%s\n%s\n%s\n' "$committed" "$uncommitted" "$untracked")

while IFS= read -r path; do
  [ -n "$path" ] || continue
  for input in "${inputs[@]}"; do
    case "$input" in
      */) [[ "$path" == "$input"* ]] && { echo yes; exit 0; } ;;
      *) [[ "$path" == "$input" ]] && { echo yes; exit 0; } ;;
    esac
  done
done <<< "$changed"
echo no
