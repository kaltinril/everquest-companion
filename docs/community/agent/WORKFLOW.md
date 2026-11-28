# Agent workflow notes

Operational facts for agents working in this clone. Terse on purpose. RULES.md holds the rules;
this file holds the how, the traps, and the owner rulings that are not rules. Where they
disagree, RULES.md wins; fix this file.

## Environment

- **Node 24 only.** Under Node 22, tsx loads the ESM graph twice: `installSpellDb` writes one copy
  of `src/main/log/rulesets.ts` while the parser reads the other, giving ~252 false failures in
  every spell-DB test. CI pins `node-version: 24`. Never "fix" those tests. With nvm-windows,
  `nvm use` does not carry into a tool call: put the v24 directory first on `PATH` or call its
  `node.exe` directly.
- **`ELECTRON_RUN_AS_NODE` must be unset** for e2e and `npm run dev`. Shells spawned by a VS Code
  extension inherit `ELECTRON_RUN_AS_NODE=1`; Electron then runs as plain Node (`electron.app`
  undefined, "Process failed to launch!", or `Cannot read properties of undefined (reading
  'isPackaged')`). Bash: `unset ELECTRON_RUN_AS_NODE`. PowerShell:
  `Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue`.
- **Clear dev caches before `npm run dev`:** `rm -rf node_modules/.vite
  "$APPDATA/everquest-companion-dev/Cache" "$APPDATA/everquest-companion-dev/Code Cache"`. A stale
  vite pre-bundle once made title-bar clicks, overlay checkboxes and the character picker
  silently do nothing with identical code (2026-08-25). If clicks do nothing and the renderer
  logs no error, suspect this first.
- **cargo** lives at `$USERPROFILE/.cargo/bin`.
- **Lean debug info (since 2026-11-27):** `engine/Cargo.toml` `[profile.dev] debug =
  "line-tables-only"`. Panics and backtraces keep file and line; a debugger loses variable views.
  For one run with full info: `CARGO_PROFILE_DEV_DEBUG=true cargo test ...`. The debug builds in
  the main clone are deleted at each release (the community-release skill, "After").
- **Shared build cache (sccache, since 2026-11-27).** `%USERPROFILE%\.cargo\config.toml` holds
  `[build] rustc-wrapper = "C:/Users/<user>/.cargo/bin/sccache.exe"`, so every cargo run on this
  PC, in the main clone and every worktree, already open shells included, goes through sccache.
  Nothing to set per worktree. sccache caches a crates.io dependency's compile by content (cache
  `%LOCALAPPDATA%\Mozilla\sccache\cache`, 10 GiB cap) and copies it into the tree's own
  `engine/target`; the engine's own crates still compile in every tree that runs cargo, and two
  trees never share a target dir. (The e2e harness may COPY the main clone's release
  `engined.exe` instead of running cargo at all: Gate, "Engine binary reuse".) Installed as the prebuilt
  `sccache-v0.19.0-x86_64-pc-windows-msvc.zip` from mozilla/sccache's GitHub releases (sha256
  checked), `sccache.exe` copied to `%USERPROFILE%\.cargo\bin`; never `cargo install` it (a long
  compile). If `sccache.exe` is removed, delete the config line too, or every cargo build fails.
  CI has neither and is unchanged. `sccache --show-stats` shows hits.
  - What it saves, measured 2026-11-27 (fresh worktree, BelowNormal, 16 cores, toolchain 1.100.1):
    debug `cargo test --workspace --no-run` 85 s cold, 69 to 75 s from a warm cache; release
    `cargo build --release -p engined` 47 s cold, 37 s warm. About 77% of cacheable compiles hit
    in a new tree (110 of 142); the misses are path-bound (crates.io crates whose build script
    writes into the tree's `OUT_DIR`, and the release builds of our own crates). Not cacheable at
    all: our crates in debug (incremental), build scripts (`bin`), proc-macros.
  - Where the time really goes: our own crates are ~75% of a debug build's unit time (530 of 706
    s; `fold`'s test target alone 37 s; ~60 test binaries each linked separately). The cache cannot
    touch that.
  - Disk is unchanged: 8.1 GB per tree (debug 7.8, release 0.35). 4 GB of debug is `.pdb`
    debuginfo of 84 exes, 1.9 GB incremental. Measured, not adopted (owner's call):
    `CARGO_PROFILE_DEV_DEBUG=line-tables-only` (or `[profile.dev] debug = "line-tables-only"` in
    `engine/Cargo.toml`) gave debug 4.5 GB and 59 s, even with every dependency recompiled.
  - TRAP: rustc runs under the sccache SERVER, not under cargo, at the priority the server was
    started with; it idles out after 10 minutes. A BelowNormal cargo that starts it makes a
    BelowNormal server (measured); a normal-priority cargo makes every later compile normal until
    it idles out. `npm run build:engine` and the e2e build lower their own priority before cargo
    (`atBelowNormalPriority`, `scripts/build-engine.mts`), so builds the repo starts keep it low.
- **Never share a `CARGO_TARGET_DIR` between trees** (the old way to reuse a warm build; the
  cache replaces it). TRAP (2026-10-29): Cargo names a workspace member's artifacts by its path
  inside the workspace, so every worktree's `fold` is the SAME `libfold-<hash>` in a shared target
  dir; a parallel helper's build replaced it and `cargo test` ran the new test files against the
  other tree's code (a feature's own tests read as if the feature were missing, then passed again
  on the next rebuild). A scratch target dir is deleted when done (RULES.md rule 18).
- **Engine rebuild after merging engine changes:** `npm run build:engine` in the main clone. The
  dev app resolves `engine/target/release`, and runs a COPY at
  `%APPDATA%/everquest-companion-dev/engine-run/engined.exe`, so an open app never blocks a rebuild.
- **The user's game log** is `<EQ install>/Logs/eqlog_<Character>_<server>.txt`. Its archived months are
  `<EQ install>/Logs/companion-archive/*.log.gz` (since 2026-10-07; `logArchiveDir()`); a live log can
  start weeks back after an archive, so read both. `%APPDATA%/everquest-companion-*/log-archive` is the
  folder from before that move: stale, read by nothing (2026-11-25: searching it alone made the
  owner's history look cut at Oct 6). The install path
  is recorded in `%APPDATA%/everquest-companion-dev/everquest-companion-progress.json`; read it
  there instead of scanning drives (a drive-wide `find` times out).
- **No prettier.** The repo has no prettier config; `npx prettier --write` reflows whole files to
  defaults. Never run it.
- **`cargo fmt -p <crate>` rewrites dozens of unrelated files** (the trunk is not fmt-clean,
  2026-11-23: about 60 in fold, 3 in engined). Run `rustfmt --edition 2021 <files you touched>`
  instead, and tell helpers so.
- **A worktree's `rm -rf node_modules/.cache/eslint` goes through the junction** and clears the main
  clone's lint cache. Harmless (a cache), but the next lint there runs cold.

## The user's machine

- **The dev app is not launched while the installed build is running** (owner, 2026-11-17: "you
  can't run dev when its up"). Check for `EQ Legends Companion TEST.exe` before a launch; if it is
  up, ask the owner to quit it, never close it yourself (`start-companion` skill, step 0).
- Never stop, kill or close the user's processes (game, the installed app, the dev app they are
  using) without asking. If a build target is locked, build to a fresh output dir
  (`npx electron-builder --win --dir -c.directories.output=release/dev`) and say where it is.
- **Before the owner tests in the dev app, copy their settings down from the installed build**
  (owner, 2026-11-12: "always copy my settings down from prod to the dev"):
  `%APPDATA%\everquest-companion-test` to `%APPDATA%\everquest-companion-dev`, one way, with no
  backup of dev (owner, 2026-11-21). The file list and what to leave alone are step 2 of the `start-companion` skill.
- **That copy does not carry the remembered view choices** (measured 2026-11-16: 56 of prod's 69
  differed or were missing in dev). Pet layout, Fight/Overall, drills, Gaps marks, Gear and Planner
  filters live in each app's `Local Storage\leveldb`, keyed by page origin: prod under `file://`,
  the dev server under `http://localhost:5173`. The owner expects them to match too ("the combat
  section is not on the same setting as production"). Done by hand once, both apps closed, dev's
  leveldb backed up first: open a COPY of prod's leveldb with `classic-level` (buffer encodings),
  take every key starting `_file://\0`, and put it into dev's leveldb under
  `_http://localhost:5173\0`. Key and value are one byte (1 = Latin-1, 0 = UTF-16LE) then the text.
  Dev-only keys are left alone. Open: landing this as a script with `classic-level` as a dev
  dependency waits on the owner's word.
- Stopping a dev app the agent itself launched: stopping the shell task can leave the
  `electron-vite dev --watch` node process alive (README.md, "Merge while the dev app is up").
  Stop that node PID; its Electron exits with it. The single-instance lock means an old instance
  must be gone before a relaunch.

## Branch work

- **The model** (owner, 2026-10-26; RULES.md rules 1 to 3): `main_community` is the trunk. A change
  is made on a short-lived work branch in a temporary worktree off `main_community`, gated, merged
  back, and the worktree and branch removed. The per-feature branches, `catch_all` and the
  never-closing branches are retired: never commit to them, never merge them. Related fixes may
  share one work branch; one commit per fix keeps the history readable.
- **Worktrees:** `git worktree add -b <name> .claude/worktrees/<name> main_community` (or under the
  session's temp directory for a short job). Give it a `node_modules` junction to the main clone so
  tsc/eslint/tests run in place. Make the junction with PowerShell
  `New-Item -ItemType Junction -Path <wt>\node_modules -Target <clone>\node_modules` (Git Bash
  `mklink` mangles paths). Without it, a gate grep can false-pass: npm's tool-not-found text
  contains no "error". Check real exit codes. The engine needs no setup: its own `engine/target`
  fills from the shared build cache on the first cargo run (Environment, "Shared build cache");
  do not point `CARGO_TARGET_DIR` at another tree. A branch that changes no engine input runs no
  cargo at all: e2e copies the main clone's `engined.exe` (Gate, "Engine binary reuse") and the gate
  skips `cargo test` (`bash scripts/community/engine-changed.sh` prints no).
- **A dependency change needs its own `node_modules`, and that one still leaks** (2026-11-27, MUI 7
  to 9). A worktree under `.claude/worktrees/` sits inside the main clone, so any module missing
  from the worktree's own install is resolved from the main clone's `node_modules` one level up, by
  tsc and vite alike: four icons MUI 9 had removed typechecked clean against MUI 7's copies. After a
  bump, run `npx tsc --noEmit -p tsconfig.web.json --tsBuildInfoFile <scratch>/x --traceResolution |
  grep "resolved to 'C:/git/everquest-companion/node_modules"` (and the same for tsconfig.node.json):
  it must print nothing. The scratch build-info file also keeps the incremental cache from hiding a
  file whose imports broke but whose text did not change.
- **Stage your own files by name in a shared worktree.** Several sessions may write to one tree at
  once (the owner often has a second agent drafting a plan). `git add docs/community` sweeps their
  uncommitted drafts into your commit (2026-10-20: a screenshot-to-wiki plan went out under a
  requirements commit). `git add <path>` each file you changed, and read `git status` before
  committing.
- **Conflicts are resolved on the work branch, never in the main clone.** A merge into the main
  clone that stops on a conflict leaves conflict markers under `src/`, the dev app's `--watch`
  rebuilds them, and the app crashes on the owner (2026-10-11). When `main_community` has moved
  since the work branch was made, merge `main_community` into the work branch in its worktree,
  resolve there and gate; the merge into `main_community` is then clean.
- **Merge from the main tree, never from inside a worktree.** `cd <worktree> && git commit && git
  merge X` merges in the worktree. Run the merge into `main_community` as its own command in the
  main clone.
- **Check `main_community` before starting.** Several agent sessions may merge in the same hour:
  `git log` first, and branch from the current tip.
- **Parallel tool calls share one cwd.** Two parallel commands that `cd` into different worktrees
  can commit into the wrong tree. Run worktree commits sequentially.
- **tsbuildinfo churn:** typecheck rewrites `tsconfig.*.tsbuildinfo`. Restore before committing or
  merging: `git checkout -- tsconfig.node.tsbuildinfo tsconfig.web.tsbuildinfo` (and `git clean
  -fq tsconfig.*.tsbuildinfo` for untracked ones). On a merge conflict in them, take `--theirs`.
  `git add -A` in a worktree picks them up.
- **Never `git add -A` a half-resolved merge.** A file with conflict markers was committed that
  way once (2026-09-12).
- **Never `--amend` a commit `main_community` already has** (re-merge conflicts). Rewrite an
  unpushed, unmerged commit only.
- **Protocol files:** on a merge, regenerate with `npm run gen:protocol`; never hand-merge them. A
  schema field means: edit `protocol/schema/messages.schema.json`, `npm run gen:protocol` (needs
  cargo), update `protocol/fixtures/*.json` and `engine/crates/engined/tests/harness/mod.rs`,
  commit together.
- **`dataWeight.generated.json` regens are timing noise** unless data bytes changed; do not commit
  one alone.
- **One copy of each file.** Before 2026-10-26 a file two branches needed was kept byte-identical
  on both; on the trunk each file exists once, and nothing is kept in step by hand any more.

## Gate

- **THE STANDING RULE: SCOPED, NOT THE FULL SUITE** (owner, 2026-11-26, after two full-suite runs
  for a small cursor-ring change: "i want it to be as small of tests so we are not wasting my
  time"). Every work branch gets: `npm run typecheck` (restore tsbuildinfo), `npm run lint` (or
  `npx eslint <changed files>` for a small change), and only the affected unit test files on Node 24:
  `grep -lE "<changed basenames, exported names>" tests/*.test.mts`, plus the tests that scan the
  source tree when a file is added or removed. Run them with
  `node --import tsx --test --test-concurrency=4 <files>`. No `known-reds.sh`, no
  `cargo test --workspace`, no e2e for an ordinary merge. The full suite runs before a release
  (RELEASING.md) or on the owner's word. The older bullets below are history; where they say
  "full gate", read the scoped gate, except for a release.
- **How `npm test` runs (since 2026-11-27, `scripts/unitTests.mts`).** No longer one process per
  file. Files with no shared-process hazard run POOLED: 4 processes, each importing its share of
  the files one after another (a generated wrapper per pool), so a pool parses items/mobs/spells
  once. The rest run ISOLATED, one process each, as before. Both go through node's own `run()`
  and spec reporter: one summary, the same `✔`/`✖`/`ℹ` lines, so `known-reds.sh` is unchanged.
  At most `--test-concurrency` processes at once (testGate's `auto`: min(10, cores)), the pools
  and the longest files first (last run's per-file times in `node_modules/.cache/eqc-unit-times.json`;
  a file never timed starts first). The runner lowers itself to BelowNormal; its test processes inherit it.
  - The isolated-file rule: a file is isolated when its source matches one of `ISOLATION_RULES`
    in `scripts/unitTests.mts` (`mock.timers`; a `process.env` write; any `globalThis`;
    `child_process`/`worker_threads`; a top-level `before`/`after`/`beforeEach`/`afterEach`, which
    would wrap every file in the pool; `process.on`/`exit`/`exitCode`/`chdir`; a bare `mock.*` not on
    a test context), or is named in `scripts/unit-isolated.txt` with its reason (empty today).
    `node --import tsx scripts/unitTests.mts --list` prints the pools and each isolated file with
    the rule that caught it (68 of 723 files, 2026-11-27). `tests/unitTestsRunner.test.mts` pins
    each rule.
  - A file that throws while loading becomes a failing test named after the file
    (`✖ tests\x.test.mts`), even after it registered tests. That is why `--test-isolation=none`
    is NOT used: node drops such a throw silently once the file has registered one test (measured
    on Node 24.19).
  - A pooled file that fails but passes alone is a leak between files: confirm with
    `EQC_UNIT_ISOLATE_ALL=1 npm test` (every file alone, the old way), then add a rule or a line
    to `unit-isolated.txt`. Checked 2026-11-27: every pooled file in ONE process (reverse order),
    in 3 pools and in 4: all green, the same counts as isolated.
  - Measured 2026-11-27 (16 logical cores, BelowNormal, the owner using the PC, so noisy): at
    10-wide 113/110/139 s before, 80/94/93 s after (`known-reds.sh`, 8 pools), 96 s with the
    4 pools kept; at 4-wide 181 s before, 132 s after (4 pools). Counts identical: tests 7877,
    pass 7873, fail 0, skipped 4. Four pools rather than eight: about the same wall (the OCR pole), half the catalog loads.
  - THE FLOOR IS OCR, not the catalogs: `pasteRoute` alone takes 75 s (one test 30 s),
    `shotScreenshots` ~60, `shotFontReader` ~50, `questPopup` ~45, `rowPaste` ~25, `shotCapture` ~15 under load; the
    run ends when `pasteRoute` does. These six files are about 60% of all test time. Splitting
    them into smaller files is the next lever; the runner already starts them first.
- **Cargo tests only when an engine input changed** (2026-11-27): run
  `bash scripts/community/engine-changed.sh` in the work tree. `no` (the diff against
  `main_community`, plus uncommitted and untracked files, touches none of the paths in
  `scripts/community/engine-inputs.txt`) skips `cargo test` entirely. `yes` runs the cargo tests
  of the crates the change touches (a data file: the crates that embed it), in that tree's own
  `engine/target`. The list is `engine/`, the nine data files the binary `include_str!`s
  (`src/main/data/{spells,messageOverlay.baseline,classes,respawns,items}.json`,
  `src/renderer/src/data/eqlegends/{bosses,mobs,posky,quests}.json`), `protocol/` and
  `tests/fixtures/` (read by the cargo tests). `tests/engineStamp.test.mts` fails when an
  `include_str!` names a file the list misses. Do not guess from the file names: run the script.
- **Engine binary reuse** (2026-11-27, `scripts/engineStamp.mts`): `tests/e2e/build.mts`
  `buildEngineIfStale` keeps this tree's release `engined.exe` when its stamp proves it fresh, else
  COPIES the main clone's (found with `git rev-parse --git-common-dir`; `EQ_ENGINE_DONOR=<checkout>`
  names another) when that one's stamp proves the same inputs, else runs cargo. The proof:
  `engine/target/release/.e2e-engine-stamp` (JSON) lists every input of the build as a
  checkout-relative path (cargo's dep-info `engined.d`: the sources of engined and its path crates
  and every `include_str!`'d data file; plus the workspace and crate `Cargo.toml`s, `Cargo.lock`,
  `rust-toolchain.toml`; there is no `build.rs`), one sha256 over their bytes keyed by those
  paths, and the sha256 of the binary. Reuse needs a readable v2 stamp, a donor binary that hashes
  to it, the same digest over this tree's copies of the listed files, and a copy that still hashes
  to it. Anything else builds: no stamp, the old bare-digest stamp, a binary rebuilt without a new
  stamp, one changed or missing input, a copy that failed. Always a copy, never a link (the main
  clone may rebuild while the tree runs); the stamp is written last. `npm run build:engine` and the
  e2e build stamp what they build, and write no stamp when an input changed after cargo started.
  Not in the proof, because one PC shares them: `%USERPROFILE%\.cargo\config.toml`, `RUSTFLAGS`.
  The main clone is a donor only once `npm run build:engine` (or `start_companion.ps1`'s rebuild)
  has run there on this code; until then a worktree logs "no readable stamp" and builds. Measured
  2026-11-27 (`engine-boots` alone, 16 cores, BelowNormal, warm sccache): a fresh tree that copies
  37 s wall (the copy and checks 0.4 s; 28 MB of `engine/target`); a fresh tree that builds 75 s
  (cargo 41 s; 322 MB); a `.rs` comment edit in the copying tree rebuilt (cargo 37 s), and after
  the revert the next run copied again. The fresh check costs about 70 ms per spec.
- **Make all the changes, then gate once** (owner, 2026-10-21: "why run it on every change, make
  all the changes, run it once"). While fixing, run only the focused test files for what changed;
  the full gate runs once per work branch at the end, and the merged check once. Parallel agents share
  the machine, so repeated full runs slow every one of them. Helper agents run only their focused
  tests and hand back commits; the coordinating session runs the one full gate and the app check over
  everything at the end (owner, 2026-10-23: "test at the end so we don't waste time waiting for
  agents to test").
- **Said a third time** (owner, 2026-11-20: "don't waste time building and testing so often ...
  find a way to do that less often, perhaps at the end of a feature or multiple features"). What
  went wrong that day: three helper briefs each told the helper to run the full gate, and a trunk
  whose tree was identical to the gated branch tree was run through the full suite twice more.
  Apply it this way:
  - A helper's brief says: focused test files only, one typecheck and one lint at the end, no full
    `npm test`, no `cargo test --workspace`, no e2e. It names the tests it expects to be affected.
  - Branches that ship together are merged into ONE candidate branch; the full gate (and cargo,
    when `engine/` changed) runs once on that candidate; the candidate is merged into the trunk
    and the trunk's tree is compared with the gated tree (`git rev-parse <ref>^{tree}`). An
    identical tree is not gated again.
  - A passed check is not rerun unless code it covers changed.
- **A gate scoped to what the change touches, on the owner's word** (owner, 2026-11-20, for the
  feedback and analytics removal, with the game running: "lets skip a full test suite ...
  specialized testing for areas that these changes would actually affect ... sky quest
  calculations has nothing to do with removing analytics and feedback"). How it was done: typecheck,
  lint, and the unit test files that name a changed or deleted source file plus the ones that scan
  the source tree (`grep -lE "<changed basenames>" tests/*.test.mts`; `--test-concurrency=4` leaves
  cores for the game). Said for that change; RULES.md rule 11 still asks for the full suite
  otherwise, until the owner says the scoped gate is the standing rule.
- `npm run typecheck`, then restore tsbuildinfo; `rm -rf node_modules/.cache/eslint && npm run
  lint`; `npm test` (Node 24). On `main_community` use `bash scripts/community/known-reds.sh`
  (the unit suite where only names in `scripts/community/known-reds.txt` may fail).
  The gate script runs the tests ONLY: a change that fails `tsc` can pass it (2026-10-11, a
  class-rename fold typed as the rename's value). Typecheck and lint the work branch too,
  every time, before merging into `main_community`.
- **`npm test` under Node 22 fails 56 tests with `instanceof` errors** (a class loaded twice, "identical
  name but a different prototype", 6 cancelled) and prints TAP (`# pass`), while Node 24 passes them
  and prints spec (`ℹ pass`); known-reds.sh then stops "without naming a failing test". The trap
  (2026-11-10, an hour lost): a PATH entry in `C:/...` form, or the Program Files `npm` wrapper,
  which runs its own node.exe whatever `node` resolves to. Prepend `/c/Users/<user>/AppData/Roaming/nvm/v24.19.0`
  (the `/c/` form) and check `node -v` prints v24 before the gate; a `# pass` summary means Node 22 ran.
- **The npm gate does not run the Rust suite.** For an engine change (`engine-changed.sh` prints yes; history below, the scoped rule above wins), also run `cargo test --workspace` in
  `engine/` on the merged tree, in that tree's own `engine/target` (the shared build cache supplies
  the dependencies; a shared `CARGO_TARGET_DIR` is the trap under Environment). 2026-10-13 it found two reds the npm gate had passed for days: the module snapshot test
  (gaps-tab) and the pinned spell-category counts (catch_all x local-data-refresh).
- **A shared `engine/target` remembers another checkout's paths.** Protocol tests built by a session
  whose checkout was later removed fail with `<that scratchpad>/protocol/fixtures: cannot find the
  path`. `cargo clean -p protocol -p protocol-codegen`, then re-run (2026-10-13).
- Count node:test output with `grep -E "ℹ (tests|pass|fail)"`; failures are `^✖` lines. The pass
  count can wobble by one between runs with the same fail set (a skipping test).
- Do not run `npm test` while `npm run dist` rebuilds `out/`: symbolicate's round-trip test scans
  `out/renderer/assets` and goes red for that alone. The same test (`ROUND TRIP: every emitted
  bundle has a map beside it`) also fails with `ENOENT ... out\renderer\assets` when a dev launch
  has left `out/renderer` empty in the main clone (2026-11-12); a worktree has no `out/` and skips it.
- **Size ceilings, with headroom** (owner, 2026-10-17: "400 is NOT that huge for a class with
  comments"; a hard count was driving splits and comment cuts that bought nothing): 440 code lines
  per file, 110 per function, complexity 13, max-params 4, max-depth 3 (`eslint.config.mjs`
  FACTORING_RULES). Comments and blanks never count, so never trim prose to fit.
  Split only where the code has a real seam; do not invent files, classes or methods to dodge a
  count. `preload/index.ts`: a new bridge method needs its own slice file plus a listing in
  `tsconfig.web.json`, inserted mid-list.
- **Engine factoring register** (`engine/factoring-baseline.json`): each recorded value is a
  ceiling with 10% headroom; a recorded file or function may grow until it passes that, a new one
  must stay under the bars above. A shrink stays green and needs no `--write`; the register is
  never rewritten smaller as a chore.
- **`eqc/no-domain-munging` lint rule** forbids filter/sort over shared types inside the renderer;
  such logic lives in `src/shared/`.
- **Test imports:** tests import renderer code by relative path for values (`@shared` resolves for
  types only under tsx). A plain `C:/` path fails under ESM in an ad-hoc script; use `file:///`.
- **Known unit flake:** `presenceWorker.test.mts` "THE WATCHER LOOKS AT THE WORLD ON ITS FIRST TICK"
  can fail under the full suite's load (2026-10-13) and passes alone; re-run before treating it as red.
  It stays isolated under the pooled runner (it spawns), and was seen again 2026-11-27 with the game
  running (passed alone).
- **CPU starvation looks like a dead engine** (2026-10-28): with the machine at 100% (the full unit
  suite on every core, or another session's test runs), `engined` misses its 10 s port announce and its
  health probes, the app restarts it in a loop and shows "The data engine started but never answered";
  the presence watcher goes silent at the same moment. Check per-process CPU before blaming the engine.
  Never run the full suite while the owner is playing unless they say so.
- **Known engine flake:** `engined` `tests/combat.rs` live-meter tests (4 of 11) fail when `cargo test`
  runs alongside the unit suite (2026-10-28) and pass alone (`cargo test -p engined --test combat`);
  run cargo test on its own before treating them as red.
- **What belongs in e2e, and what in a unit test** (owner, 2026-11-27: "we shouldn't be
  regression testing functions that produce values"). An e2e spec proves WIRING: a screen mounts,
  engine or log data reaches it, IPC and preferences round-trip, state survives a remount and a
  relaunch, overlays, focus, pointer behaviour and geometry that need a real window. The VALUES a
  pure function computes (sorting, filtering, formatting, rates, counts, rankings, labels) are
  unit-tested over the function itself, in milliseconds, and never re-checked through the UI.
  - A new e2e check that reads a value asks first: does a unit test over the function already pin
    it? If not, write that unit test; the e2e check states only that the control reaches the list
    (e.g. "picking a class narrows the table", not "every row left is usable by that class").
  - Keep ONE "engine data reaches this surface" check per surface, even when its value checks go.
  - A check repeated in several states stays only in states that change a real-window property
    (window width, text size), not where only the content differs.
  - Removing an e2e check: an L (value) check goes only when a named unit test pins the same
    property (write it first if none does); a D (duplicate) check goes only while the check it
    duplicates stays; the commit message lists every removal by spec, with the test that now pins
    it or the check it duplicated. First pass 2026-11-27 (`e2e-trim`, 10 specs): BRANCH_NOTES.md,
    "Test hygiene: what e2e checks".
- **Running e2e (since 2026-11-27): the default runner, never `--serial`.** When e2e is called
  for (a release, the owner's word, a change to the harness), run `npm run test:e2e` as it is (Node
  24, `ELECTRON_RUN_AS_NODE` unset). It runs 3 specs at a time (`EQ_E2E_CONCURRENCY` overrides),
  longest first (times from the newest `tests/e2e/artifacts/*/summary.json`, this tree's and then
  the main clone's; never-timed specs first), at below-normal priority, so the owner can keep using
  the PC. After the parallel pass every failed spec runs ONCE more, alone. The summary then says:
  - `FLAKY UNDER LOAD`: failed in parallel, passed alone. The run exits 0, but the line names
    each spec and `summary.json` lists them under `flaky`. Report them; never hide one.
  - `RED`: failed both times. The run exits 1; compare with `main_community` (the spec alone on
    both trees) before calling it a regression.
  The retry's evidence goes to `artifacts/<run>/<spec>-retry/`, beside the first attempt's.
  `--serial` stays for debugging only (output straight through, no retry): a gate run serially
  costs about an hour for the same answer.
- **The hidden-window frame trap, fixed 2026-11-27 (`tests/e2e/appWindow.mts` FRAME_ARGS).** The e2e
  windows are `show:false`, and Chromium gave a window it never shows about ONE frame a second.
  Playwright's `mouse.move`, `hover` and `click` wait for the renderer's next frame, so each cost
  1 to 3 s and the suite was bound by its pointer actions (input call sites per spec tracked wall
  time at r=0.84, ~2.3 s each). The harness now launches with `--disable-frame-rate-limit`, a
  launch argument, so the product is unchanged (under EQ_E2E too). Measured in the hidden main
  window: rAF 3 frames in 2 s before, 116 after; 10 `mouse.move`s 10.0 s before, 25 ms after; a
  `hover` 3.0 s before, 12 ms after; a `click` 2.0 s before, 45 ms after; key presses and
  `evaluate` were always fast; idle CPU unchanged. Tried and NOT effective (each measured, no
  change): `backgroundThrottling: false`, `--disable-renderer-backgrounding`,
  `--disable-background-timer-throttling`, `--disable-backgrounding-occluded-windows`,
  `--disable-features=CalculateNativeWinOcclusion`, `--disable-gpu-vsync`; the page already
  reported `visibilityState` 'visible' with unclamped timers. Offscreen rendering was not needed.
  Still true with the fix: `page.screenshot` can time out on the hidden window (seen 2026-11-27 in a
  failure dump); use the capturePage method below. Old workarounds kept because they still work:
  `nextFrames`' 50 ms race (settle.mts), curveSteps' scroll-by-a-pixel before `capturePage`,
  the synchronous measure beside the ResizeObserver in `useMapViewport.ts`, the
  no-`setZoomFactor`-after-load note in `windows.ts`. TRAP the speed exposed: a step that read the
  screen right after an action had been passing only because the action took a second. Wait on
  the condition (settle on the new reading, or on the list having narrowed), never on the action.
  Fixed that day in `character-sheet` (accepted the previous search's count), `sky-targets`
  (clicked another quest's Ignore before the search narrowed the list), `overlay-sync` (read a
  rebuilt overlay once).
- **e2e times, measured 2026-11-27** (73 specs, the frame fix, 3 at a time, longest first,
  16 logical cores, BelowNormal, the owner using the PC): 581.6 s wall (9.7 min), against 59 min `--serial`
  and about 14 min 4-wide before. Longest: gear 122.6 s (285.9 serial before), combat-dashboard
  101.9 (264.6), planner 66.4 (129.9), sky-recent-sort 49.5, overlay-sync 45.5, character-switch-storm
  43.1, tradeskills-log 41.1 (238.1), bis-sheet 40.8, text-size 37.8, character-switch 37.8,
  spell-card 36.2, sky-filters 34.5, respawn-timers 29.5, sky-targets 29.5, voice-alerts 28.4;
  leveling 25.9 (209.5). Times under load run up to 4x a spec's time alone (planner 14.9 s alone).
  68/73 green first time; flaky under load: overlay-sync, sky-targets (both fixed after),
  engine-boots (counts other specs' engines, below); red: sky-recent-sort (red on `main_community`
  too), character-sheet (fixed after). No engine missed its port announce at 3-wide.
- **Known e2e reds/flakes:** `respawn-timers.e2e.mts` fails one step ("never claims the mob is
  standing there") on plain upstream main since 2026-08-17. `maps.e2e`, `engine-boots`,
  `engine-absent`, `sky-achievements`, `sky-reward-inference` can flake under parallel load; the
  runner retries them alone (above). `sky-recent-sort` is red on `main_community` (known before) and on the e2e-speed
  branch alike (2026-11-27: "a fresh install opens the Sky tab sorted by most recently looted —
  shown , stored null", a timeout), open. `maps` also failed about one run in three alone until 2026-11-23: the zone chip names
  the map asked for, so a step waiting only on the chip clicked the previous map's label as it
  vanished. After a zone change, wait on something the drawn map sets. `character-switch-storm`
  fails about 3 runs in 5 even alone ("ZERO module deltas reached the renderer ... 1 or 4 while
  folding"), measured 2026-11-23 at the same rate on the pushed trunk and on the new batch: a flake
  of the spec or a standing defect, not a regression; open. engined's `live_surfaces` "a melee round
  leaves the modules ... silent" fails inside the full parallel `cargo test --workspace` and passes
  alone (3 of 3, 2026-11-23). The `feedback` and `telemetry` specs, the runner's skip list and the first-run notice
  were removed 2026-11-20; the measurements below that name them are history.
  Measured 2026-10-18 (full run on main_community, then serial, then the same specs on test.26):
  58/68 green; the 10 reds were identical on test.26. By design on the TEST build: `feedback`,
  `telemetry` (no analytics compiled in), `spells-gate` (the old gate forced open; since 2026-10-29
  the spec is `spells-area`, a presence spec, and is not skipped). Fixed that night
  (stale specs): `default-sound-pack`, `sky-recent-sort`, `plan`. Since 2026-10-18 the
  TEST-build three are skipped by the TEST build's e2e runner with the reason, and `overview`,
  `whats-new` (TEST build) and `voice-alerts` pass. `maps` was red until 2026-10-27: a real
  layout shift (the travel card above the row arriving late), fixed in the app, not the spec. Baseline a red against the last release tag before calling it a regression.
  Measured 2026-10-21 (main_community 4f9062d8 vs test.29, 4 in parallel): 61/65 green on both, no
  new reds. `voice-alerts` is red again on both (the telemetry notice covers the "custom" menu item
  in `customPhraseSteps.mts` `rewordFromTheRow`; the spec never dismisses it, as alert-dialog-focus
  does). `alert-dialog-focus`, `engine-boots` and `engine-absent` flake in parallel and pass alone
  (no `wmic` on this machine: `engineTable()` falls back to `tasklist`, and engines from specs
  running alongside count as new). The engine embeds the data files, so a tree may run another
  tree's `engined.exe` only when every engine input is byte-identical: the harness copies the main
  clone's binary under exactly that proof and builds otherwise ("Engine binary reuse" above). When
  it builds, the crates.io dependencies come from the shared sccache cache (Environment).
  Measured 2026-11-19 (main_community after the issue sweep, 4 in parallel; the reds again one at a
  time; then the same specs on that morning's trunk in a detached worktree): 61/66 green and no new
  red. `engine-boots` flaked in parallel and passed alone; `voice-alerts` is red as before.
  `combat-dashboard`, `copy` and `default-sound-pack` were red on both trees, each diagnosed and
  fixed the same day: four checks had gone stale after deliberate app changes (MUI 7 icons carry no
  `data-testid` in a production build; a spoken alert needs no sound pack, stale since the Bazaar
  alert; a pet's swings before its claim move to its row since 2026-10-28) and one was a real bug
  (the Combat header's second row was cut off at 125% text size in a narrow window, since the scope
  buttons of 2026-11-17). On a LOCKED workstation the OS clipboard reads back empty even for the
  spec's own write: `copy` now says so in a note and skips its two round-trip checks, so a green
  `copy` on a locked machine proves less; rerun it unlocked. A baseline needs a worktree of its own
  at the older commit with its own `engine/target` (release profile only: 0.6 GB, a few minutes
  cold), so this clone's engine is not overwritten.
  Measured 2026-11-19, evening (the trunk with the whole-app hunt's fixes and Reading log R1, run in
  the candidate branch's own worktree before the merge, 4 in parallel; the reds again one at a
  time): 62/66 green and no new red. `alert-dialog-focus`, `engine-boots` and `engine-absent` failed
  in parallel and passed alone (the two engine specs counted other specs' engines;
  alert-dialog-focus measured 1 suggestion row at 1280 px in parallel and 200 alone, so its
  "heaviest row" check read the wrong row). `voice-alerts` red as before. `copy` skipped its
  clipboard round trip again (locked workstation). `voice-alerts` was then fixed the same evening,
  in the spec: `customPhraseSteps.mts` answers the first-run notice before it opens the say picker
  (green alone, 118 s). A red `voice-alerts` is a regression from here on.
- **Screenshots of the hidden app** (2026-11-27, 8 prototypes, about 20 launches, byte-identical
  repeats): `page.screenshot` is never used. In the e2e harness (`launchOnFixture`, `EQ_E2E=1`,
  every window `show:false`), take the pixels in main through `electronApp.evaluate`:
  `BrowserWindow.webContents.capturePage(rect, { stayHidden: true })`, bounded by a timeout. Three
  rules make it reliable: (1) `invalidate()`, capture and throw away, wait, `invalidate()`, capture
  and keep, because the first capture can return the frame from before the last DOM change; (2)
  inject a style that turns CSS transitions and animations off, or MUI tab underlines and Grow
  poppers are caught part-way; (3) no named helper functions inside `evaluate` bodies (tsx's
  keepNames adds `__name()`, which throws there). A tree that changes only renderer code needs no
  engine build: the harness copies the main clone's binary when the inputs match ("Engine binary
  reuse"), and `EQ_ENGINE_BIN` (read under `EQ_E2E=1`) points a probe at another tree's `engined.exe`.
  Side-by-side images: headless Chromium from `playwright-core` with `executablePath` set to the
  newest `%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-*` (the build playwright-core expects
  may not be installed).
- **Headless look at a tab:** every tab is in every build (the `UNRELEASED` gate was removed
  2026-10-29), so `electron-vite build --outDir=<worktree>/out-e2e` and a throwaway spec with
  `launchOnFixture(...)` reach any of them; no flag or env var is needed.
  `--mode development` does not flip `import.meta.env.DEV`. `page.screenshot` can hang on the
  hidden E2E window; `page.context().newCDPSession(page)` + `Page.captureScreenshot` worked once
  but hung on every try on 2026-10-26: read text instead, or bound the call with a timeout.

## Pushing

- Push to `origin` only. Finished, gated work is pushed once it is merged into `main_community`
  and the owner has tested it in the app; then push `main_community` without asking. Before the
  owner has tested, do not push. Work branches are deleted after the merge, not pushed.
- Retired branches are never pushed again; the pull requests opened from them on the original
  repo are left as they are (RULES.md rule 9).

## Owner rulings that shape work

- **Real bugs get fixed, not listed** (owner, 2026-11-21: "if there are real bugs found fix them, why
  do you need to list them?"). Settle each audit item yourself. Bring back only what changes a number's
  meaning, removes something asked for, or is a real product choice. Correctness still wins.

- **No unreleased tabs** (owner, 2026-10-28: "no reason to hide them ever just always show the
  tabs"; 2026-10-29: "everyone should always see all tabs"). The `UNRELEASED` gate is removed
  outright (no flag, no `EQ_UNRELEASED`); a new surface ships visible.

- **No feedback or usage analytics** (owner, 2026-11-20: "Remove all code associated with feedback
  and usage analytics"). Players report through this repo's GitHub issues (`shared/issueLink.ts`).
  A new view or overlay has no reporting list to join. `src/main/telemetry/` (`durableWrite`, the
  error budget's fingerprint) and `src/main/feedback/slice.ts` keep their old paths and are local
  helpers. The `telemetry` key stays in the store shape so old settings files load.

- **The fork has taken over the project** (owner, 2026-09-28). A decision that used to wait on the
  creator (a new tab, a new data file, a departure from AGENTS.md design) is the owner's alone; do
  not park work on the creator's sign-off. The fork's own rules still bind. The code conventions
  (lint ceilings, tests, house style) are still followed because they are the house style, and
  the lint ceilings and tests enforce them. `AGENTS.md` and `releaseNotes.ts` are left as
  written (RULES.md rules 13 and 14); taking `AGENTS.md` over is the owner's decision, still open.
- **One trunk, to move faster** (owner, 2026-10-26: the creator "may never come back, there are
  already multiple competing tools ... we need to be able to move faster and pivot easier").
  Upstream pull requests are no longer a goal, so a change is shaped for the fork, not for
  separability; RULES.md rules 1 to 4 and 9.
- **The fork does not track the original** (owner, 2026-11-19: "we broke away from the original
  fork but our readme still acts like we are trying to stay in-sync with it"). Docs, rules and
  app text speak as the project itself. Nothing is synced from or offered to the original repo
  unless the owner asks; `main` and the `upstream` remote stay as a frozen reference (RULES.md
  rules 2, 4, 9, 20).
- **The owner's comments on this repo's issues are directions** (owner, 2026-11-19). Read every
  comment by the owner on an issue before triaging it: what is said there is what to build.
- **Wiki and network:** no new runtime fetches. Data comes from committed files and bundled
  assets. Any new scrape is an owner decision, in bulk, at 1 request per second.
  The app reads the wiki only on a Copy click (owner, 2026-10-26: "the app should not be hitting
  the WIKI ever except (delta refresh before build, user clicks COPY on an item and it does the
  lookup)"): `lookupItem`/`lookupMob` are local-only, `lookupItemOnCopy`/`lookupMobOnCopy` and the
  quest Copy are the only doors, `tests/wikiTraffic.test.mts` pins it (wiki-usage/README.md lists
  the touch points).
  Development, testing and validation send the wiki zero requests (owner, 2026-10-10): work from
  fixtures and the committed caches, and a scraper's `--dry-run` that reads the wiki counts as
  a request. Scraper changes keep real runs light: revid checks so only changed pages are
  fetched, 50 pages per request, no retries on permanent errors.
  TRAP (2026-10-10, ~46 requests sent): `git checkout <branch> -- <file>` into a scratch tree takes
  the branch's COMMITTED file, not a worktree's uncommitted edit; a scraper copied that way had no
  `--offline` flag and ran its revision check. Copy from the worktree path, and before running any
  scraper check the flag is in the file you are about to run (`grep -c offline`).
  A wiki read by hand, for any reason, goes through `npx tsx scripts/wiki-call.mts --reason "<why>"
  action=...`, never curl or WebFetch: it is
  counted in `docs/community/wiki-usage/ledger.jsonl` and names the fork (owner, 2026-10-23: "he
  doesn't care for what reason we hit the EQLWiki, so i want to track it all"). Commit its line.
- **Screen text is short** (owner, 2026-10-21: "Do we really need them to checkout a book from the
  library to understand the drop down? ... a single 7-15 word sentence"; "we just hit them with so
  much text to read"). A tooltip is one sentence of 7-15 words; a caption or status line says the one
  thing the player acts on, in a few words, with detail behind a tooltip or an info icon. A tooltip
  never covers the control it explains (a picker's tooltip hides while its menu is open).
- **Wiki edits: what the player meets, never cleanup for its own sake** (owner, 2026-10-21: "we are
  not wiki admins, lets focus on things we notice while playing, and not as much on 100% cleanup,
  but we should always leave a wiki page better than we found it, as long as we aren't editing it
  for formatting sake alone"). The app suggests an edit only for what the player's log shows a page
  lacks; a formatting change (group lines, layout) rides along with a real change, never alone; no
  wiki-wide cleanup lists or bot requests.
- **A wiki-data complaint is reported, not fixed** (owner, 2026-11-19: "If users are complaining
  about issues that are just data issues from missing or incorrect WIKI, there is nothing I can do
  about it, report those to me instead of attempting to fix them"). When a report's cause is a
  wrong or missing wiki page, give the owner the page, the field, what it says and what it should
  say. No code change and no data override for it, unless the owner asks for one on that issue.
- **A player is never left guessing what is wrong** (owner, 2026-11-19, on fork #9: "The main point
  is we don't want to have our users confused what is wrong."). A screen that is stuck, empty or
  stale says why in plain words and, where the app can know it, what to try. A silent wait and a
  wrong reason are both defects. Recovering by itself is welcome, and comes second to saying so.
- **Where the log and the wiki disagree, the app trusts the log** (owner, 2026-11-25: "we should
  trust log data over wiki data since the wiki depends on manual free contributions from community,
  and daybreak who makes eql is constantly updating/changing/enhancing EQL"). A rank, name, value or
  count the log states wins over the wiki's: never cap, rename or hide what the log shows to fit a
  wiki page (the AA tab: Rampage at rank 2 where the wiki lists 1; the log's `Unbound Strikethrough`
  shown under its own name, matched to the wiki's `Unbounded Strikethrough`). The difference is
  still reported to the owner as a wiki fix (the ruling below on wiki-data complaints).
- **Scraping is wiki-only; the log is the truth** (owner, 2026-10-10). The game's own files may
  be parsed once, at dev time, to find wiki errors; nothing shipped or scraped depends on them.
  DATA_REFRESH.md, "The ETL".
- **Scraper code and the data it produces** (owner, 2026-10-10): a parser fix and the re-derived
  data it produces may share a work branch, but are separate commits, so the data commit can cite
  its `data-diff`. The test pins a data change moves go in the same work branch.
  `dataWeight.generated.json` is measured after the data lands and committed with it. (Until
  2026-10-26 the code lived on `wiki-scraper-fixes` and the data on `local-data-refresh`.)
- **Diffs:** surgical. Smallest mergeable change; never reformat, rename or restructure beyond
  the feature. New code gets lean comments: a one-line note for a real constraint, not an essay,
  even where legacy files carry long headers.
- **Never write to the creator's spaces** (his Linear board, his data pipelines, his
  telemetry/Lambda deploys). The fork's work is tracked in this repo and its GitHub issues;
  nothing is passed on to his systems unless the owner asks.
- **Feature alerts use the alert framework:** add an `AppSignal`, declare its tokens in
  `APP_SIGNAL_CAPTURES` (`src/shared/alertCaptures.ts`), seed an AlertDef (own module with a
  one-time stamp, e.g. `src/main/alertBazaarSeed.ts`, because `store.ts` is at its ceiling), fire
  with `fireAppSignal(signal, context, captures)`. Never call `showAlertBanner` or `speak` from a
  feature. The feature's own controls decide only what counts as a match.
- **Wiki tokens are case-insensitive.** `LEGS` = `legs` = `Legs`. When a census test fails on a
  case or trailing-punctuation variant, fold it in the test the way `cleanToken`
  (`src/shared/planner/normalize.ts`) folds. Never report a case variant as a wiki error. A
  genuinely different spelling (`SHA` for `SHM`) is a wiki typo.
- **Summoned pets are not auto-bound** (owner, 2026-10-09). A pet counts only after a Master tell,
  `/pet leader`, or a pet-buff landing. Do not re-propose a guessing rule, even a measured one.
- **Code signing is shelved** (owner, 2026-10-07): builds ship unsigned; paid signing is not
  wanted for a free project. Suggesting it again later is fine. The build still supports it
  (`scripts/azure-sign.cjs`, `AZURE_*` secrets, `win.signtoolOptions.publisherName`).
- **Ledgers and commit messages are public.** Record rulings as decision + reason in neutral
  words; never paste casual chat; findings describe code, not authors (RULES.md rule 5).
- **Ask concrete questions with a default**, not overviews of phase numbers.
- **A remark is not an answer.** A reply to a question that comments on it ("that's silly") rather
  than picking an option is not approval; ask what they want instead of acting (owner, 2026-10-17).

## Release notes (the `Test build 0.1.0-test.N:` commit body)

- Only what changed since the previous version, then known issues. The cumulative "what this
  build adds" list lives once, on the test.20 release; `publish-release.sh` links to it and refuses
  a later version that repeats the `WHAT THIS BUILD ADDS` heading.
- State a fix's real scope. Name visible fixes plainly with where they apply ("a few zones:
  Crushbone, Mistmoore, Cabilis listed no mobs"). Fold load-order races and rare edge cases into
  one line ("steadier when things load slowly or happen at once"). Never phrase an edge-case fix
  as if the feature was broken for everyone ("shows icons again").
- Put a blank line after the commit subject, or the body merges into the title.
- Older notes: every `Test build` commit from test.13 on is in `main_community`'s history
  (`git log --grep="^Test build" main_community`; test.13 to test.34 were made on the retired
  `test-neutering`); test.1 to test.12 are under tag `archive/local_all_changes_testing-2026-09-15`.

## Packaged builds

- `npm run dist` only in the main clone (RULES.md rule 16). The running dev app does not block it.
- Verify the asar before handing a build out: every `dependencies` package must be present
  (`publish-release.sh` checks this). Run `npx @electron/asar` from a scratch directory:
  `extract-file <asar> package.json` writes into the cwd and once overwrote the repo's
  `package.json`.
- No finished work branch may be left unmerged before a build (a posky rescrape was once left
  out); the check is step 1.2 of the `community-release` skill.
- The window hides to the tray on close; applying a downloaded update needs tray Quit.
- **An installer change can be rehearsed with no VM** (2026-11-23, the CE rename). Build two stub
  Electron apps from the repo's `build/installer.nsh` with every name swapped (appId, product, exe,
  package, shortcut, settings folder, the literal `RMDir` path, publish off), install old, run new
  with `--updated /S`, with `--updated /S --force-run` and bare, uninstall, remove what is left.
  Refuse to run if a real name survives in a live line of the patched script: that `RMDir` deletes
  real settings, and the exe name is what the stock installer's `taskkill` matches. Fingerprint the
  real install, settings and shortcuts before and after. It proves the installer's mechanics, not the
  real payload or the network update.
- Launching the packaged app with the repo as cwd makes it use `engine/target/release` (the
  creator's candidate order): a launch artifact, not a player issue.

## Agent tooling traps (Claude Code on Windows)

- **Never commit in a worktree of a retired branch.** `git branch --show-current` before the first
  commit in any worktree; a retired branch carries `RETIRED.md` at its root.

- Bash heredocs and inline commands lose backslashes (`\b` became a backspace byte, `\s` became
  `s`). Write regex-bearing code with the Write/Edit tools or a script file.
- An Edit-tool `replace_all` whose new string ends in a space dropped that space once; use sed for
  trailing-space replacements.
- Worktree files are CRLF on disk (`core.autocrlf=true`); exact-string patchers must normalize.
  Python rewrites CRLF to LF unless the file is opened with `newline=''`; a bare `python` may hang
  on the Windows Store stub.
- The auto-mode permission classifier has refused: `Stop-Process` on electron/engined (even
  agent-launched), `tasklist`, `publish-release.sh --publish` run directly, batched merge loops,
  and hand edits to `engine/factoring-baseline.json`. Plan around them; ask the owner.
- Several agent sessions may run on this clone at once. Before a task-specific message to another
  session, confirm which session holds which task.
- Backticks inside a double-quoted bash string are command substitution: a doc line built that way
  lost every `code` name silently (2026-10-18). Write prose with backticks through Write/Edit.
- Scratch worktrees under `%TEMP%` can vanish mid-job (2026-10-18: a scratch tree's node_modules
  junction, then a whole scratch tree, while the drive was nearly full; most likely Windows temp
  cleanup). Check the junction exists before a gate (a missing one fails as `tsc` not recognized),
  and keep long jobs under `.claude/worktrees/`. A junction to `engine/target` is unlinked before
  removal exactly like `node_modules` (RULES.md rule 18).
- A test pinned to a data count goes red at the next data refresh. Use a floor
  (`tests/corpusFloor.mts`), a property, or a fixture under `tests/fixtures/` (BRANCH_NOTES.md,
  Test hygiene).

- Before deleting a merged branch, check that no running job names it later: a review stage that
  diffs `base...work` resolves the base when it starts, not when the job was launched (2026-11-19:
  `log-read-r1` was deleted after its merge while phase R2's reviewers were still to run against it;
  the ref was put back at the same commit).
- A helper must never `git stash`: the stash list belongs to the clone, not the worktree, so a
  helper's entry sits on the owner's stack (2026-11-19: one sat there two minutes while a test run
  hung). Say so in every brief; to see a test fail against the old code, copy the changed file to a
  scratch folder and restore it. `git merge-tree --write-tree a b` is the safe trial merge: it
  writes only unreferenced objects.
- Never use `cmd start` for a low-priority job, from either shell (2026-11-22: Git Bash garbled
  `cmd //c 'start "" /belownormal ...'` and Windows put a "cannot find '\\'" dialog on the owner's
  screen mid-game). Use PowerShell: `$p = Start-Process <exe> -ArgumentList ... -WindowStyle Hidden
  -PassThru; $p.PriorityClass = 'BelowNormal'`. Say so in every brief that asks for low priority.
  Already low by themselves (2026-11-27): the e2e runner (`run-all.mts` lowers itself, so the
  builds, specs and their Electron inherit it), `known-reds.sh` (`nice -n 10 npm test`; Git Bash's
  `nice` gives the Windows BelowNormal class), and the cargo builds of `npm run build:engine` and
  the e2e harness. A hand-run `cargo test` is not: start it the PowerShell way above.

- **A scratch Playwright probe of the e2e app** (`tests/e2e/appWindow.mts` `mainWindow`,
  `logFixture.mts` `stageFixture` + `appendAt` + `launchOnFixture`) is the way to watch a tab
  without a window on the owner's screen. The window is hidden: `requestAnimationFrame` never
  fires (an `evaluate` awaiting it hangs forever), `page.screenshot` times out, and scroll events
  land late (wait ~1.5 s, not 300 ms, before reading a re-windowed list). Every tab (Gaps,
  Factions included) is in every build. TRAP (2026-10-26, gone the same day): on a real log the app ran its own eqlwiki mob-lookup
  searches (7 in one probe). Since the owner's ruling below, the app reads the wiki only on a Copy
  click; still launch a probe with `NODE_USE_ENV_PROXY=1` and `HTTPS_PROXY=http://127.0.0.1:9`, so
  a Copy clicked in a probe sends the wiki nothing either.

- **`start_companion.ps1 -NoWatch` still hot-reloads the renderer.** It runs `npm start`, which is
  `electron-vite dev`: only main stops relaunching. A merge or checkout in the main clone while the
  owner uses that window swaps the screens under them (2026-10-20). Do the work in worktrees and
  merge into `main_community` only when the owner is not using the dev app, or after telling them.

## Bug hunts that worked

- Read-only hunter agents by area, one independent validator per report (validators refuted
  several claims), then one implementer per worktree, never two in one worktree.
- Measure on the real log before believing a tester's cause; replay with parity
  (MEASURED.md, Analysis methods).
- An issue sweep that worked (2026-11-19, `plans/2026-11-19-issue-sweep.md`): read every comment
  the owner left on the issues first; a quick first pass by three different models over all the
  issues; then one evaluator per feature area that checks those claims against the code, measures
  on the owner's log, and writes the plan (the evaluators corrected first-pass claims on every
  issue). Request rows and the phase doc before any code. One worktree per fix with a
  `node_modules` junction; TypeScript fixes in parallel, engine fixes one after the other on this
  clone's `engine/target`; helpers run focused tests only and leave the ledgers alone (ISSUES.md,
  BRANCH_NOTES.md and MEASURED.md are written once, by the coordinator, from what they return, so
  eight branches merge with no conflict). An independent reviewer on another model per diff found
  one real defect in three of eight. One gate over the merged work.
- A whole-app hunt that worked (2026-11-19, `audits/2026-11-19-bug-hunt.md`): 18 feature areas, one
  or two read-only finders per area spread over four models, each handed the area's `requirements/`
  file and its BRANCH_NOTES section and told to skip decided limits; one skeptic on another model
  per finding (12 of 93 refuted, 5 already known). Fixes: one worktree per area, a unit test that
  failed before each fix, a reviewer on another model per branch (4 of 17 branches needed a
  correction). TypeScript areas ran side by side; engine areas ran in two lanes, each lane with its
  own `CARGO_TARGET_DIR` and its areas one after another. Every fixer returned a `requirements_row`
  and `notes_for_branch_notes`; the coordinator wrote them into the ledgers once, so 17 branches
  merged with no conflict in a document.
- The correction pass after a review is the one stage nobody else reads: read those commits yourself
  before the merge (2026-11-19: both were sound; one added a new JSON import edge in main, which is
  a bundle-order risk only an e2e run settles).
- Lint the merged tree, not only each branch. Two branches each under a ceiling can be over it
  together: `captureSegment` passed on both branches and was complexity 14 of 13 once merged
  (2026-11-19). `git diff --name-only trunk...branch` per branch, then the files named twice, is the
  list to read by hand.
- Several finished branches waiting on the same expensive checks (cargo, the e2e suite): merge them
  into one candidate branch, gate and e2e that once, merge it into the trunk, and confirm the
  trunk's tree is the gated tree (`git rev-parse <ref>^{tree}`).
- A branch that changes the connection to the engine, main's import order, or a dialog an e2e spec
  drives gets the e2e suite BEFORE the merge, in its own worktree: the run builds that tree's
  `engined.exe` (release; measured 2026-11-19: 37 s and 0.36 GB under its `engine/target`, with
  the cargo registry warm) and its `out-e2e`.
