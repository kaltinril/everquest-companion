# Whole-app efficiency review, 2026-11-06

The owner asked for every part of the code to be read for inefficiencies ("review all the code,
EVERYWHERE"). Six read-only reviewers each took one area and ranked what they found by expected
gain, with file and line, how often the code runs, the estimated cost, the fix and the risk. This
page is the merged ranking and the per-area lists. Costs marked *measured* come from
[2026-11-06-fold-hot-paths.md](2026-11-06-fold-hot-paths.md) and
[2026-10-20-performance-review.md](2026-10-20-performance-review.md); everything else is an
estimate from reading the code and says so. Nothing here was fixed by the review itself; the
"Status" column tracks what has landed since.

Areas: engine fold modules (`engine/crates/fold/src/modules`), combat engine and the serving side
(`fold/src/combat`, `engined`), parser and knowledge (`eqlog`, `knowledge`), Electron main
(`src/main`), renderer (`src/renderer`), shared derivations (`src/shared`).

## The merged top 20

Ranked by what the owner feels first (tab latency, freezes, live CPU), then by fold time.

| # | Area | Finding | Runs | Est. cost | Fix | Risk | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | main | `electron-store` keeps no in-memory copy: every `store.get` is a `readFileSync` + `JSON.parse` of the 95 KB store, every `set` a parse + tab-indented stringify + fsync write. Module reads (`serveShim.ts:257` → `history.ts:194` → `logArchiveOn()`), presence events (`presenceEffects.ts:278` → ~15 `getOverlayConfig` reads), alert fires (`alertsAudio.ts:32`), con cards and toasts all read it. | per module read, per foreground change, per alert | 0.3-0.8 ms per get, 3-15 ms per set; 5-15 ms of main-thread block per presence event (assumed) | One in-memory snapshot of the store in `store.ts`, invalidated by its own writers; batch the five attach-time `setProgress` writes into one | low | open |
| 2 | main | First con card or resist lookup parses 32 MB of JSON on the main thread: `spellTable.ts:104` (`spell-resist-cache.json`, 18 MB) then `ledgerFile.ts:168` (`resist-ledger.json`, 14 MB), triggered mid-fight by `conCard.ts:273`. The worker path exists but only on a cache miss. | once per session, at the first con | 150-400 ms freeze, ~100-150 MB heap (assumed) | Parse both on the worker (or `readFile` + worker), pre-warm ~10 s after replay | low | open |
| 3 | renderer | Maps mounts up to 600 unwindowed MUI rows, each with 2-3 Tooltip + IconButton (`MapMobPane.tsx:460-485`, `MapMobPaneRow.tsx:149-172`), plus `acts={props}` as a new object per render. | per Maps mount and pane change | ~2k MUI components; likely most of the owner's Maps switch (assumed) | `useWindowedRows` per section, action buttons only on the hovered row, `memo(Row)` | low | open |
| 4 | renderer | Loot runs ~12 full passes over the 11k-row ledger per mount (`LootView.tsx:354` pulls all of `useProgress`, `useLootRows.ts:58-86`), and re-derives everything every second lines arrive because `useTimeslice.ts:260` hands back a fresh slice object per `progression` push. | per mount, per active second | 79-129 ms *measured*, 20-40 ms per push (assumed) | `kept()` slots keyed on the ledger identity; a stable slice object; split `useInventoryRows` out of `useProgress` | low | open |
| 5 | renderer | Buffs: the Durations table renders every tracked spell with 2-4 Tooltips + an IconButton, unwindowed (`BuffStats.tsx:112-160`), and a 1 Hz `setInterval` re-renders the whole view (`BuffsView.tsx:185`). | per mount; every second | 300-1,200 MUI nodes per mount; 5-15 ms/s idle (assumed) | window the table, native `title` on dense cells, clock only in the active group | low | open |
| 6 | main | `resolveEqDir()` rediscovers the install per call (store read + two `readdirSync` of Logs; `log/config.ts:231`), and `imageCache.ts:765` calls it for every `eqimg://spell/<id>` request, `outputs/discovery.ts:35` for every output lookup, `switchNudge.ts:79` every 15 s. | per spell icon, per IPC, per 15 s | 1-5 ms per call (assumed) | memoize `ResolvedEqDir`, invalidated by the existing `invalidateEqDiscovery` | low | open |
| 7 | serving | `combat.live` rebuilds the entire combat snapshot (segments, every source view, healing, procs, deaths, `to_value`) on every 100 ms serve beat where anything moved (`foldsink.rs:356`, `combat/mod.rs:249-338`), on top of the per-window `combat.snapshot` asks. | up to 10/s in a fight | the biggest avoidable serve cost (assumed) | an engine `live_rows` door that builds only the source rows from the same inputs | low-medium | open |
| 8 | engine | No `[profile.release]` in `engine/Cargo.toml` (no LTO, 16 codegen units) and `Key::parse`/`Kind::parse` are not `#[inline]`, so every `ev.str("zone")` in the fold crate is a real cross-crate call into a 130-arm string match. | every string-key accessor, ~15-20 per combat line | 100-300 ms of the fold (assumed) | `lto = "fat"`, `codegen-units = 1`; `#[inline]` on the two parsers | none | **measured, LTO dropped**: fat LTO changed nothing outside noise on three paired runs and made the engine build 3.5x slower; the two `#[inline]`s are in (pass 3) |
| 9 | engine | ~20 modules match `ev.kind()` as strings on every event (session detector alone ~45 compares; list in the fold-modules section). | per event per module | 200-500 ms of the fold (assumed) | `match ev.kind_of()` | none | **done** (pass 3): 55 sites rewritten; modules + combat 5.5 to 4.8 s, the session detector 165 to 100 ms |
| 10 | engine | respawn allocates 3 strings per name on every combat/spell line (`respawn_seen.rs:20-56`, `respawn.rs:745-749`, `:356` `id_key`). | ~2M name visits per fold | most of respawn's ~400 ms *measured* | borrow the names, `id_key_ref`, query maps by `&str` | none | **done** (pass 3): respawn 430 to 250 ms |
| 11 | engine | resist allocates attacker/dtype/target strings on every damage line before its dtype branch (`resist/mod.rs:630`), `is_self` and `note_struck` allocate per hit, and spell/DoT lines do ~15 allocations + 3-4 regex passes each (`:656-739`, `ledger.rs:156`). | every damage and resist line | most of resist's ~600 ms *measured* | borrow, `id_key_ref`, cache the (mob, spell, week) → row index | low | **partly done** (pass 3): the damage path borrows, `note_struck`/`kind_of` borrow; resist 660 to 570 ms. The spell-line allocations and the row cache are still open |
| 12 | combat | Per-state allocation storm on every attributed hit and miss: `WindowAccum::ensure` `minute.to_string()` + `state_keys.insert(k.clone())` per active state even when present, `bump_state` allocates a key per active state per call (`procwindows.rs:147`, `aggregate.rs:430`), both aggregates. | per attributed line ×2 | 2(1+3N) allocations per line (assumed) | key buffer, `contains` before insert, `get_or_insert_with` | none | **done** (pass 3): the window keeps its last minute's key, `bump_state` hashes once |
| 13 | combat | `is_rain_spell` runs `spell_canon_key` (regex + lowercase) 24 times per outgoing spell line, before the cheaper attacker test (`procdetect.rs:235`); `damage_origin` recomputes it twice more. | per own spell hit | 0.1-0.5 s on a caster log (assumed) | precomputed rain keys, one canon key per line, attacker gate first | none | **done** (pass 3) |
| 14 | parser | The miss line runs three regexes (`combat.rs:225-275`: the miss pattern, then `miss_verb` and `miss_mod` rescans). | 164k lines on the 68 MB log | ~485 ms *measured* | hand-split like `melee.rs`, oracle-tested | medium | open |
| 15 | parser | ~30 independent `contains` scans per unclaimed line across the cascade's prefilters (`parse/mod.rs:187-237`). | ~230k lines | ~588 ms *measured* | one Aho-Corasick pass per line into a bitset; each gate becomes a bit test, order untouched | low | open |
| 16 | parser | The NDJSON string is built for every event (`event.rs`, `write_json_string` pushes one `char` at a time) and the fold never reads it; `engined` only re-reads `"ts":` out of it. | per event | 150-300 ms (assumed) | (a) chunked escape writer; (b) render lazily on demand | (a) none, (b) medium | open |
| 17 | parser | SpellDb load is O(messages × spells) with three regexes per pair (`spelldb/overlay.rs:383-466`): ~2.8M regex triples at every load. | once per process (and every test/parity run) | most of the 386 ms load (assumed) | compare against the precomputed suffix tails instead | low | open |
| 18 | shared | Gaps keeps one memo over every input (`gapDerive.ts:47-73`), so a single loot line, kill, con or respawn push recomputes every domain and the joined chain. | per push while Gaps or the Wiki Gaps overlay is mounted | factions 7 + drops 38 + images 8 ms + joins per push *measured* | one memo per domain on its own inputs | low | open |
| 19 | shared | `metInLog` bumps its version on every newly met name, which clears the era cache and recomputes Plan's pool, route and Slayer's plan (`metInLog.ts:32-49`, `eraCache.ts`). | per first kill/loot/con of a name | 30-70 ms per bump (assumed) | an `eraVersion` that moves only when the name is one an era verdict can read | medium | open |
| 20 | combat | Eager `format!` for the ring log on heal, resist, CC, death, pet and charm paths while `recording` is false; `HealLine`/`ResistLine` own their strings. | every such line of the fold | tens of ms (assumed) | `log_lazy`, borrow like `MissLine` | none | **partly done** (pass 3): the heal ring line is lazy; the owned `HealLine`/`ResistLine` and the other sites are open |

Honourable mentions, cheap and safe: `memchr` crate for the line split (engine, 30-80 ms);
`JsMap::remove` O(n) in the respawn LRU; `Registry::roster()` linear scan and 24 empty
`take_derived` calls per event; `itemShotsStore` reading localStorage per render; the Swing overlay
ticking at 50 ms; `gameMapWatch` polling a file every 500 ms; `existsSync` before every image read.

## Per area

### Engine fold modules (reviewer 1)

1. No release profile, un-inlined `Key::parse`/`Kind::parse` (top 20 #8).
2. String kind matches in ~20 modules: session.rs:84-155 (`FIRST_PERSON_KINDS.contains` = up to
   38 compares per event), roster.rs:456, kills.rs:251, consider.rs:343, loot.rs:128,
   met.rs:150,202, progression.rs:450,511, progression_ledger.rs:76,90, gaps.rs:204-536,
   gaps_details.rs, gaps_samples.rs, gaps_stock.rs, gaps_threads.rs, gaps_quest_log.rs,
   gaps_trade.rs, gaps_fight.rs, respawn.rs:722, respawn_seen.rs, buffs.rs:542-554,
   buff_timers.rs, buff_conflicts.rs, buffs_session.rs:94, character.rs, leveling.rs, combo.rs,
   spell_sets.rs, item_tiers.rs, turnins.rs, observed_spell_ranks.rs, output_files.rs,
   class_unlocks.rs, bazaar.rs, alerts.rs, epoch.rs (#9).
3. respawn allocations (#10). 4-6. resist allocations and the double `bucket_mut` hash per event
   (#11). 7. buffs: `message_text_of(..).to_string()` per unknown line (`buffs_mining.rs:103`),
   `id_key` per unclaimed event in `buff_procs.rs:90`, unbounded `buff_anchors.rs:148` melee map,
   per-candidate canon keys in `buff_landing.rs:39`.
8. combo `snapshot()` rebuilds the interval model from an unbounded observation list on every
   snapshot; `rev` moves per cast. 9. messageOverlay `build()` re-aggregates and re-verdicts every
   message per snapshot; cursor moves on most landing lines. 10. buffs `build_stats` sorts every
   sample of every key per snapshot. 11. progression bumps its cursor on every new ts, so its
   ~150k-integer snapshot rebuilds per serve beat. 12. `JsMap::remove` O(n) in LRU paths. 13.
   `record_death` clones the prior history. 14. session detector `id_key` per combat line. 15.
   gaps clones `self.zone` per line and builds two `arr_str` Vecs per combat line. 16. gaps
   `snapshot()` is O(domains × rows) with a sort per domain. 17. resist `snapshot()` walks every
   row per beat. 18. Unbounded growth: combo observations, buffs samples, buff_anchors melee,
   resist MobLevels/CasterIndex, gaps_fight mobs. 19. Registry plumbing (`roster()` scan, empty
   `take_derived`). 20. Live-tail alerts try every rule's regex per event.

### Combat engine and serving (reviewer 2)

1. Per-state allocation storm (#12). 2. Rain-spell canon keys (#13). 3. Eager ring `format!`
   and owned line structs (#20). 4. `combat.live` full snapshot per beat (#7). 5.
   `finalize_rounds` walks an unbounded (skill, second) map per source per snapshot;
   `accrue_round` allocates per hit. 6. `eval_closure` walks `engaged` per damage line even when
   the linger cannot have elapsed (`lifecycle.rs:165-192`); `is_engaged_hostile`/`defender_label`
   are O(engaged) scans. 7. `WorldModel::resolve` allocates three strings per call (`world.rs:695`).
   8. Timeline, marker and recent rings are `Vec` with `remove(0)` past the cap. 9. `swing::note`
   builds the modifier list twice. 10. The combat snapshot goes typed → `Value` → string. 11.
   `project()`/`with_landings` deep-copy every source's skill maps per view; `lane_canon_key`
   regexes per lane × skill. 12. `serve()` serializes every frame twice (once to count bytes). 13.
   Sources whose revision is the fold seq are rebuilt and diffed per beat. 14. `JsMap::insert`
   clones the key when present. 15-18. small: deathrecap strings, registry scans, `raw.clone()` per
   request, lock scope in `serve()`.

### Parser and knowledge (reviewer 3)

1. Miss line (#14). 2. Prefilter cascade (#15). 3. NDJSON per event (#16). 4. SpellDb load
   (#17). 5. DoT lines: three auxiliary regexes and two strings per line. 6. `parse_modifiers`
   allocates per annotated hit. 7. Damage-shield and spell-hit regexes tried in sequence (gate on
   the terminal byte), `ds_owner_poss` regex per line. 8. `classify_pet_leader` and
   `classify_ally_pet_leader` do the same capture twice and lowercase the character name per call.
   9. Heal line: two regexes on the captures. 10. `classify_db_buff` SipHashes the whole line twice
   per unclaimed line. 11. `classify_spell_emote` runs on every capitalised unclaimed line. 12.
   Byte loops where the `memchr` crate (already a dependency) would do. 13. knowledge
   `gap_index()` rebuilt twice per attach. 14. `MobIndex::from_json` deep-clones the catalog up to
   four times. 15. Every mob lookup re-keys through `mob_key` (3 regexes). 16. `Corpus::item` per
   loot event does ~6 allocations and an O(n²) de-dupe. 17. `search` lowercases every record per
   keystroke. 18-19. SpellDb build recomputes canon keys per push. 20. Lock scope: fine.

### Electron main (reviewer 4)

1. Store reads inside every module read (#1). 2. ~15 store reads per presence event (#1). 3.
   `resolveEqDir()` per call (#6). 4. Five synchronous fsync store rewrites and three sync output
   parses on the attach path (#1, batching). 5. 32 MB JSON parsed on main at the first con (#2).
   6. Import-time index builds before `ready` (`mobLookupLocal.ts`, `mobDropEra.ts`,
   `gapItem*.ts`, `effectIndex.ts`, `focusBenefit.ts`, `rainSpells.ts`, `spellClasses.ts`,
   `logSpellDbSummary` with a 2.9 MB overlay read): 150-400 ms of the appReady phase. 7. 17 MB
   of corpora in main plus 5 MB again in the renderer; the items index built twice. 8. Two 250 ms
   probe timers run all session even with telemetry off. 9. `gameMapWatch` polls every 500 ms.
   10. Per-event store reads on alert and overlay paths (#1). 11. IPC handlers re-read and
   re-parse the inventory dump per call. 12. Sounds read from disk and base64'd per play. 13.
   `gapsCharacters` ten-minute save pulls full snapshots into main. 14. Archive history reads
   segment JSON synchronously per attach. 15. NDJSON `LineDecoder` slices per line. 16. The
   `storeLoaded` startup phase is misattributed (it is bundle evaluation). 17. Three independent
   EQ-dir rediscoveries. 18. `existsSync` before each image read. 19. Overlay renderers created
   before the main window hydrates. 20. `logTailMarks` is dead store state.

### Renderer (reviewer 5)

1. Maps rows (#3). 2-3. Loot (#4). 4-5. Buffs (#5). 6. Gaps: ~10 Tooltips + 6 IconButtons + 5
   Chips per visible row. 7. Gaps first visit: module-scope folds over the 5.4 MB mob catalog at
   chunk import. 8. XP overlay re-fetches `progression` every active second and `loot` per kill.
   9. Overview re-reads the loot ledger per kill. 10. Mount-time IPC re-fetches of what a store
   holds (`useDeity`, `useFactionRows`, `gearOwnership`, `getMapData` per Maps mount). 11-14.
   Bazaar: summary per mount, `questNamesOf` over 2k names per marks bump, `BazaarWatcher` keeps
   the module watched all session. 12. Character: ~700 Tooltips per render. 13. mobs.json in the
   main renderer chunk. 15. Factions evidence rescan per combat nudge. 16. Mobs roster unwindowed.
   17. Gaps keeps loot/kills/consider watched. 18. `itemShotsStore` reads localStorage per render.
   19. Map pins overlay stringifies its zones every second. 20. Swing overlay at 50 ms. 21. Gear
   first visit `toRow` over 6.9k rows. 22. Plan builds two identical 6.9k maps per mount.

### Shared derivations (reviewer 6)

1. Gaps single memo (#18). 2. Era version invalidation (#19). 3. `zoneKey` unmemoized (7 regex
   passes) and called ~5× per (mob, zone) link in Slayer. 4. `roleValue` rebuilds weights per row
   per slot in `candidatePool`. 5. `eraLegal` + `witnessesOf` re-run `plusSuffix`/`zoneKey` per
   source per row. 6. Respawn verdicts recomputed per gaps row per derive. 7. Grouping refolds the
   whole loot ledger per regroup. 8. Held index: two full ledger scans per loot push per character.
   9. All-characters join resorts and remerges everything per push. 10. `planMob` matches every
   target against every mob. 11-16. small: `ties()` scans, `mobKey` raw folds in `metInLog`,
   `Array.includes` dedupe, per-render signature in `useGapsData`, `visibleGaps` lowercases per
   keystroke, `admittedFor` per bracket. Output-file parsing and the preload bridge: clean.

## How to re-measure

- Engine fold: `parity --stages` (see 2026-11-06-fold-hot-paths.md).
- Tab switches: the settle-time probe of the 10-20 review (production build, hidden window).
- Main-thread blocks: `userData/slow-reads.log` for engine reads; the perf HUD's long-task count
  for the renderer.
