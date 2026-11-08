#!/usr/bin/env bash
# The wiki delta, end to end, as docs/community/agent/DATA_REFRESH.md "Delta procedure" has it run
# by hand: the GitHub pack compare, the delta's dry run, a work tree with the caches junctioned in,
# the delta itself, data-diff and validate-data, one data commit with the counts, the release-mode
# compare, then (unless told not to) the unit gate, the merge into main_community from the main
# tree, and the clean-up of junctions, worktree and branch. Owner's word to run it is the trigger
# (RULES.md rule 15): every run reads the wiki.
#
#   bash scripts/community/wiki-delta.sh                 # the whole run, merged into main_community
#   bash scripts/community/wiki-delta.sh --dry-run       # compare + the delta's dry run; nothing written
#   bash scripts/community/wiki-delta.sh --no-merge      # stop after the data commit on delta-<date>
#   bash scripts/community/wiki-delta.sh --all-pages     # also read every article no cache holds (rare)
#   bash scripts/community/wiki-delta.sh --push          # push main_community to origin after the merge
#   bash scripts/community/wiki-delta.sh --extra="A Title|Another"   # hand-named pages (scrape-delta --extra)
#
# Runs from the MAIN clone's root, on main_community, with a clean tree. Node 24 is found on PATH or
# under %APPDATA%/nvm. The dev app can stay up (nothing here touches out/ or the engine).
#
# What it leaves behind on purpose: the run's log in $TMPDIR (named at the end), and with --dry-run
# the dry run's ledger line, uncommitted in the main clone (the next real run carries it over).
set -uo pipefail

dry=0; merge=1; push=0; allpages=""; extra=""
for a in "$@"; do
  case "$a" in
    --dry-run) dry=1 ;;
    --no-merge) merge=0 ;;
    --push) push=1 ;;
    --all-pages) allpages="--all-pages" ;;
    --extra=*) extra="$a" ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown flag: $a" >&2; exit 2 ;;
  esac
done

say() { printf '\n== %s\n' "$*"; }
die() { echo "STOP: $*" >&2; exit 1; }

# --- where we are -----------------------------------------------------------------------------
repo=$(git rev-parse --show-toplevel) || die "not in a git checkout"
cd "$repo"
[ "$(git rev-parse --git-dir)" = ".git" ] || die "run this from the main clone, not a worktree"
[ "$(git branch --show-current)" = "main_community" ] || die "main clone must be on main_community"
[ -z "$(git status --porcelain)" ] || die "main clone is not clean: commit or revert first"
[ -d scripts/sources/cache/items ] && [ -d scripts/sources/cache/mobs ] || die "the item and mob caches are missing from this clone (DATA_REFRESH.md, caches)"

# --- Node 24 ----------------------------------------------------------------------------------
if ! node -v 2>/dev/null | grep -q '^v24\.'; then
  nv=$(ls -d "${APPDATA:-}"/nvm/v24.* 2>/dev/null | sort -V | tail -1)
  [ -n "$nv" ] || die "Node 24 not on PATH and not under %APPDATA%/nvm"
  export PATH="$nv:$PATH"
fi
echo "node $(node -v) in $repo"
unset ELECTRON_RUN_AS_NODE

date_tag=$(date +%Y-%m-%d)
branch="delta-$date_tag"
n=2
while git show-ref --verify --quiet "refs/heads/$branch"; do branch="delta-$date_tag-$n"; n=$((n + 1)); done
wt="$repo/.claude/worktrees/$branch"
log="${TMPDIR:-/tmp}/wiki-delta-$date_tag-$$.log"; : > "$log"
echo "log: $log"
run() { "$@" 2>&1 | tee -a "$log"; return "${PIPESTATUS[0]}"; }

# --- 1. the pack compare, 2. the dry run (both in the main clone) ------------------------------
say "GitHub pack compare"
run npx tsx scripts/eoz-compare.mts || die "eoz-compare failed"

say "delta dry run (reads the wiki's recent changes)"
run npx tsx scripts/scrape-delta.mts --dry-run $allpages || die "dry run failed"
if [ "$dry" = 1 ]; then
  echo
  echo "Dry run only. The dry run's ledger line is uncommitted in docs/community/wiki-usage/ledger.jsonl;"
  echo "a real run carries it into its work branch. Log: $log"
  exit 0
fi
# The dry run appended its line to the main clone's ledger: keep the text, clear the tree.
ledger=docs/community/wiki-usage/ledger.jsonl
dry_lines=$(git diff --no-color -- "$ledger" | grep '^+{' | sed 's/^+//' || true)
git checkout -- "$ledger"

# --- 3. the work tree, caches junctioned in -----------------------------------------------------
say "work tree $wt on $branch"
git worktree add -b "$branch" "$wt" main_community >/dev/null || die "worktree add failed"
wwt=$(cygpath -w "$wt"); wrepo=$(cygpath -w "$repo")
powershell -NoProfile -Command "
  New-Item -ItemType Junction -Path '$wwt\\node_modules' -Target '$wrepo\\node_modules' | Out-Null
  foreach (\$c in 'items','mobs','rendered','eoz') {
    New-Item -ItemType Junction -Path \"$wwt\\scripts\\sources\\cache\\\$c\" -Target \"$wrepo\\scripts\\sources\\cache\\\$c\" | Out-Null
  }" || die "junctions failed"
for p in node_modules scripts/sources/cache/items scripts/sources/cache/mobs scripts/sources/cache/rendered scripts/sources/cache/eoz; do
  [ -d "$wt/$p" ] || die "junction missing: $wt/$p"
done
if [ -n "$dry_lines" ]; then printf '%s\n' "$dry_lines" >> "$wt/$ledger"; fi

cleanup_tree() {
  # Junctions first, by handle (rm -rf would follow them into the main clone's files), then the tree.
  powershell -NoProfile -Command "
    foreach (\$p in 'node_modules','scripts\\sources\\cache\\items','scripts\\sources\\cache\\mobs','scripts\\sources\\cache\\rendered','scripts\\sources\\cache\\eoz') {
      \$j = Join-Path '$wwt' \$p; if (Test-Path \$j) { (Get-Item \$j).Delete() }
    }" >/dev/null
  git worktree remove --force "$wt" >/dev/null 2>&1 || true
}

# --- 4. the delta, 5. diff and validate (in the work tree) ---------------------------------------
cd "$wt"
say "delta --titles-from-compare $allpages $extra"
run npx tsx scripts/scrape-delta.mts --titles-from-compare $allpages $extra || { cleanup_tree; die "the delta failed; branch $branch kept for a look"; }
say "data-diff"
run npx tsx scripts/data-diff.mts || die "data-diff failed"
say "validate-data"
run npx tsx scripts/validate-data.mts || die "validate-data failed"

# --- 6. the data commit, with the counts --------------------------------------------------------
say "commit"
git add -A
if git diff --cached --name-only | grep -qE '^(node_modules|scripts/sources/cache/(items|mobs|rendered|eoz))/'; then
  die "a junctioned path is staged; unstage it before committing"
fi
if git diff --cached --quiet; then
  echo "nothing changed: no data commit"
  changed=0
else
  changed=1
  pages=$(grep -E '^\s+[0-9]+ pages changed' "$log" | tail -1 | sed -E 's/^\s+//' || true)
  wiki=$(grep -E '^Wiki requests this run' "$log" | sed -E 's/^Wiki requests this run: //' | paste -sd ';' - || true)
  diffsum=$(awk '/^== data-diff/{f=1;next} /^== validate-data/{f=0} f && /^src\//' "$log" || true)
  git commit -q -F - <<EOF
Delta scrape $date_tag: ${pages:-see log}

Wiki requests (ledger): ${wiki:-see ledger.jsonl}

data-diff:
${diffsum:-unchanged}
EOF
  git log --oneline -1
fi

# --- 7. the release-mode compare ---------------------------------------------------------------
say "compare --release"
run npx tsx scripts/eoz-compare.mts --release || echo "NOTE: the release compare says something is behind; read it before releasing"

if [ "$merge" = 0 ]; then
  echo
  echo "Stopped before the gate and merge (--no-merge). Branch $branch in $wt, junctions in place."
  echo "Finish with: known-reds.sh there, then from the main clone: git merge --no-ff $branch; remove the junctions by handle, the worktree and the branch. Log: $log"
  exit 0
fi

# --- 8. gate on the branch, merge from the main tree, clean up ------------------------------------
if [ "$changed" = 1 ]; then
  say "unit gate on $branch (known-reds.sh)"
  run bash scripts/community/known-reds.sh || { echo "the gate is red on $branch; the tree and branch are kept in $wt. Clear the reds there (DATA_REFRESH.md, 'Expect new reds'), then merge by hand." >&2; exit 1; }
fi
cd "$repo"
say "merge into main_community"
if [ "$changed" = 1 ]; then
  git merge --no-ff --no-edit "$branch" || die "merge failed; resolve in $repo"
fi
cleanup_tree
git branch -d "$branch" >/dev/null 2>&1 || git branch -D "$branch" >/dev/null 2>&1 || true
git worktree prune
if [ "$push" = 1 ] && [ "$changed" = 1 ]; then
  say "push"
  git push origin main_community || die "push failed"
fi
echo
echo "Done. main_community at $(git rev-parse --short HEAD). Log: $log"
[ "$changed" = 1 ] || echo "(no data changed; nothing merged)"
