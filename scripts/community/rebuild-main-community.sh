#!/usr/bin/env bash
# Rebuild main_community from the recipe in docs/community/BRANCHES.md.
#
#   scripts/community/rebuild-main-community.sh [--replace] [--target <branch>] [--base <ref>]
#
# Builds <target> (default: main_community-rebuild) as a fresh branch off <base> (default: main),
# merging every branch in the recipe in order, then prints a tree diff against main_community.
# An empty diff means the recipe reproduces the current build. --replace deletes and recreates
# the target (refuses if a worktree has it checked out). Conflicts stop the script; resolve in
# the temporary worktree it names, commit, and re-run: rerere replays what it has seen before.
#
# See docs/community/RULES.md rule 3 and rule 9.
set -euo pipefail

repo=$(git rev-parse --show-toplevel)
recipe_file="$repo/docs/community/BRANCHES.md"
target=main_community-rebuild
base=main
replace=0
while [ $# -gt 0 ]; do
  case "$1" in
    --replace) replace=1 ;;
    --target) target=$2; shift ;;
    --base) base=$2; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

# The recipe is the fenced ```recipe block: one branch per line, # comments, blank lines ignored.
mapfile -t recipe < <(awk '/^```recipe/{on=1;next} /^```/{on=0} on' "$recipe_file" | sed 's/#.*//' | awk 'NF')
[ ${#recipe[@]} -gt 0 ] || { echo "no recipe found in $recipe_file" >&2; exit 1; }

for b in "${recipe[@]}"; do
  git rev-parse --verify -q "refs/heads/$b" >/dev/null || { echo "recipe names a branch that does not exist locally: $b" >&2; exit 1; }
done

if git rev-parse --verify -q "refs/heads/$target" >/dev/null; then
  if [ $replace -eq 1 ]; then
    if git worktree list --porcelain | grep -qx "branch refs/heads/$target"; then
      echo "$target is checked out in a worktree; detach it first" >&2; exit 1
    fi
    git branch -D "$target"
  else
    echo "$target exists; pass --replace to rebuild it" >&2; exit 1
  fi
fi

wt=$(mktemp -d "${TMPDIR:-/tmp}/eqc-rebuild.XXXXXX")
rmdir "$wt"
git worktree add -q -b "$target" "$wt" "$base"
echo "building $target from $base in $wt"

cd "$wt"
git config rerere.enabled true
for b in "${recipe[@]}"; do
  echo "== merge $b"
  if ! git merge --no-ff --no-edit -m "recipe: merge $b" "$b" >/dev/null 2>&1; then
    # rerere may have resolved everything it has seen before; only unresolved paths block.
    if [ -z "$(git diff --name-only --diff-filter=U)" ]; then
      git commit -q --no-edit
      echo "   conflicts replayed by rerere"
    else
      echo "CONFLICT merging $b. Resolve in $wt, commit, then re-run with --target $target." >&2
      echo "Unresolved:" >&2; git diff --name-only --diff-filter=U >&2
      exit 1
    fi
  fi
done

echo
echo "== $target built: $(git rev-parse --short HEAD), tree $(git rev-parse --short HEAD^{tree})"
if git rev-parse --verify -q refs/heads/main_community >/dev/null; then
  echo "== tree diff against main_community (empty means the recipe reproduces it):"
  git diff --stat main_community "$target" -- . ':!*.tsbuildinfo' || true
fi
echo
echo "worktree left at $wt; remove with: git worktree remove $wt"
