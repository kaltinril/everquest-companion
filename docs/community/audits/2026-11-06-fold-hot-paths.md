# Engine fold hot paths, 2026-11-06

An efficiency review of everything that reads, parses, folds, looks up or caches large data, asked
for as "find the top 10 areas, fix the top 3, re-run the benchmarks". Read it with
[2026-10-20-performance-review.md](2026-10-20-performance-review.md), which ranks the app-side
costs (tab switches, snapshot sizes, polling); this one is the engine's whole-log fold, the cost
the owner pays at every launch and on every live line.

## Method

- Corpus: a copy of the owner's 2026-10-17 log (68.5 MB, 824,517 lines, 824,509 events) and the
  live log of 2026-11-05 (18 MB, 220,137 events), renamed `eqlog_Drywrought_oggok.<slice>.txt`
  so `parity` can read the character off the name.
- Instrument: `engine/target/release/parity.exe <log> --stages`, which times the split, the parse,
  the serialize and the full fold, then re-folds with a stopwatch around every module (its
  "attribution pass"). For the ranking below, temporary stopwatches were added inside the combat
  engine, the buffs module and the parser (never committed; the per-module attribution is enough
  to re-measure).
- Functional check, before and after: `parity <log>` (the NDJSON event stream, byte identity) and
  `parity <log> --snapshots` (every module's snapshot, deep equality) over both logs. The one
  field that may differ is `meta.ms`, the fold's own wall-clock time.
- Machine: the owner's dev box, release build, nothing else running (the numbers under "contended"
  were taken while `cargo test --workspace` and the npm gate ran alongside; they are only there to
  show the noise).

## The top 10, ranked by measured cost on the 68 MB log

The full fold took 14.5 s: parse 2.7 s, modules + combat 11.5 s (combat 4.8, buffs 3.8, resist 0.6,
respawn 0.4, the other 24 modules under 0.1 each).

| # | Area | Cost | What it was doing | Status |
| --- | --- | --- | --- | --- |
| 1 | `buffs` hygiene sweep (`buffs_instances.rs sweep_hygiene`) | 3,080 ms | On every event: copied every active buff's key into a `Vec<String>`, then re-evaluated every row's long-stop and unwitnessed-cull caps, then re-walked the open records for orphans. The answer was "nothing due" on nearly every line. | **Fixed** (memo, below) |
| 2 | Combat engine roster pull (`combat/state.rs refresh_roster`) | 1,612 ms | On every event: rebuilt `RosterFacts` from the roster module — two `Vec<String>`, two `HashSet`s and a `HashMap` of clones — though the roster moves on group lines only. | **Fixed** (revision, below) |
| 3 | Parser line regex + timestamp (`parse/mod.rs`, `timestamp.rs`) | 841 + 430 ms | Every line: the `^\[(.+?)\]\s?(.*)$` captures through the regex crate's backtracker, then the stamp regex plus a chrono zone lookup, although consecutive lines share a stamp. | **Fixed** (hand-rolled split, stamp memo, below) |
| 4 | Parser classify cascade (`parse/mod.rs classify`) | 2,540 ms | The ordered line-shape cascade: up to ~40 classifiers, each with a cheap prefilter and then a `Regex::captures`. The damage/miss regexes take most of it; captures with lazy `.+?` groups are the regex crate's slow path. | Open. Hand parsers for the two melee shapes would give ~1 s; parity risk is high, so it needs the golden corpus run against it. |
| 5 | Combat damage route (`combat/routing.rs route`) | 1,335 ms | Per damage line: two `world.resolve` calls returning three owned `String`s each, `out_source` building a `SourceRef`, `push_timeline` cloning lane, category and modifiers, and a `format!` for the processing ring that is built even while `recording` is false (the whole historical fold). | Open. Borrowed `Resolved`, a lazy ring line (closure or `format_args!` behind the gate). ~0.5 s. |
| 6 | Combat miss path (`combat/routing.rs route_miss`, `MissLine`) | 803 ms | Per miss line: `MissLine` owns attacker, target, verb, verb_skill and a `Vec<String>` of modifiers, so five allocations before any decision; the same ring `format!`. | Open. Borrow the line like `DamageEvent` does. ~0.4 s. |
| 7 | `resist` module (`modules/resist`) | 640 ms | `flush_deferred` and the outcome cascade on every event; `on_damage` builds owned strings per line; `is_immunity_sentence` scans every unknown line's text. | Open. Gate `on_damage` on the parser's `dtype` before allocating. |
| 8 | `respawn` module (`modules/respawn.rs`, `respawn_seen.rs`) | 397 ms | `seen_names_of` allocates a `Vec<Option<&str>>` per event and the module matches `ev.kind()` as a string (`"death"`, `"zone"`) rather than the `Kind` discriminant every other hot module uses. | Open, small: match on `kind_of()`, return a fixed-size array. |
| 9 | `buffs` swing arm (`buffs.rs on_swing`, `buffs_stash.rs`) | 398 ms | Every damage event goes through `stash.note_swing`, which answers an empty `Vec` almost always. | Open, small: an early `is_empty` test on the stash before the call. |
| 10 | The NDJSON line per event (`event.rs Ev`) | 248 ms | The parser writes the JSON string for every event although the fold reads only the typed payload; the string is the parser oracle's artifact and `engined` hands it to the sink. | Open: write it lazily (only when a sink asks). 1.7% of the fold; kept for byte-identity tooling. |

Not in the table, measured and found small: the line split itself (47 ms for 68 MB with the
hand-rolled byte `memchr`), the dispatch floor (21 kind checks per event, 84 ms), the overlay
miner (146 ms, one `to_string` per unknown line), the combat sweeps (36 ms). The app-side caches
(`knowledgeCache.ts`, `imageCache.ts`, the renderer's `kept.ts` sites) were read and not
re-measured: the 10-20 review covers them and nothing there runs per log line.

## What was fixed

Each fix is exact: the event stream is byte-identical and every module snapshot deep-equal on both
logs, pinned by the parity runs above and by unit tests.

1. **The hygiene sweep keeps a memo** (`buffs_instances.rs`, `buffs_instance_rules.rs`,
   `buffs_stats.rs`, new `versioned.rs`). A sweep that retires nothing is a pure function of `now`
   over the active map, the open map, the spell stats and the log-hole hold, and every row's test
   is "`now` past `started_ts + cap`", monotone in `now`. So a quiet sweep records the earliest
   instant any row or orphaned record could come due, and the next event skips the walk while
   nothing it read has moved and `now` is at or before that instant. "Moved" is counted, never
   guessed: the two maps are `Versioned<JsMap>` (every `&mut` borrow bumps a counter) and
   `SpellStats` bumps its own on every writing method. The walk itself is now two passes, read-only
   plan then retirements in map order, so a full sweep allocates only for the rows it retires.
   buffs 3,780 to 616 ms.
2. **The combat engine pulls the roster once per change** (`combat/roster.rs`, `combat/state.rs`,
   `modules/roster.rs`). `RosterSource::revision()` (default `None` = pull every line, which the
   tests' fakes keep) is answered by the roster module with a counter it bumps on every write to
   its membership (`add`, `fold_group`, `refuse_pet` eviction, `reset`, epoch, `define`).
   `refresh_roster` re-pulls only when the counter moved. combat 4,818 to 3,002 ms.
3. **The parser splits the line by hand and memoizes the stamp** (`parse/mod.rs`). `split_line`
   reproduces `^\[(.+?)\]\s?(.*)$` with JavaScript's `.` and `\s` exactly, backtracking included
   (the lazy group grows past a `]` when the rest of the line cannot match from there, and `\s?`
   may swallow a CR), pinned by a test that runs it beside the regex over the corner cases. The
   stamp's text is memoized to its instant, so the stamp regex and the zone lookup run once per
   second of play. parse 2,722 to 1,799 ms.

Along the way the sweep function was split in two (`sweep_is_quiet`, `hygiene_plan`) to stay under
the factoring register's complexity bar, and `reap_orphaned_open` now reports what it changed and
when its orphans next come due.

## Before and after

Quiet machine, release build, the 68 MB log; the 18 MB log in the `meta.ms` row. Three runs each,
back to back, trunk binary against this branch's; the first run's full breakdown, the others as
ranges.

| Measure | Before (trunk `22d97a86b`) | After |
| --- | --- | --- |
| Full fold (parse + 20 modules + combat) | 14,485 ms, 4.7 MB/s (runs 2-3: 13,380 / 13,631) | 7,753 ms, 8.8 MB/s (runs 2-3: 7,656 / 7,618) |
| Parse alone | 2,722 ms (2,762 / 2,716) | 1,799 ms (1,784 / 1,745) |
| Serialize (the NDJSON string) | 248 ms | 81 ms (same work; less cache pressure) |
| Modules + combat | 11,515 ms | 5,873 ms |
| Attribution: combat | 4,818 ms (4,497 / 4,549) | 3,002 ms (2,877 / 2,864) |
| Attribution: buffs | 3,780 ms (3,448 / 3,583) | 616 ms (596 / 594) |
| Attribution: resist / respawn | 640 / 397 ms | 596 / 377 ms (untouched) |
| `meta.ms` of the `--snapshots` run, 68 MB | 14,148 ms | 7,603 ms |
| `meta.ms` of the `--snapshots` run, 18 MB | 3,735 ms | 1,961 ms |
| Event stream, both logs | sha256 `746fac16…` / `08fc25b2…` | identical |
| Module snapshots, both logs | 26 modules + combat + scopes | deep-equal; only `meta.ms` differs |

What this means in the app: the launch fold of the owner's 106 MB October log was 24-37 s
(10-20 review); the same work is now about half, and every live line pays the same three savings
(a roster rebuild, a buff walk and two regexes fewer per line). The budget floor in
`engined/tests/budget.rs` (1 MB/s) is untouched.

## Re-measuring

```
cd engine && cargo build --release -p parity
engine/target/release/parity.exe <copy of a log named eqlog_<Name>_<server>.<slice>.txt> --stages
```

The per-module attribution is the part to watch; the stage lines above it are the parse. For a
functional check, `parity <log>` and `parity <log> --snapshots` to files before and after, and
diff them (the snapshots with a deep compare that ignores `meta.ms`). Contended numbers are 1.3-1.5x
higher across the board, so measure with nothing else building.
