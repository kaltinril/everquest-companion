# Issue sweep: phase doc (2026-11-19)

Owner ask (2026-11-19): review the issues opened on the original repo in the past two months and
every issue on this repo, fix what is plain, ask where it is not. Method: a first pass by three
models (Sonnet, Haiku, Opus), then one evaluator per feature area that checked each claim against
the code and wrote the plan below. The owner's comments on the issues that day are the direction for
each. Rules first: `docs/community/RULES.md`, then `agent/INDEX.md`. What was asked, per feature:
the `requirements/` file named in each phase (rule 19).

## Status

- 2026-11-19: all eight fixes are built and on `main_community`. Each was built in its own
  worktree, read by an independent reviewer on a different model, merged with the others onto one
  branch (no conflicts) and gated once: typecheck, lint, 6,562 unit tests with only the two known
  reds failing, `cargo test --workspace` 1,219 passed.
- Three of the eight reviews found one real defect each, all corrected before the merge: the
  pre-alert's tooltip and request row now say it covers the zone you are in; a Sky Cleanup test
  that would have passed without the fix was made to fail without it; a live log's first line
  that repeats an archived skill level is no longer counted as a raise.
- Found after the merge, by measuring instead of trusting the plan's arithmetic: phase 5 sized the
  menu's default (32 px rows) so the open menu fit the default window, phase 6 then added the Skills
  row, and in the running app the menu was 841 px in an 820 px drawer. Corrected the same day: the
  default is 28 px, a 24 px stop was added below it, and the text-size e2e spec now checks the fit.
  Where phase 5 below says 32 px, read 28.
- Not done: the owner's try in the app, the push, any reply on an issue, a release. The two wiki
  pages are the owner's to edit ("Wiki pages to fix").

## At a glance

| Phase | Issue | What | Verdict | Size | Lane | Work branch |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | [fork #5](https://github.com/kaltinril/everquest-companion/issues/5) | Dragonbane lists An Emerald Drake | fix | S | TypeScript | `fix-dragonbane-drakes` |
| 2 | [fork #8](https://github.com/kaltinril/everquest-companion/issues/8) | Spawn times are not auto-adjusting | fix | M | engine | `respawn-agreed-floor` |
| 3 | [fork #7](https://github.com/kaltinril/everquest-companion/issues/7) | Timer pre-alert | fix | M | TypeScript | `respawn-pre-alert` |
| 4 | [fork #9](https://github.com/kaltinril/everquest-companion/issues/9) | Stuck at Reading log... | fix | M | TypeScript | `log-read-report` |
| 5 | [fork #10](https://github.com/kaltinril/everquest-companion/issues/10) | Left menu is too spacious | fix | M | TypeScript | `menu-size` |
| 6 | [fork #6](https://github.com/kaltinril/everquest-companion/issues/6) | Tradeskill tracking | fix | M | engine | `skills-tab` |
| 7 | [upstream #91](https://github.com/jmoyers/everquest-companion/issues/91) | Separate graph line for you and pet | fix | S | TypeScript | `chart-pet-line` |
| 8 | [upstream #73](https://github.com/jmoyers/everquest-companion/issues/73) | Hand-set quantity on Sky Cleanup | fix | S | TypeScript | `cleanup-pencil` |
| 9 | [fork #2](https://github.com/kaltinril/everquest-companion/issues/2) | Sky runes deposited to the Currencies tab | already done | - | no code | - |

Checked and already on trunk (ledger rows stand): upstream #75 (con colour and standing on the con
card), #83 (scraper fixes), #87 (`spells_us.txt` layout read off the file), #89 (Slayer in the
Achievements tab; Banestrike has no tracker of its own). Upstream #74 is the owner's own notice. No
other issue on the original repo has moved since the 2026-10-27 sweep.

## How the work is run

- One work branch and worktree per fix, off `main_community`, under `.claude/worktrees/<branch>`,
  each with a `node_modules` junction to this clone (RULES.md rules 3 and 18).
- TypeScript fixes run in parallel. The two fixes that touch `engine/` (phases 2 and 6) run one
  after the other and share this clone's `engine/target` through `CARGO_TARGET_DIR`, so no second
  build cache is made and no two builds overlap (WORKFLOW.md, the cargo trap).
- Each implementer runs only its focused tests, one typecheck and lint on the files it changed. An
  independent reviewer reads each diff; a fixer applies what holds. The full gate runs once, on the
  merged work, then again on `main_community` (rule 11; WORKFLOW.md "Make all the changes, then gate
  once").
- Nothing is pushed until the owner has tried it in the app (WORKFLOW.md, Pushing). No reply is
  posted and no issue is closed without the owner's word; the drafts are in each phase.

## Defaults taken while the owner was away

Each is the evaluator's recommendation, taken so the work could go on. Any of them can be changed
after the fact: say which.

**Phase 1, Dragonbane lists An Emerald Drake**

- Which rule keeps drakes out of Dragonbane? Default taken: (a). It is the only candidate that
  follows the game's own list, where Drakes, Wurms and Wyverns are counted on a separate line from
  True Dragons.
- Should the same change teach the table the words drakeling and wyrm? Default taken: No for now. It
  changes a listing nobody asked about; take it up if a player reports one.

**Phase 2, Spawn times are not auto-adjusting**

- How many agreeing kill gaps should it take for your kills to beat a longer wiki respawn on the
  live timer? Default taken: Three gaps within 50 s of each other. It is the rule the Gaps tab
  already uses to tell you the wiki is wrong, so the timer and the suggestion agree.

**Phase 3, Timer pre-alert**

- Should the pre-alert be one setting for every tracked mob, or a checkbox on each mob? Default
  taken: One setting now, a per-mob mute later if it gets noisy. Mobs are already opt-in, and it
  keeps this TypeScript only.
- When a tracked mob's timer is ending in another tier or instance of the zone you are in, should it
  alert too? Default taken: Yes, and say the place. It matches the Respawn overlay's purpose of
  knowing which instance to jump to.
- Should the alert be off until the player ticks the box? Default taken: Off by default, 20 s lead.
  Nobody's app starts talking after an update without asking.

**Phase 4, Stuck at Reading log...**

- How long may "Reading log..." last before the box appears while the read is still making progress?
  Default taken: 15 seconds. A healthy read of a log under 100 MB finishes sooner on most machines,
  and on a slow one the box shows progress, not an error. A dead read shows the box at the first
  check (5 s) whatever is chosen.
- When the app detects that the read has died (file unreadable, engine stopped mid-log), should it
  try again by itself? Default taken: No for this change. A retry of a panic repeats the panic and
  re-reads the whole log each time; get the first screenshots, then add the retry that matches what
  players actually hit.
- May the box show the log's file name (it contains the character and server name), or only its
  size? Default taken: File name and size. You asked for the name, it confirms the app picked the
  right character's log, and the Windows user name is never shown.

**Phase 5, Left menu is too spacious**

- Which default row height and text size should the left menu ship with? Default taken: 14px text,
  32px rows. It is the tallest step at which nothing scrolls in the default window, and a third
  shorter than today.
- Should the two settings show pixel numbers or words? Default taken: Numbers. They fit the stepper
  every other Appearance value uses, and the cursor ring card already shows px.
- The disabled 'Send feedback' row is the tallest row in the menu (72px, two lines) and does nothing
  in the community build. Keep it as is, shrunk by the new sizing, or cut it down? Default taken:
  Keep both lines in this change. Its wording belongs to the test-build identity work, and the new
  sizing already takes 30px off it.

**Phase 6, Tradeskill tracking**

- Where should the skill levels show? Default taken: A new 'Skills' row under Leveling in
  Stats/Data. The Leveling view has layout laws and e2e specs that count its panels, and a separate
  tab leaves room for combines and recipes later.
- How should 'per hour' be measured for a skill? Default taken: The simple pace now; move to the
  slice bar only if players ask to compare stretches of play.
- Feign Death: the log prints only a failed feign, never a success or an attempt, so a success rate
  cannot be computed. Show a count of failed feigns anyway? Default taken: No. A failure count
  without attempts answers nothing; say so on the issue.

**Phase 7, Separate graph line for you and pet**

- How should a player get separate 'you' and 'pet' lines on the DPS chart? Default taken: Follow the
  pet setting: one preference answers 'where does my pet's damage show' for bars and lines alike,
  the default layout changes nothing, and it works on the Overview card, which has no legend.
- Should 'With its owner' also split the chart, or only 'Its own bar'? Default taken: Only 'Its own
  bar': it matches the existing rule in DpsCard.tsx:208 and changes the chart for the fewest
  players.
- Does the 2026-10-21 hold on damage-meter changes cover the DPS-over-time chart? Default taken: No:
  no meter row or meter card changes, and this request is itself player feedback on the pet display.

**Phase 8, Hand-set quantity on Sky Cleanup**

- Does today's ask (address recent upstream issues in the fork) replace the 2026-09-28 'not ours to
  build' ruling for #73, for the pencil only? Default taken: Yes, build the pencil on the Cleanup
  row. It is small, changes no count logic, and reuses the existing statement end to end.
- Shorten the pencil's hover in the same change? It still says the log cannot see a destroy, and it
  is two long sentences. Default taken: Replace on both rows; the sentence is inside the function
  being lifted and one of its claims is no longer true.
- After a row is set to 0 by hand, is the "counts set by hand" chip on the Cleanup tab enough, or
  should the zeroed row stay listed (greyed) with its take-back? Default taken: The chip is enough;
  undo on the quest row. Keeping zeroed rows means a new list state and new copy on a screen the
  owner has pared down twice.

## Waiting on the owner

Things only the owner can do or decide. None of them blocks the code.

- Phase 1 ([fork #5](https://github.com/kaltinril/everquest-companion/issues/5)): Should the wiki
  page be corrected as well, so the app is right by race and not by estimate? Suggested: Check in
  game first, then edit. One kill settles both the wiki value and the est. label.
- Phase 2 ([fork #8](https://github.com/kaltinril/everquest-companion/issues/8)): Will you make the
  Enynti wiki edit (respawn_time = 8:50) that is already on your open-items list? It fixes the timer
  from the first kill for everyone once a build ships the refreshed data. Suggested: Yes, edit the
  page. The code fix needs three agreeing gaps first; the wiki fix needs none.
- Phase 6 ([fork #6](https://github.com/kaltinril/everquest-companion/issues/6)): Which slice comes
  after the levels table? Suggested: Combines next, then recipes: they are what the reporter asked
  for by name, and the combine counts make the recipe list useful (the log's own 'can no longer
  advance' line marks a recipe as trivial for you).
- Phase 6 ([fork #6](https://github.com/kaltinril/everquest-companion/issues/6)): `/outputfile
  recipes <tradeskill>` has never been sampled, and the app does not guess dump formats. Ask the
  reporter for a sample file? Suggested: Yes, ask on the issue; it costs nothing and unblocks a
  'recipes you know' column later.
- Phase 8 ([upstream #73](https://github.com/jmoyers/everquest-companion/issues/73)): Post an answer
  on upstream #73 pointing at the fork? Suggested: Yes, once it is in a build, as was done for #89.
- Phase 9 ([fork #2](https://github.com/kaltinril/everquest-companion/issues/2)): Post a short reply
  naming the option and the build, and close fork #2, or leave it open for the Currencies-tab screen
  reader idea? Suggested: Reply and close: the suggestion shipped in test.39. The 2026-11-02 comment
  points at the dropdown but does not name the option or the build.

## Wiki pages to fix (reported, not fixed in the app)

Owner, 2026-11-19: a complaint whose cause is wrong or missing wiki data is reported, not fixed.
These two are the wiki half of phases 1 and 2; the code half of each is a separate fault in the app.

**Dragonbane lists An Emerald Drake ([fork #5](https://github.com/kaltinril/everquest-companion/issues/5))**

```
PAGE: "An emerald drake" (mob page, pageid 41902). Edit link: https://eqlwiki.com/index.php?title=An_emerald_drake&action=edit
FIELD: `| race` in {{Namedmobpage}}.
SAYS NOW: `| race              = Dragon` (scripts/sources/cache/mobs/page-41902.wikitext:9).
SHOULD SAY: `Drake`, the value the wiki uses on its 30 other drake pages, including the same-level classic ones (A Lesser Ebon Drake, A Fire Drake, An onyx drake). Inferred, not yet confirmed in game.
EVIDENCE: (1) the reporter killed several level 8 emerald drakes and Dragonbane (True Dragons) did not move; (2) the wiki's own "Slayer: Special" page lists only Lady Vox and Naggy for Dragonbane in Classic (page-60769.wikitext:328); (3) the game counts Drakes on separate lines from True Dragons (tests/fixtures/Primitive_freeport-Achievements.txt:876-879, 995-996); (4) it is the only page among the 84 the wiki files under a true-dragon race whose name says drake, and the only one below level 51.
ALSO SEEN ON THE SAME PAGE: no era banner (Nagafen and Vox carry {{Classic Era}}) and `location = ''Need Info''`.
EFFECT OF THE EDIT: the next delta scrape regenerates mobRaces.json and the drake is listed under the drake achievements by race, with no est. chip.
```

**Spawn times are not auto-adjusting ([fork #8](https://github.com/kaltinril/everquest-companion/issues/8))**

```
Page: Enynti (Castle of Mistmoore named).
Field: respawn_time.
Says now: 22 minutes (scripts/sources/cache/mobs/page-39409.wikitext:17; src/main/data/respawns.json:1383-1388, unchanged by the 2026-11-19 delta).
Should say: 8:50.
Evidence: 31 same-stay gaps from the owner's Aug-Oct log with the peak at 529-533 s (docs/community/agent/MEASURED.md:375; tests/respawnLearn.test.mts:16); three more on 2026-11-12 at 527, 567 and 529 s; the reporter independently sees 8m 45s. The longer gaps are spawn cycles the mob did not take.

https://eqlwiki.com/index.php?title=Enynti&action=edit
| respawn_time      = 8:50
```

## Phase 1: Dragonbane lists An Emerald Drake ([fork #5](https://github.com/kaltinril/everquest-companion/issues/5))

- Verdict: fix. Size S. TypeScript only. Work branch: `fix-dragonbane-drakes`. Requirements:
  `requirements/slayer-tab.md`.
- On trunk today: Yes, at ea201f2d8 with the data scraped 2026-11-19. With default switches the
  Dragonbane "Where to go" list is three mobs: An Emerald Drake (Butcherblock Mountains), Lord
  Nagafen and Lady Vox. Simulated with the trunk matcher over the committed mobs.json and
  mobRaces.json.
- The change: Teach the kinds table one rule: a mob whose page race says true dragon but whose name
  says drake, wurm or wyvern is not a true dragon. It is then read by its name like any mob without
  a usable race, so the drake leaves Dragonbane and shows under the drake achievements marked est.

### What is true

CAUSE: wiki data. The app's rule does not widen Dragon to drakes; the drake's wiki page states race
Dragon and the app repeats it. No hand-written mob list is involved.

TRACE, dump to list:
1. The dump prints `Dragonbane` / `True Dragons n/250` under Slayer: Special
(tests/fixtures/Primitive_freeport-Achievements.txt:876-877 at 30/250;
slayer-open-Achievements.txt:234-235 at 19/250). `slayerRecord` keeps the line verbatim as
`SlayerCounter.label` (src/shared/outputs/slayer.ts:35-44).
2. `counterRows` -> `slayerTarget` -> `labelMatcher('True Dragons')` (slayerRows.ts:35-43,
slayerPlan.ts:66-70, slayerMatch.ts:104-108). The term `true dragons` resolves to five wiki race
values: dragon, velious dragons, ice dragon, lava dragon, black and white dragons
(slayerKinds.ts:363-365). The term has no `names`, so nothing reaches Dragonbane by name.
3. `slayerCatalog()` inverts mobRaces.json (race -> page titles) and gives each catalog mob its
page's race (slayerData.ts:22-35); `mobFacts` folds it with `raceKey` (slayerMatch.ts:94-101).
4. `planZones` lists a mob under a counter when `facts.race` is in the counter's race set
(slayerPlan.ts:248-260, 305-336); ZoneList.tsx draws it.
THE EXACT FIELD: mobRaces.json `races.Dragon` contains "An emerald drake", generated verbatim by
scripts/gen-mob-races.mts from the cached page's `| race` field.

CACHED PAGES, quoted:
- An emerald drake (pageid 41902): `| race = Dragon`, `| level = 8 ~ 14`, zone Butcherblock
Mountains, no era banner.
- Lord Nagafen (38875): `| race = Lava Dragon`, level 55, Nagafen's Lair, {{Classic Era}}.
- Lady Vox (38876): `| race = Lava Dragon`, level 55, Permafrost, {{Classic Era}}.
- The wiki's own "Slayer: Special" page (60769) says under Dragonbane: "Classic: Lady Vox and Naggy
(10 kill each day max)".

EVERY MOB THE RULE PUTS UNDER DRAGONBANE TODAY: 84.
Shown by default (3): An Emerald Drake 8~14 Butcherblock Mountains [Dragon]; Lord Nagafen 55
Nagafen's Lair [Lava Dragon]; Lady Vox 55 Permafrost [Lava Dragon].
Flagged out of era, shown only with "Zones not open yet" (81):
- [Dragon] Veeshan's Peak 65: Hoshkar, Nexona, Silverwing, Xygoz. Old Sebilis 65: Trakanon, Trakanon
(triggered).
- [Ice Dragon] Gorenaire 60 Dreadlands; Jen Sapara 62 and Zil Sapara 60 Western Wastes.
- [Black and White Dragons] Zlandicar 70 Dragon Necropolis.
- [Velious Dragons] Temple of Veeshan: Aaryonar 66, Dozekar the Cursed 66, Lord Vyemm 66, Vulak`Aerr
70. Lord Yelinak 70 Skyshrine. Western Wastes: Myga 52, Sontalak 70.
- [Lava Dragon] Veeshan's Peak 65: Druushk, Phara Dar. Severilous 60 Emerald Jungle. Talendor 60
Skyfire Mountains. Temple of Veeshan 66: Cekenar, Gozzrem, Jorlleag, Lady Mirenilla, Lady Nevederia,
Lendiniara the Keeper, Lord Feshlak, Lord Kreizenn, Sevalak, Telkorenar, Zlexak. Sleeper's Tomb 70:
Hraashna, Nanzata, Tukaarak and Ventani the Warder. The Wakening Land: Rolandal 60, Wuoshi 64.
Zordakalicus Ragefire 54 Nagafen's Lair (EpicQuests banner). Western Wastes (42): Amcilla 53, Atpaev
51, Ayillish 57, Bratavar 53, Bufa 54, Cargalia 57, Crial 54, Del Sapara 60, Derasinal 57, Draazak
58, Entariz 57, Esorpa of the Ring 53, Gafala 52, Gangel 51, Glati 54, Harla Dar 66, Hechaeva 54,
Honvar 52, Ionat 56, Jerigozia 58, Kar Sapara 60, Karkona 57, Klandicar 70, Linbrak 53, Makala 51,
Mav Sapara 60, Mazi 54, Melalafen 65, Neordla 57, Nintal 54, Onava 54, Pantrilla 53, Quoza 54, Rak
Sapara 59, Sivar 53, Uiliak 53, Veredenia 55, Vitaela 53, Von 57, Vraptin 53, Yal 52, Yeldema 52.
ONE PAGE, NOT A PATTERN: the drake is the only one of the 84 whose name states another kind, and the
only one below level 51. The catalog's 30 other mobs named drake with a dragonkind race are filed
`Drake`, including its classic low-level siblings (A Lesser Ebon Drake 8-10, A Fire Drake 9-11, An
onyx drake 9).

THE GAME'S OWN LIST: there is a separate drake kind. `You Call That a Dragon?` counts "Dinosaurs,
Dracoliches, Lesser Dragons, Drakes, Drixies, Raptors, Witherans, Wurms, and Wyverns." n/1000
(fixture :878-879); `You Keep Dragon Me Into This` counts "Drakes, Drixies, and Fay Drakes." n/100
(:995-996); `Here Be Dragons!` counts Dragons plus all of them, n/5000 (:805-806). In both fixtures
Here Be Dragons! equals True Dragons plus You Call That a Dragon? exactly (19+90=109, 30+52=82). The
game client's own text for You Call That a Dragon? reads "not all things are worthy of the title
dragon. Drakes, raptors, scalewrought, witheran, wurms, wyverns, and wyrms" (the owner's install,
Resources/Achievements/AchievementsClient.txt:636; not in the repo).

OTHER KINDS ON THE SAME RULE: all of them. 127 of the table's 228 terms claim wiki races; 9 claim
races only. Over the 7,744 catalog mobs with a claimed race, 156 (69 groups) have a name stating a
different kind than the page race. Most are the game reusing a model, which the table's measurements
say is what the game counts (27 clockworks on spider pages, 7 crocodiles as Alligator, 5 mummies as
Zombie), so a general "name beats race" rule would be wrong. A handful look like the same sort of
page slip and are unverified: A werebat [Kobold], A minor scarab [Giant Spider], A glyphed ghoul
[Dark Elf], Skeleton private [Zombie], Monstrous zombie and Ghoul boss [Skeleton]. None was reported
by a player.

CANDIDATE RULES, on today's data:
(a) NAME RULE: a page race claimed by True Dragons yields when the mob's name states drake, wurm or
wyvern (the table's existing name words). Rests on the mob name and the game's own separate kinds.
Drops exactly one mob (the drake) and keeps 83; simulated, 1 of 8,154 mobs changes. The drake then
lists under the three drake lines marked est. Expansion dragons arrive by race with no work; a
mis-raced drake, wurm or wyvern is caught. Fails for a mis-raced mob whose name states no kind (a
named drake filed as Dragon), and would wrongly drop a true dragon named "drake" (none exists in
84).
(b) RAID TARGETS: bosses.json is a hand-written roster in scripts/scrape-bosses.ts (`TARGETS`, 32
classic names; only portraits are scraped). Crossed with the dragon races it keeps Nagafen and Vox
and drops the drake and all 81 others. It is the two-boss hand list under another name: every
expansion dragon needs a hand edit, and the 44 Western Wastes dragons are not raid targets at all.
(c) LEARN FROM DUMPS: the store keeps only the latest record (src/main/storeSlayer.ts:16-18), so it
needs new snapshot history joined to kills, per character. Drops nothing until each player has
already wasted kills. The wiki states a daily cap of 10 on this counter, so real dragon kills past
the cap would mark Nagafen as not counting. Large, and wrong in its main case.
(d) LEVEL FLOOR: lowest real dragon is 51, the drake is 8~14, so any floor from 15 to 51 drops only
the drake. A number with no basis in the game: a level 62 drake mis-raced as Dragon passes, a
low-level true dragon in a later expansion is hidden.
Also considered: dropping the generic `dragon` value. It would hide Trakanon and four Veeshan's Peak
dragons on no evidence.
Recommended: (a).

No text in the issue, the code comments or the cached pages read as an instruction to an AI.

### Steps

1. src/shared/slayer/slayerKinds.ts, interface SlayerTerm (line 36): add an optional field
   `yieldsTo?: readonly string[]` with a one-line doc: the terms whose NAME word outranks this
   term's race claim. Add one line to the header's list of what a term carries, and one line under
   the measured/assumed notes recording fork#5 (page race Dragon on An Emerald Drake, a player's
   kills did not move True Dragons, the game lists Drakes on its own line). Keep it lean.
2. src/shared/slayer/slayerKinds.ts, CLAIMS['true dragons'] (lines 363-365): add `yieldsTo:
   ['drakes', 'wurms', 'wyverns']`. No other term changes. No name word is added.
3. src/shared/slayer/slayerMatch.ts: after CLAIMED_RACES add a module constant `YIELDS:
   ReadonlyMap<string, ReadonlySet<string>>`, built from SLAYER_TERMS: for each term with
   `yieldsTo`, map each of its `races` to the set of terms it yields to.
4. src/shared/slayer/slayerMatch.ts: add a private function `standingRace(name: string, key:
   string): string`. It returns `key` when YIELDS has no entry for it (the path for all but about 84
   mobs, so `nameTerm` is not run for the rest of the catalog); otherwise it returns '' when
   `nameTerm(name)` is one of the yielded-to terms, else `key`.
5. src/shared/slayer/slayerMatch.ts, mobFacts (lines 94-101): compute `const key =
   standingRace(name, race === undefined ? '' : raceKey(race))`. Leave the rest as is: with key ''
   the existing line already reads `nameTerm(name)`, so the drake becomes { race: '', nameTerm:
   'drakes' }. matchMob, hitsOf, strictMatcher and the map shading need no change, since they all
   read these facts.
6. src/shared/slayer/slayerMatch.ts header (lines 8-10): add one sentence naming the second
   exception beside `always`: a term's `yieldsTo`, where the game counts the named kind on a
   separate line.
7. BEFORE: mobFacts('An Emerald Drake', 'Dragon') is { race: 'dragon', nameTerm: null }; it matches
   True Dragons and Here Be Dragons! by race. AFTER: { race: '', nameTerm: 'drakes' }; it matches
   nothing on True Dragons, and matches You Call That a Dragon?, You Keep Dragon Me Into This and
   Here Be Dragons! by name, drawn with the est. chip. Lord Nagafen, Lady Vox, Trakanon and the
   other 80 are unchanged.
8. Add tests/slayerYield.test.mts (see tests). tests/slayer.test.mts is at 397 of 440 code lines, so
   a new file is safer than extending it.
9. Docs in the same change: a row in docs/community/requirements/slayer-tab.md (2026-11-19, owner
   via fork#5: a mob named drake, wurm or wyvern is never listed as a true dragon; the rule is a
   rule, not a list of bosses), and a ledger row for fork#5 in the fork-issues table of
   docs/community/ISSUES.md (near line 51) with the wiki cause and the fix. Do not touch AGENTS.md
   or src/shared/releaseNotes.ts.

### Tests

- tests/slayerYield.test.mts: matchMob(labelMatcher('True Dragons'), mobFacts('An Emerald Drake',
  'Dragon')) is null, and against the fixture's You Call That a Dragon? line it is 'name' (proves
  the drake leaves Dragonbane and is labelled an estimate where it lands).
- tests/slayerYield.test.mts: mobFacts('Lord Nagafen', 'Lava Dragon') and mobFacts('Trakanon',
  'Dragon') still match True Dragons with basis 'race' (proves the generic Dragon value still counts
  when the name states no lesser kind).
- tests/slayerYield.test.mts: take the Dragonbane counter out of the parsed fixture
  (slayer-open-Achievements.txt, achievement 'Dragonbane'), build slayerTarget from it, and run
  planZones with NO_CAP over a three-mob hand catalog (drake in Butcherblock Mountains with race
  Dragon, Lord Nagafen, Lady Vox): the plan lists Nagafen's Lair and Permafrost and not Butcherblock
  Mountains. Hand catalog only, no count of wiki data.
- tests/slayerYield.test.mts, table integrity: every `yieldsTo` entry is a term in SLAYER_TERMS that
  has `names`; every race of a term with `yieldsTo` is claimed by that term alone (dropping the race
  must not cost another kind its claim).
- Existing tests that must stay green unchanged: tests/slayer.test.mts 'a stated race decides, and
  the name is not read over it' (:209) and 'the clockworks are read by name whatever their page
  states' (:238).

### Risks and limits

- Listing the drake under the drake achievements is an estimate: nobody has confirmed in game that
  it moves those counters. It is drawn with the est. chip, and the reporter is asked.
- The rule reads names, so a mis-raced mob whose name states no kind (a named drake filed as Dragon)
  would still be listed. None exists today.
- Whether the game's True Dragons includes the wiki's generic Dragon value at all (Trakanon and four
  Veeshan's Peak dragons) cannot be told before Kunark. They are flagged out of era and hidden by
  default, and the fix leaves them as they are.
- `drakeling` and `wyrm` are not whole-word matches of the table's `drake` and `wurm`, so a
  mis-raced drakeling would slip past. Adding the words would also newly list A thorn drakeling
  (Misty Thicket 3-5, page race Monster) under Drakes; left out on purpose, see owner questions.
- Once the wiki page says Drake the rule does nothing for this mob. It stays as a guard and costs
  about 84 name reads at catalog build.
- Stale reference seen, not part of this fix: the header of src/shared/slayer/slayerKinds.ts:19
  cites tests/slayerKinds.test.mts, which does not exist; the check lives in
  tests/slayer.test.mts:164.

### The three first passes, checked

sonnet: HELD: the page states race Dragon; the table joins race to term by hand; other emerald
drakes sit under Drake; Nagafen and Vox are Lava Dragon. Its edit link spells the title
An_Emerald_Drake, the page title is "An emerald drake". Did not read slayerMatch.ts; I did, and no
name fallback reaches Dragonbane. "Nothing for the app to do" is overtaken by the owner's direction.
haiku: HELD: race field, the Dragon bucket, slayerKinds lines, page race answers before the name,
and that the drake files under Drakes once the race no longer says Dragon (simulated). The Vox and
Naggy text is at page-60769:328, not 322-327. Size S for a no-change verdict was inconsistent.
opus: HELD: fixture 876-879, the seven pages under Dragon exactly, drakes as a separate term, the
next delta scrape carrying a wiki edit into the app. REFUTED IN PART: "the kill test shows the game
draws it as a drake" overreaches; it shows the drake is not a True Dragon, not which model it has.
Its guess that Nagafen and Vox are "lava/ice" is Lava Dragon for both.
All three: wiki-data as the cause is right. None listed what else the rule includes (84 mobs, 3
shown by default) or noticed that the wiki's own Slayer: Special page already names only Vox and
Naggy.

### Reply draft (posted only on the owner's word)

> Thanks for testing this, you were right. The app takes each mob's kind from the race on its wiki page, and the page for An Emerald Drake says Dragon, so it was filed next to Lord Nagafen and Lady Vox.
>
> We are changing the app so a mob whose name says drake, wurm or wyvern is never listed as a true dragon, whatever its page says. The drake will show under the drake achievements instead, marked as an estimate, and the wiki page needs the same correction.
>
> One thing that would help: when you killed those drakes, did "You Call That a Dragon?" or "You Keep Dragon Me Into This" go up?

## Phase 2: Spawn times are not auto-adjusting ([fork #8](https://github.com/kaltinril/everquest-companion/issues/8))

- Verdict: fix. Size M. Touches the engine (Rust). Work branch: `respawn-agreed-floor`.
  Requirements: `requirements/respawn-first-sight.md`.
- On trunk today: Yes. Not fixed by the 2026-11-07 work (pooling, first in test.44) or the
  2026-11-09 work (shared-name switch, first in test.45), nor by anything since: test.51 and trunk
  still hold kills to the wiki time. The owner's own archive segment written by app test.50 shows
  the Enynti row at 22:00 with 31 gaps whose shortest is 8:49.
- The change: When at least three of a mob's pooled kill gaps sit within 50 seconds of each other
  (the owner's existing agreement rule) and that cluster is two minutes or more, its lowest gap
  replaces a longer wiki time as the floor under the kills. One or two gaps, or gaps that do not
  agree, keep the wiki floor exactly as today.

### What is true

Two causes, one wiki and one code.

WIKI: the Enynti page says respawn_time = 22 minutes; the committed copy repeats it (1320 s). The
true cycle is about 8:50.

CODE: the timer's number is a three-rung ladder computed in the engine: (1) a number the player
typed, (2) the smallest gap from the player's kills, (3) the wiki. Rung 2 is clamped upward to the
wiki: `Some(w) => o.max(w)`. So kills can raise a timer above the wiki after one gap, but no number
of kills can lower it below the wiki. There is no sample count, tolerance or reset that changes
this. It has been so since the creator's first commit of the feature (1fc002eb8, 2026-08-10), in
every build.

The learning rule the owner set on 2026-10-25/26 (three gaps within 25 s of their middle, five
within 20 s, or ten; lowest cluster wins; under two minutes suspect) lives in `constantRespawn` and
feeds only the Gaps tab's "Fix respawn" row. It never reaches the clock.

How a sample is made: a kill starts the clock (a sighting never does, unless the player confirms
it). A gap runs from a death to the mob's first sign of life a minute or more later (or the next
death if nothing named it), and counts only when both ends fall in one stay in the zone. Gaps are
pooled across the zone's tiers and instances. A rebirth line or a module reset clears them; the
engine re-reads the whole log at each launch, so earlier days count.

MEASURED on the owner's log: four Enynti kills on 2026-11-12 (21:20:05, 21:29:01, 21:39:01,
21:48:37) in one stay in The Castle of Mistmoore 4 (Refined). Gaps to first sign of life: 527, 567,
529 s. Fed to the shipped code: `constantRespawn` says 8:48 (3 of 3 within 25 s), and
`resolveRespawn` says `<= 22m 0s - your kills (3 gaps), floored by the wiki`. The 31 archived gaps
(Aug to Oct) give a verdict of 8:50 and the same 22:00 on the clock. The owner's installed store
watches Enynti with no typed number, so his own row reads 22 minutes too.

This matches the report exactly: the reporter's "8m 45s" is the row's own hover text ("Your shortest
gap in one visit"), and 22m is the wiki clamp. The app holds the evidence, offers it as a wiki fix
on the Gaps tab, and still counts down from the wiki number.

Workaround today: the pencil on the timer row ("Edit respawn for Enynti"), type 8:50, Save. A typed
number is never clamped.

No text in the issue reads as an instruction to an AI.

### Steps

1. Engine, engine/crates/fold/src/modules/respawn_learned.rs: add `LearnedStore::agreed(&self, key,
   same_zone, floor) -> Option<i64>`. Collect every gap of `floor` or more from the entries
   `same_zone` admits (as `pooled` does), sort, find the lowest gap g with at least 3 gaps in [g, g
   + 50_000]; return g, or None when there is no such window or g < 120_000 (two spawns sharing a
   name). Constants beside the existing ones, one-line comments naming respawnLearn.ts as the rule's
   source.
2. Engine, engine/crates/fold/src/modules/respawn_places.rs: add `pub(super) fn agreed_gap(&self, h:
   &MobHistory, floor: i64) -> Option<i64>` that calls `self.learned.agreed(&h.key, |z| zone_base(z)
   == base, floor)`, pooled across the zone's places like `pooled_gaps`.
3. Engine, engine/crates/fold/src/modules/respawn_wiki.rs: add `pub fn floor_of(wiki_ms:
   Option<i64>, agreed_ms: Option<i64>) -> Option<i64>` = `wiki_ms.map(|w| agreed_ms.map_or(w, |a|
   a.min(w)))`. The agreed gap can lower the wiki floor, never raise it, and creates no floor where
   the wiki states none. `resolve_respawn` keeps its four parameters; update its doc comment to say
   the fourth is the floor in force.
4. Engine, engine/crates/fold/src/modules/respawn.rs `row_for` (lines 531-536): compute `agreed_ms =
   self.agreed_gap(h, if watch.shared_name { SHARED_NAME_FLOOR_MS } else { 0 })`, pass
   `floor_of(wiki_ms, agreed_ms)` to `resolve_respawn`, and publish the new row field `agreed_ms:
   Option<i64>` (serde camelCase `agreedMs`, skipped when None). `wiki_ms` on the row stays the
   page's own number. respawn.rs is recorded at 541 code lines with a 596 ceiling; this adds about
   six.
5. No protocol change: snapshot rows are not in protocol/schema/messages.schema.json, and the
   `respawn.watches` view cells need no new field (sharedName set the precedent). Do not bump
   RESPAWN_SHAPE_VERSION: mergeRespawn refuses to join archives of a different version, and the
   field is optional.
6. TypeScript mirror, src/shared/respawn.ts: add `agreedMs?: number` to `RespawnEvidence` and to
   `RespawnRow`; in `resolveRespawn` the floor becomes `wikiMs === undefined ? undefined :
   Math.min(wikiMs, agreedMs ?? wikiMs)`; `respawnCalculated` passes `row.agreedMs`;
   `respawnFloored` returns true only when the wiki number is the floor in force (no `agreedMs`
   below `wikiMs`); `respawnProvenance` adds one sentence when `agreedMs < wikiMs` on an observed
   row: 'Your kills agree, so the wiki time is not used.'
7. src/shared/logArchive/mergeRespawn.ts `joinRow`: carry `agreedMs` as the smaller of the two
   sides' values when either has one, before `withEstimate` re-reads the ladder.
8. Before: Enynti with 3 or 31 gaps reads `<= 22m 0s - your kills (N gaps), floored by the wiki`.
   After: `<= 8m 47s - your kills (3 gaps)` (8m 49s on the archived gaps), with the hover saying the
   wiki time is not used. With one or two gaps, or a mob whose gaps do not agree, nothing changes. A
   row with no wiki time is unchanged. A wiki time shorter than the kills is unchanged.
9. Docs on the work branch: a row in docs/community/requirements/respawn-first-sight.md, a row for
   fork #8 in docs/community/ISSUES.md, and one bullet in docs/community/agent/BRANCH_NOTES.md
   beside the 2026-11-07 and 2026-11-09 respawn bullets stating the rule and its constants.

### Tests

- engine/crates/fold/src/modules/respawn_places_tests.rs (extend): `agreed` over the measured Enynti
  gaps returns 529_000; over [527, 567, 529] s returns 527_000; over two gaps returns None; over a
  60-90 s cluster returns None; with a 10-minute floor ignores the short gaps. `floor_of` and
  `resolve_respawn` as pure numbers: (observed 529 s, wiki 1320 s, agreed 529 s) gives 529 s
  'observed'; without agreed gives 1320 s; an outlier (observed 200 s, agreed 529 s, wiki 1320 s)
  gives 529 s; wiki below the kills is unchanged; no wiki is unchanged.
- engine/crates/fold/src/modules/respawn_places_tests.rs (extend): a module-level test that four
  kills 530 s apart in one stay publish `agreed_ms` on the row, and that gaps learned in a closed
  private instance still count toward it. Use a mob with no wiki row, or pick any wiki row with a
  duration at run time; never a named page or a count.
- tests/respawnAgreed.test.mts (new): `resolveRespawn` with and without `agreedMs` (same cases as
  the Rust ones, so the two ladders cannot drift); `respawnSourceLabel` drops 'floored by the wiki'
  when the agreed gap is the floor and keeps it otherwise; `respawnProvenance` carries the new
  sentence only then; `respawnCalculated` on a row with a typed number returns the agreed estimate;
  `mergeRespawn` of two rows keeps the smaller `agreedMs` and numbers the joined row from it.

### Risks and limits

- The right fix is in the engine (the estimate, the row order and the served view are all computed
  there), so this needs the long Rust build; a TypeScript-only override would leave two opinions of
  one clock.
- Two spawns sharing a name that are offset by more than two minutes could produce three agreeing
  gaps below the true cycle and so lower a correct wiki floor. The existing 'Several mobs share this
  name' switch and a typed number are the answers; the two-minute guard covers the common trash
  case.
- The Rust rule tests the window's lowest gap against two minutes, where constantRespawn tests the
  cluster's peak; the Rust side is slightly stricter at that boundary. Stated in the comment so
  nobody 'aligns' them by accident.
- An archive segment captured by an older build carries no agreedMs, so an archived-only row keeps
  the wiki floor until the mob is killed again or the app re-captures the segment.
- The reporter needs three agreeing gaps in his own log (four kills in one stay, or gaps from
  earlier stays) before the timer drops; with fewer it still reads 22 minutes until the wiki page is
  fixed and a build ships the refreshed data.

### The three first passes, checked

sonnet: held on every fact the verdict rests on (wiki 22 minutes, `o.max(w)`, constantRespawn feeds
only the Gaps tab, a typed number is not clamped). Its 'no code change' proposal is overruled by the
owner's direction. It measured nothing.
haiku: same core facts held. Its line numbers for respawnLearn.ts (150-165, 184) and respawn.rs
(84-110, 468-481) are off; the functions are at 121-141/190 and 461-511. Its claim that the clamp
'also falls under the wiki-data rule' I refute: the app holds contrary evidence and derives the
wrong number, which is code.
opus: same core facts held, including 'the floor applies in every build' and pooling arriving in
test.44. Its size S I refute: the TypeScript mirror must change too, so it is M.
All three missed that mergeRespawn.ts re-runs the TypeScript ladder on archive-joined rows, and that
the clamp is the creator's design (1fc002eb8), not a fork-owner ruling. None looked at the owner's
log.

### Reply draft (posted only on the owner's word)

> Thanks for this, you found a real one. The wiki lists Enynti at 22 minutes, and the app was treating the wiki time as a minimum for your own kills. So it measured your 8:45 (that is the number on the hover) but still counted down from 22.
>
> I'm changing that: once three or more of your kill gaps agree with each other, your kills win over a longer wiki time. I'll also correct the wiki page to 8:50.
>
> Until that build is out, click the pencil on the Enynti timer row, type 8:50 and Save. A time you type is always used as is.

## Phase 3: Timer pre-alert ([fork #7](https://github.com/kaltinril/everquest-companion/issues/7))

- Verdict: fix. Size M. TypeScript only. Work branch: `respawn-pre-alert`. Requirements:
  `requirements/respawn-alert.md`.
- On trunk today: Yes, it is missing: there is no respawn alert of any kind and no lead-time
  setting.
- The change: Add one Timers-tab setting, 'Alert N s before respawn' (off by default, 20 s), and a
  seeded 'Respawn timer ending' alert on a new app signal that speaks the mob's name. A small
  always-mounted watcher fires the signal once per clock when the lead moment passes; sound, voice,
  banner and volume stay the Alerts tab's.

### What is true

The Timers feature has no sound, speech or alert code. The app-signal list is bossDefeat,
questComplete and bazaarWatch only. The alert framework already gives everything else the reporter
asked for: a seeded alert can speak a phrase built from tokens, show a banner line, and be
re-voiced, muted or disabled on the Alerts tab.

Facts that shape the design:
- App signals are fired in the main window's renderer (`fireAppSignal`); the engine never evaluates
them, and the signal names are not in the protocol. So this is TypeScript only.
- The existing early-warning offset (`earlyWarnSec`) is evaluated engine-side against buff and
debuff timer rows. `fireAppSignal` ignores it, so it cannot supply the lead time.
- `fireAppSignal` applies a per-alert cooldown that defaults to 2 s. Two mobs due within 2 s would
lose the second alert unless the seeded alert sets `cooldownMs: 0` and the watcher does its own
once-per-clock dedupe.
- An empty token value renders the token literally (`{place}` is spoken as written), so every token
must always carry text.
- The engine keeps only key, display, customSec and sharedName on a watch and publishes its own
copy, so a new per-mob flag would not come back in the snapshot without a Rust change. One setting
in its own store key avoids that.
- Every respawn row already carries baseTs and estimateMs, and `respawnTierView` already yields the
clocks of the zone you stand in across its tiers and instances, with dungeon crawls left out.
- The main window sets no `backgroundThrottling` option, so a renderer interval may be slowed while
the window is minimized, which is the normal state while playing. I did not measure this in the app;
the plan avoids the question by ticking from the main process.

No text in the issue reads as an instruction to an AI.

### Steps

1. Decisions the plan builds: (a) ONE setting for all tracked mobs, on the Timers tab header row
   beside the scope switch: a checkbox and a seconds field. Tracking is already opt-in per mob. (b)
   Default off, lead 20 s, bounded 5 to 300. (c) The mob is named by the watch's display name as the
   log printed it, through tokens. (d) It fires once per clock, for every clock of the zone you
   stand in that the Respawn overlay lists: where you stand always, another tier or instance while
   within twice the respawn. Never another zone, a dungeon crawl, a row already seen up, a row with
   no estimate, or a clock already past due. A mob that is simply UP in a fresh instance has no
   clock and no alert.
2. src/shared/alertTypes.ts:84: add `'respawnSoon'` to AppSignal. src/shared/alertCaptures.ts:309:
   `respawnSoon: ['mob', 'seconds', 'place', 'zone', 'text']`. src/shared/alertBanner.ts:192:
   `respawnSoon: false` (nothing else draws a card).
   src/renderer/src/features/alerts/ConditionEditor.tsx:25-31: add it to APP_SIGNALS with the label
   'Respawn timer ending'.
3. New src/shared/respawnAlert.ts (pure). `RespawnAlertSetting { on: boolean; leadSec: number }`,
   `DEFAULT_RESPAWN_ALERT = { on: false, leadSec: 20 }`, the 5 and 300 bounds,
   `normalizeRespawnAlert(raw)`. The default phrases as constants: speech `'{text}'`, banner `'{mob}
   in {seconds}s - {place}'`. `respawnAlertsDue(snap, leadSec, prevMs, nowMs)`: take
   `respawnTierView(snap, nowMs, 'here')`, and for each entry with an estimate and not seen, return
   it when `prevMs < baseTs + estimateMs - leadSec*1000 <= nowMs` and the clock is not yet due;
   `prevMs === null` returns nothing (the first look is a baseline). Each result carries `key`
   (`row.id@baseTs`), `context` (`display - place tag`) and captures: mob = display, seconds = the
   lead, place = the place tag ('open +4', 'inst +4'), zone = `respawnZoneTitle`, text = 'Enynti in
   20 seconds' where you stand and 'Enynti in 20 seconds, open plus 3' elsewhere. No token is ever
   empty.
4. Main store: src/main/storeShape.ts adds `respawnAlert?: RespawnAlertSetting` and
   `alertRespawnSeed?: boolean`. src/main/storeRespawn.ts adds `getRespawnAlert()` and
   `setRespawnAlert(next)` through the normalizer. src/shared/ipc.ts adds `respawnAlertGet`,
   `respawnAlertSet` and the event `respawnAlertTick`. src/main/ipc/respawn.ts registers the two
   handlers; src/preload/respawn.ts adds `getRespawnAlert`, `setRespawnAlert` and
   `onRespawnAlertTick(cb)` (the `onAlertFired` shape).
5. New src/main/respawnAlertTick.ts: `syncRespawnAlertTick(on)` starts or stops a 1 s main-process
   interval that sends `respawnAlertTick` with `Date.now()` to the main window. Called at
   registration with the stored setting and from the set handler. The watcher's clock is this tick,
   not a renderer interval, so a minimized main window cannot delay the alert.
6. New src/main/alertRespawnSeed.ts, modelled on alertBazaarSeed.ts: id 'respawn-soon', name
   'Respawn timer ending', enabled, trigger `{ type: 'app', signal: 'respawnSoon' }`, sound
   DEFAULT_ALERT_SOUNDS.buffWearsOff, audio 'speech', speech custom with the shared phrase,
   bannerText the shared banner, `cooldownMs: 0`, a one-line note. `withRespawnAlert` and
   `seedRespawnAlertOnce` stamp `alertRespawnSeed`, so a player who deletes it keeps it deleted.
   src/main/store.ts: wrap both returns of getAlerts and resetAlerts with it, beside the Bazaar seed
   (one import line; store.ts is near its ceiling).
7. Renderer: new src/renderer/src/features/timers/useRespawnAlert.ts (the useBazaarWatch pattern:
   module-scope copy, useSyncExternalStore, write-through). New RespawnAlertControl.tsx: a small
   checkbox 'Alert before respawn' and a seconds field, with the tooltip 'Fires the Alerts tab's
   Respawn timer ending alert for every watched mob.' Add it to the header Stack in TimersView.tsx
   (lines 475-489). New RespawnAlertWatcher.tsx: renders nothing; mounts its reader only while the
   setting is on; the reader holds the latest `useModule('respawn')` snapshot in a ref, subscribes
   to `onRespawnAlertTick`, keeps `prevMs` and a map of fired keys in refs, and calls
   `fireAppSignal('respawnSoon', context, captures)` for each result not yet fired. Mount it in
   src/renderer/src/components/AppCelebrations.tsx beside UnreleasedBazaarWatcher. The filtering
   stays in src/shared (lint rule eqc/no-domain-munging).
8. Before: a timer reaching zero is silent. After: with the box ticked, 20 s before a tracked mob's
   timer ends the app says 'Enynti in 20 seconds' (and shows the banner line if the banner overlay
   is open); the Alerts tab row 'Respawn timer ending' changes the voice, swaps it for a sound, or
   turns it off. With the box unticked nothing fires and nothing ticks.
9. Edge cases to keep: an estimate that changes mid-countdown cannot fire twice for one clock (the
   fired map); a confirmed sighting re-bases the clock and may alert again for the new base; a
   respawn shorter than the lead never alerts; after a sleep or a long gap, clocks already due are
   skipped; toggling the setting on starts from a baseline.
10. Docs on the work branch: new docs/community/requirements/respawn-alert.md with the reporter's
    row, a fork #7 row in docs/community/ISSUES.md, and a short BRANCH_NOTES.md bullet (the cooldown
    0, the main-process tick and why, the literal-token rule).

### Tests

- tests/respawnAlert.test.mts (new), setting: `normalizeRespawnAlert` gives off and 20 s for nothing
  or garbage, clamps the lead to 5..300, keeps a valid pair.
- tests/respawnAlert.test.mts, timing: `respawnAlertsDue` returns a clock exactly when its lead
  moment falls in (prevMs, nowMs]; returns nothing on the first look (prevMs null); nothing for a
  row seen up, a row with no estimate, a row in another zone, a dungeon-crawl row, or a clock
  already due after a long gap; a second call with the same window returns the same key so the
  caller's fired map dedupes it.
- tests/respawnAlert.test.mts, places: a clock in another tier of the same zone is returned with its
  place in `place` and spelled out in `text`; the clock where you stand has the plain 'Mob in N
  seconds' text.
- tests/respawnAlert.test.mts, tokens: the captures' keys equal `APP_SIGNAL_CAPTURES.respawnSoon`;
  `captureNamesIn({ type: 'app', signal: 'respawnSoon' })` lists them; `tokensIn` of the two default
  phrases is a subset; `applyCaptures` leaves no brace in either phrase (the
  tests/bazaarWatch.test.mts:147-151 precedent).

### Risks and limits

- The timer throttling of a minimized main window was reasoned, not measured; the main-process tick
  removes the dependency, but the first manual check should be the alert firing on time with the
  main window minimized for ten minutes.
- The seeded alert appears in every player's Alerts list, enabled; it stays silent until the Timers
  box is ticked. Its default is speech, which needs a working voice; a player can switch it to a
  sound.
- With many tracked mobs across several tiers of one zone, alerts can come close together. Cooldown
  0 lets each be heard; the Alerts tab row is the one place to quiet them.
- The alert is only as good as the timer's estimate: a mob held to a wrong wiki time (fork #8)
  alerts for the wrong moment until that fix ships.
- The seed module imports Electron-side sound code, so the seed itself has no unit test (the Bazaar
  seed has none either); the phrases live in src/shared so the token test still covers them.
- store.ts is close to its 440-line ceiling; the wiring must stay at one import and wrapped calls.

### The three first passes, checked

sonnet: 'no respawn alert exists' held. 'Reuse earlyWarnSec semantics' refuted: that offset is
engine-evaluated against buff timer rows and fireAppSignal ignores it. 'Fire from respawnTiers.ts'
is half right: that module supplies the clocks, a renderer watcher fires.
haiku: 'no respawn alert, no lead time anywhere' held; 'renderer-side only' held. 'Mind the
origin:app echo rule' needs no work: the player already skips its own echo.
opus: 'no alert, callers only AppCelebrations and BazaarWatcher' held; the BazaarWatcher-style
watcher held. 'A per-watch checkbox kept on the watch next to sharedName' does not work as written:
the engine drops unknown watch fields, so the flag would not return in the snapshot without a Rust
change.
None of the three noticed the 2 s default cooldown that would swallow a second mob's alert, that an
empty token is spoken literally, or the minimized-window timer question.

### Reply draft (posted only on the owner's word)

> Good idea, and it's going in. The Timers tab will get an 'Alert before respawn' box with a seconds field (20 by default, yours to change). When a tracked mob's timer gets that close, the app will say the mob's name, for example 'Enynti in 20 seconds'.
>
> It runs through the normal Alerts tab, so you can change the voice, swap it for a sound, or add an on-screen line there. I'll post here when a build has it.

## Phase 4: Stuck at Reading log... ([fork #9](https://github.com/kaltinril/everquest-companion/issues/9))

- Verdict: fix. Size M. TypeScript only. Work branch: `log-read-report`. Requirements:
  `requirements/fix-combat-reading-log.md`.
- On trunk today: Yes. Every way of sitting on "Reading log..." forever listed below is on trunk
  (ea201f2d8). The build current on 2026-11-09 was test.44 (2026-11-08); test.45 to test.51
  followed. No commit after 2026-11-06 touches src/main/dataServer, the engine's ingest, combatFeed
  or the hydrating panels except Combat-tab display work, so no build after the report fixed any of
  them.
- The change: Main records each failure on the log-loading path that is only a console line today,
  and stops waiting when the engine reports the read has ended. After 15 s (or at once for a dead
  read) the Overview and Combat "Reading log..." panels show a small box: what the app is waiting
  on, the log's file name and size, how far the read got, the engine's state, the last error and the
  app version. TypeScript only: no engine, protocol, network or dependency change.

### What is true

WHAT ENDS "Reading log...". The Overview and Combat panels draw it while `snap?.hydrating ?? true`
(OverviewView.tsx:129, CombatView.tsx:360). Main answers `combat:snapshot` with an empty snapshot
carrying hydrating:true whenever the engine cannot serve (ipc/world.ts:72-98). The engine can serve
only when all four hold (engineClientHost.ts:862-870): a client exists, its connection is ready, the
engine is attached to the app's log, and a `session.health` poll has said `live`. That last flag is
set only inside the fold-wait loop (engineClientHost.ts:705-716, foldWait.ts:127-166).

WHAT THE PLAYER ALREADY SEES (all three reviewers missed this). The main window has a band under the
title bar (EngineLaunchBanner.tsx:62-67): during a read it says "Catching up on your log 62% 148.8
MB of 238.4 MB, N events, about 40s left"; after three fast failed engine launches it shows a card
("EQ Companion cannot find its data engine", "The data engine started but never answered", and so
on, shared/engineLaunch.ts:354-395). The panels and overlays themselves only ever say the bare
"Reading log...". The band draws nothing in phase `starting`, nothing in `folding` before the first
measurement, and nothing for any failure that is not an engine launch failure.

WAYS IT LASTS FOREVER (none fixed after 2026-11-09):
1. The log read dies and main never notices. The engine answers `session.attach` with accepted:true
before it opens the file (world.rs:1287-1351). If the file cannot be opened (ingest.rs:905), a read
fails mid-scan (ingest.rs:941), or the fold panics (ingest.rs:811-830), the engine prints one stderr
line and sets status `idle` (world.rs:1478-1490). Main's wait loop exits only on `live`
(foldWait.ts:157), so it polls an idle engine every 400 ms for the rest of the session. Screen: no
band (unopenable file) or a frozen bar (mid-scan error or panic), and "Reading log..." forever. A
panic on one line of a player's log repeats at every launch, which fits "for the past couple of
days" beginning with test.42/43 (2026-11-07), the build that hand-rewrote the parser and fold. This
is a hypothesis; it cannot be proven without the reporter's log.
2. Main's one connection to the engine is never retried. A failed connect is logged and dropped
(engineClientHost.ts:310-315); a refused hello or a socket error sets the client to `failed`
(shared/dataServer/client.ts:279-288); nothing reconnects while the supervisor's own probe (a fresh
connection each time) keeps passing. Readiness is `notConnected` until the app restarts.
3. A latent race: the connect result is discarded when a world rebuild lands during the connect
(engineClientHost.ts:316-319 tests `gen`, which every rebuild bumps; the comments at 327-331 name
that same mistake for the listeners). The client then never gets a transport, queued requests each
time out at 15 s, and readiness stays `notConnected`. Low probability, never observed.
4. `session.attach` refused or timed out (15 s, shared/dataServer/deadline.ts:31): `sendAttach`
returns null and nothing retries (engineClientHost.ts:568, 626-629). Readiness `notAttached`, phase
`starting`, nothing drawn.
5. Three `session.health` refusals in a row end the wait silently (foldWait.ts:137-142). If the
supervisor's probe still passes there is no respawn; readiness `notLive` forever, bar frozen.
6. Respawn loop with no card. An engine that reached READY and then dies or fails two health probes
(5 s each, every 30 s, supervisorHealth.ts) is replaced and the whole log is read again from byte
zero. The failure trail resets on READY and on any launch that lived 30 s or more
(supervisor.ts:602-605, engineProtocol.ts:549-551), so the card never appears: the bar restarts from
0% each time. The engine runs at below-normal priority, so a busy CPU plus a large log makes this
more likely.
7. Engine launch failures (binary missing, spawn refused, 10 s announce timeout, bad announce, quick
exit) do get a card, but only at the third fast failure; until then nothing is drawn, and the panels
under the card still say only "Reading log...".
8. After go-live, a combat read that times out (2 s, serveShim.ts:101) or is refused returns the
empty hydrating shape. Since test.29 a world that already has a real answer keeps it with an
Updating badge (combatFeed.ts:62-74), but a world with no real answer yet shows "Reading log..." for
as long as reads fail. A rejected IPC is swallowed in the renderer (combatFeed.ts:92).

WHERE THE REASONS GO TODAY. All engine-client narration, including the engine's own stderr ("the
ingest of X ended: ...", "PANICKED"), goes through `logInfo`, which is console only
(errorLog.ts:359-361, engineHost.ts:462). In a packaged build nobody can read it. Only supervisor
launch failures reach errors.log (engineHost.ts:467), and unserved reads are tallied once a minute
to userData/slow-reads.log (slowReads.ts).

A HUGE LOG. The engine reads the whole file from byte zero in 1 MiB slices at every launch,
character switch and engine respawn (ingest.rs:934-972); there is no checkpoint. Measured rates in
the repo: 68 MB in 4 s since test.43, 12 s before (communityReleaseNotes.ts:385); about 5.4 MB/s on
an older measurement (shared/logArchive/preflight.ts:6-7). Several hundred MB is therefore roughly
30 s to a few minutes, longer on a slow PC. Nothing in main times out on a long read: the 120 s
budget was removed on 2026-08-26 (foldWait.ts header) and is in every fork build. Meanwhile the main
window shows the progress band, every tab is empty, overlays say "Reading log..." with no bar. A
huge log alone is slow, not stuck; it becomes stuck only through way 6 or way 1. Log archiving
(keeps the log under 100 MB) is off by default and cannot run until the engine is live
(preflight.ts:35), so a stuck player cannot use it.

STATE FOR THE REPORT. The renderer already has: `EngineLaunchSay` (phase, fold
offset/logSize/events/pct, fault) via `useEngineLaunch`, and `window.eq.getAppVersion()`
(preload/index.ts:593). Main already knows but does not publish: supervisor status
(engineHost.ts:161), client connection state, the readiness reason, the last health status, the log
path, the engine's stderr lines (supervisor.ts:458-465). No engine or protocol change is needed:
`session.health` already carries status/mark/events and progress frames carry offset and logSize.

The issue text contains no instruction addressed to an AI.

### Steps

1. New src/shared/logReadReport.ts (pure; imports only humanBytes and humanDuration from
   ./engineLaunch). Declare `LogReadStep = 'connect'|'attach'|'health'|'fold'`; `LogReadWait =
   'noCharacter'|'engineMissing'|'engineFailing'|'engineStarting'|'notConnected'|'attachRefused'|'logMissing'|'logUnreadable'|'readerStopped'|'stalled'|'notAnswering'|'reading'|'ok'`;
   `LogReadFacts` (now, appVersion, logPath, home, supervisor status string, fault {kind, attempts,
   detail}|null, connection string|null, readiness 'ok'|reason string, health {status, at}|null,
   fold {offset, logSize, events, pct}|null, movedAt, waitingSince, error {step, detail, at,
   said[]}|null, probe {bytes, problem 'missing'|'unreadable'|null}|null, lastCombatRead {unserved,
   at}|null); `LogReadReport` (wait, show, appVersion, logFile base name, logBytes, offset, pct,
   events, engine words, lastError, engineSaid up to 4 lines, waitedMs). Constants LOG_READ_SLOW_MS
   = 15_000 and LOG_READ_STALL_MS = 60_000.
2. Same file: `composeLogReadReport(facts)`. Decide `wait` in this order, split into two helpers to
   stay under complexity 13: no logPath -> noCharacter; supervisor 'absent' or fault no-binary ->
   engineMissing; any other fault -> engineFailing; supervisor not 'ready' -> engineStarting;
   connection not 'ready' -> notConnected; error.step 'attach' -> attachRefused; error.step 'fold'
   or health.status 'idle' -> logMissing / logUnreadable (from probe.problem) else readerStopped;
   error.step 'health' -> notAnswering; health 'folding' with movedAt older than LOG_READ_STALL_MS
   -> stalled; readiness not ok -> reading; readiness ok with lastCombatRead.unserved ->
   notAnswering; else ok. `show` = wait is one of engineMissing, engineFailing, attachRefused,
   logMissing, logUnreadable, readerStopped, stalled, or (wait is not ok/noCharacter and waitedMs >=
   LOG_READ_SLOW_MS). logBytes = fold.logSize ?? probe.bytes. Every string that came from outside
   (error.detail, said lines, fault.detail) goes through `scrubPaths`.
3. Same file: `scrubPaths(text, logPath, home)`: replace the full log path (both slash spellings,
   case-insensitive) with its base name, the home directory with `~`, and any remaining
   `<drive>:\Users\<name>` or `/Users/<name>` prefix with `~`. Then `LOG_READ_WORDS:
   Record<LogReadWait, string>` and `logReadLines(report)` returning label/value pairs. Screen text:
   reading "Still reading your log."; engineStarting "Starting the data engine."; engineMissing "The
   data engine program is missing."; engineFailing "The data engine keeps failing to start.";
   notConnected "The app cannot connect to its data engine."; attachRefused "The data engine refused
   the log file."; logMissing "The log file is missing."; logUnreadable "Windows will not let the
   app read the log file."; readerStopped "The data engine stopped before the end of your log.";
   stalled "The data engine has stopped making progress."; notAnswering "The data engine is not
   answering."; ok "The data engine is answering; this panel has no reply yet." Rows: "Waiting on",
   "Log" (`eqlog_Name_server.txt, 412.3 MB`), "Read so far" (`148.8 MB (36%), 1,571,003 events`,
   omitted when unmeasured), "Engine" (`running, connected, reading`), "Last error" (text or
   `none`), "Waiting" (humanDuration), "Version". Unknowns are omitted, never printed as 0.
4. New src/main/dataServer/logReadState.ts (leaf, no Electron import, module-level state like
   engineLaunchState.ts). Exports: `noteEngineSaid(line)` (ring of the last 8 lines);
   `noteLogReadConnection(at)` (new engine launch: clears everything except the ring);
   `noteLogReadTurn(at)` (sets waitingSince, clears health, movedAt and any error whose step is not
   'connect'); `noteLogReadError(step, detail, at)` (stores the error with a copy of the last 4 ring
   lines); `noteLogReadHealth(status, offset, at)` (stores status; sets movedAt when offset grew; on
   'live' clears the error); `noteCombatRead(unserved, at)`; `logReadFacts()`.
5. src/main/dataServer/supervisor.ts: add optional dep `onEngineSaid?(line: string): void` to
   EngineSupervisorDeps and call it in the stderr reader in `wire` right after `l.lastStderr =
   boundedDetail(safe)` when that value is not null (the line is already token-redacted and capped
   at 200 chars). About 3 code lines; the file is at about 394 of 440.
   src/main/dataServer/engineHost.ts `startEngineSupervisor`: pass `onEngineSaid: noteEngineSaid`.
6. src/main/dataServer/foldWait.ts: add optional `readonly failed?: (why: 'ended' | 'unanswered',
   detail: string) => void` to FoldWaitDeps. In `waitForFold`, after `deps.saw(health)` and the
   `live` return, add: when `health.status === 'idle'`, note "the engine stopped reading the log
   before the end; this turn stops asking", call `deps.failed?.('ended', 'the engine reports idle
   after an accepted attach')` and return null. In the refusal-limit branch call
   `deps.failed?.('unanswered', describeErr(err))` before returning null. Before: an idle engine is
   polled forever. After: the wait ends and the reason is recorded. A folding engine is still never
   given up on.
7. src/main/dataServer/engineClientHost.ts: (a) `bumpGen` calls `noteLogReadTurn(Date.now())`; (b)
   `onEngineReady` with a non-null info calls `noteLogReadConnection(Date.now())`; (c) the catch in
   `openConnection` calls `noteLogReadError('connect', describeErr(err), Date.now())`; (d) the catch
   in `sendAttach` calls `noteLogReadError('attach', ...)`; (e) `sawHealth` first line calls
   `noteLogReadHealth(health.status, health.mark?.offset, Date.now())`; (f) `waitForFoldHere` passes
   `failed: (why, detail) => { if (why === 'ended') l.attachedTo = null; noteLogReadError(why ===
   'ended' ? 'fold' : 'health', detail, Date.now()) }` so a later world rebuild of the same log
   attaches again instead of trusting a dead attach; (g) new export `engineClientFacts(): {
   connection: ConnectionState | null; readiness: string; logSize: number | null }` reading `live`,
   `engineServeReadiness()` and `lastFoldLogSize`. No retry timers and no change to the generation
   rules in this change.
8. src/main/dataServer/serveShim.ts `readShim()`: keep the slow-read recorder in a local and pass
   `observe: (op, ms, unserved) => { record(op, ms, unserved); if (op === 'combat.snapshot')
   noteCombatRead(unserved ?? null, Date.now()) }`.
9. New src/main/logReadReport.ts: `buildLogReadReport(): Promise<LogReadReport>` gathers
   `getActiveCharacter()?.logPath`, `app.getVersion()`, `os.homedir()`, `engineSupervisorStatus()`,
   `engineLaunchSay()` (fault and fold), `engineClientFacts()`, `logReadFacts()`, and calls
   `composeLogReadReport`. It probes the file itself only when the read has ended or no size is
   known: `probeLog(path)` opens read-only with fs/promises, stats, closes; ENOENT -> 'missing', any
   other error -> 'unreadable'. The full path never crosses IPC. src/shared/ipc.ts: add
   `logReadReport: 'engine:logReadReport'`. src/main/ipc/engine.ts `registerEngineLaunchIpc`:
   `ipcMain.handle(IPC.logReadReport, () => buildLogReadReport())`. src/preload/engine.ts:
   `logReadReport: (): Promise<LogReadReport> => ipcRenderer.invoke(IPC.logReadReport)`, plus the
   window.eq typing wherever engineLaunchState is declared.
10. Renderer. New src/renderer/src/lib/logReadReportHud.ts: `useLogReadReport()` asks
    `window.eq.logReadReport()` 5 s after mount and every 3 s after that while mounted, keeps the
    last answer on a rejected call, and returns `{ report, mountedMs }`. New
    src/renderer/src/components/LogReadReport.tsx: renders nothing until `report.show` or `mountedMs
    >= LOG_READ_SLOW_MS`; then a compact outlined box (data-testid `log-read-report`) with the rows
    from `logReadLines(report)`, up to 4 monospace "Engine said" lines when present, and one
    caption: "Stuck here? Post a screenshot of this box on your report." Only `.map` for drawing; no
    filter or sort in the renderer. Mount `<LogReadReport />` between the spinner row and the
    skeletons in `HydratingPanel` (CombatView.tsx:64-72) and `OverviewHydrating`
    (OverviewView.tsx:102-110). Overlays are unchanged.
11. Docs: add the 2026-11-19 row to docs/community/requirements/fix-combat-reading-log.md (owner on
    fork#9: error checking on log loading and an on-screen report a player can screenshot), and a
    short trap note in docs/community/agent/BRANCH_NOTES.md under this fix: the engine says `idle`
    when a read dies, engine narration is console only, the report carries the log's base name only.

### Tests

- tests/logReadReport.test.mts (new): one case per LogReadWait proving the decision order (a
  no-binary fault wins over everything; idle plus probe 'missing' is logMissing; idle with a
  readable file is readerStopped; folding with a stale movedAt is stalled; readiness ok with an
  unserved combat read is notAnswering). `show` is false for a healthy read under 15 s and true at
  15 s, and true at once for a dead read. `scrubPaths` removes the Windows user name in backslash,
  forward-slash and mixed-case spellings and leaves only the log's base name. `logReadLines` omits
  Read so far when nothing was measured and never prints 0 B. Fixtures are literal fact objects;
  nothing is pinned to wiki data.
- tests/logReadState.test.mts (new): the stderr ring holds the last 8 lines; an error snapshots the
  last 4; a new turn clears attach, health and fold errors but keeps a connect error; a new
  connection clears all; a `live` health answer clears the error; movedAt advances only when the
  offset grows.
- tests/dataServerFoldWait.test.mts (extend): an engine that answers `idle` ends the wait with null,
  calls failed('ended', ...) once and is asked no more; three refusals call failed('unanswered',
  ...); the existing case that a folding engine is never given up on still passes.
- tests/dataServerSupervisor.test.mts (extend, with the existing fakes): a stderr line reaches
  onEngineSaid token-redacted and bounded, and a supervisor built without the dep behaves as before.

### Risks and limits

- The report shows the log's file name, which contains the character and server name; it is the base
  name only, and nothing is sent anywhere, but a posted screenshot will show it.
- Main opens the log itself for the missing/unreadable check. Upstream's ruling 21 says the engine
  owns log-file facts; this is a diagnostic on the failure path only, and the fork's autoArchive.ts
  already stats the same file.
- Stopping the wait on `idle` is safe only because `idle` after an accepted attach always means the
  read ended (world.rs sets `starting` inside the attach itself). The foldWait test must pin that a
  `starting`, `attaching` or `folding` answer never ends the wait.
- The stall rule (no progress for 60 s while folding) could show on a very slow disk or during the
  landing of a very large log; it only changes the sentence, nothing is killed.
- e2e specs that look at combat-hydrating or overview-hydrating are unaffected for the first 5 s; a
  spec that deliberately holds the engine in a fold longer than 15 s will now also find the
  log-read-report box.
- Not in this change, and the report will show whether they matter: main's connection to the engine
  is never retried (engineClientHost.ts:310-315), the gen guard at engineClientHost.ts:316-319 can
  discard a good connection during a world rebuild, a refused attach is never retried, and an engine
  that dies after serving is re-launched forever with no card. Each is a small follow-up once a
  screenshot says which one players hit.
- The existing failure card can show the Windows user name in "It last said" for a spawn failure
  (the binary path); the new box scrubs it, the old card is unchanged.

### The three first passes, checked

sonnet: Held: emptyCombat fallback, slow-reads.log, test.44 current on the report date, nothing
after the report fixes it, archive at 100 MB off by default, fault cards exist, a restarted engine
re-reads the whole log. Refuted: the "3 s grace" (trunk combatFeed.ts has no timer; it keeps the
last real answer indefinitely); "needs a fold-progress figure from the engine" (already published
and already drawn by the launch band, which the review missed); size S (main must carry the state,
so M). Missed the idle-forever path.

haiku: Held: placeholder locations, fold at every launch, launch-failure headlines, build dates, no
engine change needed. Refuted: "S, text plus a timestamp in the placeholder components" (the
renderer does not know the reason; a new main-to-renderer read is needed); "launch failures are not
the bare placeholder" (the card is only in the top band, only after the third fast failure, and the
panels still say the bare text); the citation "ISSUES.md:8-9 Malkil case" is wrong (that row is
requirements/fix-combat-reading-log.md:9; ISSUES.md is the upstream ledger). Missed the band and the
idle-forever path.

opus: Held: `snap?.hydrating ?? true`, emptyCombat for every unserved read, the seven fallback
reasons, reasons never shown to the player, build dates, no later fix. Its unchecked suspicion that
a fold on an unreadable log never goes live is confirmed (ingest.rs:905, foldWait.ts:157). Adjusted:
`notAttached` in practice means no successful attach, not two different files; carrying the
FallbackReason in the empty snapshot would widen CombatSnapshot and still miss `snap === null` and
the engine's own words, so the plan uses a separate read. Missed the band.

### Reply draft (posted only on the owner's word)

> Thanks for the report, and sorry it has been stuck for you.
>
> "Reading log..." stays up until the app has read your whole EverQuest log from the start. A few different things can keep it there: a very large log file, the part of the app that reads the log not starting (antivirus is the usual cause), or the log file not being readable. Right now the screen does not say which one it is, so the next test build adds a small box under "Reading log..." that says what the app is waiting on: the log's size, how far it has read, the state of the reader, the last error and the app version. Once you have that build, a screenshot of that box will tell us exactly what is happening.
>
> Until then, these would help:
> 1. Which version you are on (Preferences shows it).
> 2. Whether the top of the main window shows a bar saying "Catching up on your log" with a percentage, or a message about the "data engine".
> 3. The size of your eqlog_<character>_<server>.txt file in the EverQuest Logs folder.
> 4. Whether other tabs such as Loot show anything.
>
> One thing to try if that log file is very large (hundreds of MB): close EverQuest and the app, move the eqlog file out of the Logs folder to somewhere safe, start the game, type /log on, and start the app again. If that clears it, turning on Preferences > Game > "Summarize and archive log" keeps the log small from then on.

## Phase 5: Left menu is too spacious ([fork #10](https://github.com/kaltinril/everquest-companion/issues/10))

- Verdict: fix. Size M. TypeScript only. Work branch: `menu-size`. Requirements:
  `requirements/sidebar-groups.md`.
- On trunk today: Yes. NavDrawer.tsx on main_community still draws every destination row as an
  unstyled MUI ListItemButton (48px), and no menu-only size or spacing setting exists.
- The change: Give the left menu its own text size and row height, stored like the drawer's fold
  state and shown as two steppers in Preferences > Appearance. Defaults become 14px text in 32px
  rows, down from 16px in 48px, so the whole menu fits the default window without scrolling.

### What is true

Numbers are computed from the installed MUI 7.3.11 sources and the repo's sx values at 100% zoom;
nothing was measured in a running app.

TODAY
- Destination row: 48px tall. That is 8+8 button padding, 4+4 ListItemText margin and one 24px line
(body1 16px x 1.5). Icon is 24px in a 56px column; side gutters are 16px.
- Gap between rows: 0px margin. The air is inside the row: 12px above and 12px below each 24px
label, so half of every row is empty.
- Group heading: 28px min height plus 4px top margin, so a 32px slot; 11px uppercase text, 20px
chevron. Already compact.
- Gap between groups: only that 4px heading margin.
- List padding: 8px top and 8px bottom.
- Contents: 18 destination rows in the scrolling list (Overview, Stats/Data 6, Research 9, Config 2)
under 3 headings. Pinned at the bottom: a divider, a two-line disabled 'Send feedback' row (72px,
the tallest row in the drawer), Preferences (48px) and the version/update line (about 30px). The
owner-only Triage row is dev opt-in only.
- Total content with all groups open: 976px list + about 151px bottom block = about 1127px.
- Room available is window height minus the 40px title bar:
- Default window 1280x860: 820px, so it overflows by about 307px and scrolls.
- 1080p maximised at 100% Windows scale (48px taskbar): 992px, overflows by about 135px, so yes, it
scrolls at 1080p.
- 1080p at 125% display scale: 776px, overflows by about 351px.
- Minimum window 900x600: 560px.
- The drawer paper has overflow-y auto, so it scrolls rather than clips.

EXISTING SETTINGS THAT TOUCH IT
- Preferences > Appearance > In-app text size is a whole-window zoom (90/100/110/125/150%). It
scales the drawer with everything else; at 90% a row is still 43px. It is not a density control.
- Each group folds by clicking its heading (localStorage key eq.nav.open.<id>).
- There is no app-wide spacing setting and no theme override for List components. The 'app-wide font
and spacing' the owner refers to is the one zoom ladder.

HOW THE APP-WIDE SETTING IS BUILT
- A ladder, normaliser and step function in src/shared/uiScale.ts.
- Stored in main's settings store over two IPC channels, applied as the window zoomFactor.
- Shown as a PrefStepper (minus, value, plus) in TextSizeSetting.tsx, with a shared SIZE_WORDS
keyword string for the Preferences search.
- The IPC half exists only because main owns the window zoom. The drawer's own state (the folds) and
Preferences > Combat already use the localStorage subscription in useCombatPrefs.ts, which is
synchronous on first paint and live between the Preferences card and the drawer in the same window.
That is the right store for menu-only prefs.

No text in the issue or the code I read was an instruction addressed to an AI.

### Steps

1. Choices and defaults. Text size ladder 12/13/14/15/16 px, default 14 (16 is today's size). Row
   height ladder 28/32/36/40/48 px, default 32 (48 is today's height). Values are shown as '14px'
   and '32px'. Totals with all groups open: 28 -> about 717px, 32 -> about 793px, 36 -> about 869px,
   40 -> about 945px, 48 -> about 1103px. Default 32 is the tallest step that fits the default
   1280x860 window (820px); 28 fits 1080p at 125% display scale (776px); 48 scrolls as today.
2. New src/shared/navMenu.ts, zero-import like shared/uiScale.ts. Export NAV_TEXT_STEPS,
   NAV_TEXT_DEFAULT = 14, NAV_ROW_STEPS, NAV_ROW_DEFAULT = 32, NAV_TEXT_KEY = 'eq.nav.textPx',
   NAV_ROW_KEY = 'eq.nav.rowPx'. Export readNavStep(raw: string | null, steps, dflt): number
   (absent, non-numeric or non-finite gives the default; otherwise snap to the nearest stop, ties to
   the smaller, as normalizeUiScale does), stepNavStep(steps, cur, dir: 1 | -1): number (ends are
   fixed points), navPx(n): string, and navMenuMetrics(textPx, rowPx) returning { textPx, rowPx,
   iconPx: Math.round(textPx * 1.5), iconCol: iconPx + 16 }.
3. New src/renderer/src/components/useNavMenu.ts. useNavStep(key, steps, dflt): [number, (dir: 1 |
   -1) => void] built on useRawPref from features/combat/useCombatPrefs.ts: the value is
   readNavStep(raw, steps, dflt), and the stepper writes String(stepNavStep(...)). useNavMenu()
   returns navMenuMetrics of the two values. No IPC, no store field, no hydration-gate entry.
4. src/renderer/src/components/NavDrawer.tsx. Call useNavMenu() in NavDrawer and add four CSS
   variables to the existing '& .MuiDrawer-paper' sx block: '--nav-row', '--nav-text', '--nav-icon',
   '--nav-icon-col', each as `${n}px`. Add three module constants: NAV_ROW_SX = { minHeight:
   'var(--nav-row)', py: 0 }, NAV_ICON_SX = { minWidth: 'var(--nav-icon-col)', '& .MuiSvgIcon-root':
   { fontSize: 'var(--nav-icon)' } }, NAV_TEXT_SX = { my: 0, '& .MuiListItemText-primary': {
   fontSize: 'var(--nav-text)', lineHeight: 1.3 } }. Apply them in NavRowButton to the
   ListItemButton, ListItemIcon and ListItemText. This covers Overview, every group row, Triage and
   Preferences with no prop drilling.
5. Same file, the 'Send feedback' row: apply the same three constants, with py 0.5 on the button and
   the secondary line at 12px / line-height 1.3, so the two-line row is about 42px instead of 72px.
   Keep its text, disabled state and aria-label. Leave GROUP_HEADING_SX, the List padding,
   DRAWER_WIDTH, every testid and the GROUPS table untouched.
6. src/renderer/src/features/preferences/PrefStepper.tsx. Add 'spacing' to StepperKind and one WORDS
   entry: { less: '−', more: '+', lessName: 'Shorter rows for', moreName: 'Taller rows for' }. The
   existing `lettered` test already gives non-size kinds the plain − / + faces. Keep the four
   existing names (tests/overlayIndependent.test.mts:244 pins them).
7. New src/renderer/src/features/preferences/NavMenuSetting.tsx. A bare Stack with two labelled
   rows, each a body2 label with flexGrow and a PrefStepper on the right (copy the shape of
   StepperRow in OverlaysAppearanceSetting.tsx:206-232; do not import it). Row 'Text size': kind
   'size', value navPx(text), name 'the left menu', testid 'pref-nav-text'. Row 'Row height': kind
   'spacing', value navPx(row), name 'the left menu', testid 'pref-nav-row'. atMin/atMax compare
   against the ladder ends. One caption below: 'This sizes the left menu only; the text size above
   still scales it.' Export navMenuItem(sizeWords: string): PrefItem with id 'nav-menu', label 'Left
   menu', keywords `${sizeWords} menu sidebar side bar left nav navigation drawer tabs rows row
   spacing spacious gap gaps compact dense density tight height padding`. Import PrefItem as a type
   only.
8. src/renderer/src/features/preferences/TextSizeSetting.tsx. Import navMenuItem and add the single
   line `navMenuItem(SIZE_WORDS),` to appearanceSection's items between 'ui-scale' and
   'overlays-appearance' (the app's own parts first, then the floating windows). Passing SIZE_WORDS
   in keeps it private and avoids an import cycle. Touch the 'TWO ITEMS' comment only as far as it
   is now wrong.
9. Tests: see the tests list. tests/uiScale.test.mts:249-251 must be amended in the same change,
   because its 'exactly two items' message is no longer true.
10. Docs in the same branch: a row in docs/community/requirements/sidebar-groups.md (2026-11-10
    ziplock9000 fork#10, 'left menu too spacious'; 2026-11-19 owner, 'menu-only text size and
    spacing preferences, tighter default row height'); a fork#10 row in docs/community/ISSUES.md;
    one line under 'Sidebar groups' in docs/community/agent/BRANCH_NOTES.md saying row metrics come
    from shared/navMenu.ts through CSS variables on the drawer paper and headings stay fixed.
11. Usability bounds to confirm when it runs: at the smallest setting a row is 28px by 220px (the
    height the group headings already use, above the 24px WCAG 2.2 minimum target). At the largest
    text with the shortest rows the 20.8px line sits inside the 28px row, and minHeight (never
    height) means a row grows instead of clipping. The widest label ('Achievements', about 104px at
    16px) fits the roughly 148px text column even with the 12px scrollbar showing.

### Tests

- tests/navMenu.test.mts (new, node:test). readNavStep: null, '', 'abc', 'NaN' and 'Infinity' give
  the default; an on-ladder string returns itself; an off-ladder value snaps to the nearest stop
  with ties to the smaller; values beyond either end clamp to that end. stepNavStep: one rung each
  way, fixed at both ends, off-ladder input snapped first. Each default is a member of its own
  ladder and each ladder ascends. navMenuMetrics: for every text/row pair, rowPx >= iconPx and rowPx
  >= textPx * 1.3 (nothing can outgrow the shortest row). navPx formats '14px'.
- tests/navMenu.test.mts source pins, in the style of tests/uiScale.test.mts:215-238.
  NavMenuSetting.tsx uses <PrefStepper, steps through stepNavStep via the hook and never adds an
  increment of its own. NavDrawer.tsx sets '--nav-row' and '--nav-text' and still declares
  GROUP_HEADING_SX with minHeight 28. PrefStepper.tsx contains 'Shorter rows for' and 'Taller rows
  for'.
- tests/uiScale.test.mts:249-251. Keep the count of inline items at 2, reword the message to say two
  inline items plus the left menu's, and add assert.match(card, /navMenuItem\(SIZE_WORDS\)/) so the
  third item is pinned and not hidden from the regex.
- tests/e2e/text-size.e2e.mts, one added step while the Appearance pane is open. Read
  getBoundingClientRect().height of [data-testid="nav-combat"] and expect 32 at the default. Press
  pref-nav-row-minus and expect 28 with the minus button disabled. Press plus to the end and expect
  48 with plus disabled. Press pref-nav-text-plus to the end and check that no nav-* row has
  scrollWidth > clientWidth and every label's box lies inside its row's box. Step both back to the
  defaults before the spec's relaunch steps.
- Existing e2e that would notice, to re-run on the gate (not edited). tests/e2e/overview.e2e.mts
  step 12b (:461-517) probes the Preferences row's box and clicks it; step 12 (:430-446) reads nav
  order. tests/e2e/overlaysAppearanceSteps.mts:199-224 (run by text-size.e2e.mts) checks the
  Appearance section's shape. tests/e2e/prefs-first-paint.e2e.mts watches Appearance controls on
  first paint. Every spec that clicks nav-* rows (about 75 files, for example telemetry.e2e.mts:368,
  which clicks each view, plus gear, maps, leveling, spells-area and deep-link-back) depends on rows
  staying clickable. No spec asserts a row height or the drawer's scroll height today.

### Risks and limits

- tests/uiScale.test.mts:249-251 counts object literals in appearanceSection by regex. An inline
  third item fails it; the factory call keeps the count but the assertion text must still be
  corrected.
- Every existing install sees the menu shrink on update, because an absent key reads as the new
  default. That is the owner's direction. The old look is four presses away (text 16px, rows 48px)
  and matches today except for a narrower icon column (40px against 56px).
- The two values live in renderer localStorage, like the group folds and the Combat preferences.
  They are lost if that storage is cleared and are not in the settings export; the app-wide text
  size is not in shared/profiles.ts either.
- The window zoom multiplies these values. At 90% zoom with 28px rows a row is about 25 device
  pixels, still above the 24px minimum but the tightest case.
- At 125% Windows display scaling on a 1080p screen the 32px default still overflows by about 17px
  (a short scroll); 28px fits.
- The CSS-variable styling relies on the nested selectors outranking MUI's single-class rules (the
  icon size and the two-line row's 6px margins). The added e2e step is what proves the rendered
  heights; the pixel figures here are computed from MUI's sources.
- overview.e2e.mts step 12b hovers the update line and probes the Preferences row directly above it.
  The rows get shorter but keep their order and full width; re-run it.

### The three first passes, checked

sonnet: Held: rows are unstyled ListItemButtons, the theme has no list overrides, heading metrics,
the zoom scales the drawer proportionally. Refuted: 'about 40px' rows (48px: it left out
ListItemText's 4px margins), dense 'about 32px' (36px), and 'nav test ids appear only in artifact
html files' (about 75 e2e files use nav-* ids).

haiku: Held: the structure, groups and absence of a density setting. Refuted: 40px/32px from memory
(48/36), 'no spacing measurement found' (overview.e2e.mts:461-517 measures the Preferences row), and
a setting being 'L-ish' (M with the localStorage pattern). Its 'text size does not change row
spacing' is half right: the zoom scales spacing too, it just is not a density control.

opus: Held on every number I checked: 48px rows, 36px dense, 6/9/2 rows, 18 rows and 3 headings,
864+96px, the two-line feedback row, the fold pref, the zoom ladder. Not adopted: moving the
feedback row's second line to a tooltip (a disabled row draws no tooltip, NavDrawer.tsx:369-370).

All three proposed a fixed `dense` change; the owner's direction (two menu-only preferences plus
tighter defaults) supersedes that.

### Reply draft (posted only on the owner's word)

> Thanks for the report, and you're right. Each row in the left menu is 48px tall for a single 24px line of text, so with every group open the menu is about 1,130px tall and has to scroll even on a 1080p screen.
>
> We're changing two things. The default gets tighter: smaller text and shorter rows, so the whole menu fits the default window without scrolling. And Preferences > Appearance gets two new settings for the left menu only, a text size and a row height, separate from the app-wide text size, so you can go more compact still or put it back the way it was.
>
> Until that build is out, clicking a group heading (Stats/Data, Research, Config) folds that group and the app remembers it.

## Phase 6: Tradeskill tracking ([fork #6](https://github.com/kaltinril/everquest-companion/issues/6))

- Verdict: fix. Size M. Touches the engine (Rust). Work branch: `skills-tab`. Requirements:
  `requirements/skills-tab.md`.
- On trunk today: Yes. main_community (ea201f2d8) has no skills or tradeskill view and no engine
  module that keeps skill levels; the skill-up event is parsed and then used only for class-combo
  evidence, the offline-gap anchor and the Wiki Gaps combine pairing.
- The change: Add a Skills tab: one row per skill the log has seen go up, with its current level,
  raises this session, raises per hour and when it last went up, fed by a small new engine module
  `skills` and joined across archived logs. No parser, protocol or wiki-data change.

### What is true

WHAT EXISTS
- The engine parser already types the line `You have become better at <Skill>! (<n>)` as
Kind::SkillUp with `skill` (client spelling) and `value`
(engine/crates/eqlog/src/parse/who.rs:38,87-100; event.rs:93). No parser change is needed.
- Three consumers only: combo evidence (fold/src/modules/combo/evidence.rs:277-282), the
first-person list for offline gaps (fold/src/session.rs:65) and Wiki Gaps, which pairs a tradeskill
tick with a combine of the same second (fold/src/modules/gaps.rs:227, gaps_craft.rs:72-90). Nothing
keeps a level per skill.
- TypeScript cannot see skill-ups at all. The app-side fold was deleted (src/shared/ipc.ts:13-18);
src/shared/logEvents.ts:1169-1175 is a type only; the renderer gets engine module snapshots through
the generic `module:getSnapshot` / `useModule<T>(id)` path (src/main/ipc/world.ts:88-93,
src/renderer/src/lib/useModule.ts:121). So a TypeScript-only build is not possible: the right place
is a small new engine fold module.
- A new engine module needs NO protocol change. Module ids do not appear in protocol/schema/*.json;
`buffConflicts` (commit c98ae2657) was added with lib.rs +2 lines, mod.rs +1, one .rs file, one
shared .ts, one view, and docs/community/BRANCHES.md:149 records 'no parser kind and no protocol
change'. Engine tests iterate WIRING_ORDER generically (engined/tests/module_snapshot.rs:244-270)
and ignore unlisted ids (fold/tests/announce.rs:67-98).
- History: the live log only reaches back to the last archive cut (owner's live log: 2026-10-25
onward). Archived months are joined per module through MERGE_RULES
(src/shared/logArchive/mergeRules.ts:31-51) for modules in CAPTURED_MODULES
(src/shared/logArchive/modules.ts:8-31); a sealed archive that lacks a module the engine serves is
refolded automatically (src/main/logArchive/actions.ts:153-197). So a `skills` module with a merge
rule gets the archived months without new plumbing.
- Leveling's per-hour numbers come from the engine `leveling` and `progression` modules plus the
shared timeslice / rate-basis code (fold/src/modules/leveling.rs, src/shared/timeslice.ts,
src/shared/rateBasis.ts). That machinery needs per-event rows and active-time spans; it is not
needed for a first slice.

MEASURED TODAY (read-only script outside the repo, owner's logs)
- Archive 2026-08-12 to 2026-10-06: 5,071 skill-up lines, 61 distinct skills, every line carries the
value. Live log 2026-10-25 to 2026-11-19: 195 lines, 11 skills.
- A line can repeat the level it already stated: `Specialize Evocation! (50)` printed 37 times in 7
minutes (live log lines 286520-286873). A level can also go down between lines (Specialize Evocation
200 in the archive, 50 later; Forage 52 then 50). So 'lines' are not 'points gained', and the
current level is the newest stated value, not the maximum.
- Combines (archive): 606 successes (`You have fashioned the items together to create something new:
X.`), 130 failures (`You lacked the skills to fashion X.`). A tradeskill tick lands in the same
second for only 160 successes and 55 failures, so the log names the tradeskill for under a third of
combines. The game also prints `You can no longer advance your skill from making this item.` (60
lines) just before a trivial success; nothing in the repo reads that line.
- Feign Death: a successful feign prints nothing and there is no attempt line. The log holds only
`<You> has fallen to the ground.` (28 in the archive, 5 live; in context the mobs keep swinging,
which fits the classic failure message) and `You are no longer feigning death, because a spell hit
you.` A success RATE cannot be computed.
- Fishing (live log): `You cast your line.` 131, `You caught X!` 64, `You didn't catch anything.`
62, `You lost your bait!` 4, `You spill your beer while bringing in your line.` 16, `Your fishing
pole broke!` 2. Forage: `You have scrounged up X.` 526 live / 159 archive, `You fail to locate any
food nearby.` 568 / 357. Outcome rates are derivable.
- Recipe data IS committed: src/main/data/items.json has 2,497 items with `craftedBy` (tradeskill,
ingredients with sources, container), 1,960 of them with a numeric `trivial`, and 2,077 `recipes`
rows on ingredient items (1,184 with trivial). Types at src/shared/types.ts:604-640. Wiki spellings
are folded by src/shared/tradeskills.ts (which already maps the client's 'Jewelry Making', 'Make
Poison', 'Research').
- `/outputfile recipes` is named by the game's usage line but no sample has ever been read
(src/shared/outputs/kinds.ts:47-50); the house law is that no dump format is guessed
(kinds.ts:21-28). The achievements dump does carry tradeskill milestones (`Baking (50)` ... `(300)`,
`Fishing (100)` complete in the owner's file) and 'maximum skill in X' rows.

SLICES AND SIZES
1. Current levels + raises this session + per hour, every skill (tradeskills and Taunt/Sneak/etc.
alike, since the stream is one): log gives everything; parser exists; needs one small engine module,
shared types, a merge rule, a view. Size M. No protocol change, no parser change, no wiki data.
2. Combines, successes, failures per tradeskill: lines exist and gaps_craft.rs already recognises
the three shapes, but the tradeskill must come from items.json for the two thirds of combines with
no tick. Size M.
3. Recipes for advancement: data is committed (not a wiki-data blocker); needs a recipe index in
main, an IPC call and a panel. Size M to L.
4. Non-tradeskill skills: free with slice 1.
5. Feign success rate: not derivable (failures only). A failure count is possible; a rate is not.
6. Fishing and forage outcome counts: derivable; S to M on top of slice 1.
7. `/outputfile recipes`: blocked on a real sample file. Achievements-based floor for skills the log
never saw: S to M later.

RECOMMENDED FIRST SLICE: slice 1 (which includes 4). It is M, needs no data the app lacks and no
owner ruling, so it is planned below. No text in the issue is addressed to an AI; the two
spreadsheet links were not opened.

### Steps

1. ENGINE: New file engine/crates/fold/src/modules/skills.rs, modelled on buff_conflicts.rs.
   `SkillRow { skill: String, value: i64, last_ts: i64, session_ups: i64, session_first_ts:
   Option<i64> }` with `#[serde(rename_all = "camelCase")]` and `skip_serializing_if =
   "Option::is_none"` on session_first_ts. `SkillsModule { rows: Vec<SkillRow>, seq: i64, announce:
   crate::announce::Announce }` with `new()`.
2. ENGINE: In skills.rs, `fn raised(&mut self, skill: &str, value: i64, ts: i64) -> bool`: find the
   row by exact client spelling (linear `position`, there are at most about 70 rows); if the stored
   value equals `value` return false and change nothing (the repeated-at-cap line); otherwise set
   value and last_ts, add 1 to session_ups, set session_first_ts when it was None; a new skill
   pushes a row with session_ups 1. A lower value replaces the level like any other (measured:
   levels drop).
3. ENGINE: In skills.rs, `fn end_session(&mut self) -> bool`: set session_ups to 0 and
   session_first_ts to None on every row; true when any row changed.
4. ENGINE: `impl EqModule for SkillsModule`: id() "skills"; reset() clears rows, seq, announce;
   on_event sets `self.seq = ev.seq()` then matches `ev.kind_of()`: Kind::Epoch clears the rows
   (announce when non-empty); Kind::OfflineGap calls end_session (announce when true) so 'this
   session' is the app's Session (timeslice.ts:29-37); Kind::SkillUp reads `ev.str("skill")` and
   `ev.int("value")`, ignores a line with no value, and announces when raised() is true.
   published_seq() returns the announce cursor; snapshot() is `json!({ "seq": self.seq, "state": {
   "rows": self.rows } })`.
5. ENGINE: engine/crates/fold/src/modules/mod.rs: add `pub mod skills;`.
   engine/crates/fold/src/lib.rs: add "skills" to WIRING_ORDER right after "leveling" and
   `r.register(Box::new(modules::skills::SkillsModule::new()));` right after the leveling
   registration in `registered` (same relative order). Check the factoring register for lib.rs with
   the repo's tool; never hand-edit engine/factoring-baseline.json.
6. SHARED: New src/shared/skills.ts: `SKILLS_MODULE = 'skills'`; `SkillRow { skill; value; lastTs;
   sessionUps; sessionFirstTs? }`; `SkillsSnap { rows: SkillRow[] }`; `isTradeskillRow(row)` =
   `tradeskillOf(row.skill) !== undefined` (src/shared/tradeskills.ts); `skillRatePerHour(row):
   number | null` = null unless sessionUps >= 2 and `rateMeasurable(lastTs - sessionFirstTs)`
   (src/shared/rateBasis.ts), else `(sessionUps - 1) / ((lastTs - sessionFirstTs) / 3_600_000)`;
   `skillRows(rows, tradeskillsOnly): SkillRow[]` = filtered copy sorted by lastTs descending then
   skill name (the sort and filter live here because of eqc/no-domain-munging).
7. SHARED: New src/shared/logArchive/mergeSkills.ts: `mergeSkills(older, newer): SkillsSnap | null`.
   Null unless both are `{ rows: [...] }` whose rows have a string `skill`. Result `{ ...newer, rows
   }`: every newer row as it is, then each older row whose skill the newer side lacks, with
   sessionUps 0 and sessionFirstTs dropped (an older log's session is over). Register `skills:
   mergeSkills` in MERGE_RULES (mergeRules.ts) and add 'skills' to CAPTURED_MODULES (modules.ts)
   after 'leveling'. The empty template `{ rows: [] }` that mergeModule builds must pass the shape
   test.
8. RENDERER: src/renderer/src/lib/formatRate.ts: add `formatSkillRate(n)` returning
   `${formatSmall(n)}/hr` (the file is the one home for rate text).
9. RENDERER: New src/renderer/src/features/skills/SkillsView.tsx (about 110 lines, BuffConflicts.tsx
   is the model): `useModule<SkillsSnap>(SKILLS_MODULE)`; a 'Tradeskills only' switch kept with
   `useBoolPref('eq.skills.tradeskills', false)` (features/combat/useCombatPrefs.ts:126); a
   sticky-header table from `skillRows(...)` with columns Skill, Level, This session (`+N`, blank at
   0), Per hour (`formatSkillRate` or an em dash), Last raised (`formatDateTime`). Header tooltips,
   one sentence each: Level 'The newest level your log stated for this skill.'; Per hour 'Raises per
   hour between this session's first and latest raise of the skill.' Caption under the title:
   'Skills appear here once the log shows them going up.' Empty state: 'No skill has gone up in this
   character's log yet.' data-testid `skills-view` and `skill-row`.
10. RENDERER: Register the tab the way commit 87cfecf95 did: src/renderer/src/appViews.ts add `|
    'skills'` to View (comment: fork #6, not yet in TELEMETRY_VIEWS), `skills: 'Skills'` to
    VIEW_LABELS, 'skills' to KNOWN_VIEWS; src/renderer/src/components/NavDrawer.tsx add `{ view:
    'skills', icon: <HandymanIcon /> }` after the leveling row of the 'stats' group (BRANCH_NOTES
    'Sidebar groups': a new tab is placed in a group in the same change); src/renderer/src/App.tsx
    import SkillsView and add `{view === 'skills' && <SkillsView key={viewKey} />}`;
    tests/telemetryContract.test.mts add 'skills' to NOT_YET_REPORTED.
11. BEHAVIOUR. Before: skill-ups are read and thrown away; no screen shows a skill level. After:
    Stats/Data > Skills lists every skill that has gone up in the log or its archived months, newest
    raise first; a skill being worked shows `+N` and a per-hour pace once two raises are five
    minutes apart. The module stores about 70 small rows; nothing is written to disk beyond the
    archive segments that already hold every module.
12. EDGE CASES to keep: a line repeating the stored level is not a raise and does not announce; a
    lower level replaces the stored one; a value-less line is ignored; an epoch (same-name rebirth)
    clears the table; a login after a 60 s absence zeroes the session columns only; a skill that
    never went up in the log is not listed (the caption says so); a session that spans an archive
    cut counts only the raises in the live log.
13. DOCS (same branch). New docs/community/requirements/skills-tab.md with the reporter's asks as
    rows (levels: built; per hour: built; all skills: built; combines, recipes, fishing/forage,
    feign, /outputfile recipes: open with the facts above). docs/community/ISSUES.md row for fork
    #6. docs/community/agent/BRANCH_NOTES.md heading 'Skills tab (fork #6)' with the module shape
    and the two traps (repeat-at-cap, level can drop). docs/community/agent/MEASURED.md: the
    skill-up repeat and drop, the trivial-notice line, feign prints failure only, the fishing and
    forage outcome lines. The 'What's new' line goes in src/shared/communityReleaseNotes.ts at
    release time. Do not touch AGENTS.md or src/shared/releaseNotes.ts.

### Tests

- engine/crates/fold/src/modules/skills.rs in-file #[cfg(test)] (JSON events as in buff_conflicts.rs
  tests): a first skill-up files the skill at its level with sessionUps 1; a second raises it and
  keeps the first session stamp; a line repeating the stored level changes nothing and leaves
  published_seq where it was; a lower level replaces the stored one; an offlineGap zeroes the
  session columns and keeps the level; an epoch empties the rows; a skillUp with no value is
  ignored; the real parser hands `You have become better at Fishing! (127)` over as Kind::SkillUp
  with value 127 (the gaps_craft.rs test pattern). Run with cargo on its own, not beside the unit
  suite.
- tests/skills.test.mts (node:test, inline rows, no wiki data): skillRows puts the newest raise
  first and breaks ties by name; the tradeskill filter keeps the client spellings 'Jewelry Making',
  'Make Poison', 'Research' and 'Fishing' and drops 'Kick' and 'Specialize Evocation';
  skillRatePerHour is null with one raise, null when the span is under RATE_MIN_MS, and (ups - 1)
  per hour otherwise (for example 7 raises over 2 hours is 3).
- tests/mergeSkills.test.mts: a skill in both sides takes the newer row whole; an older-only skill
  is kept with sessionUps 0 and no sessionFirstTs; a non-skills shape gives null;
  `mergeModule('skills', [archived], live)` returns used = 1 (proves the `{ rows: [] }` template
  passes); `hasMergeRule('skills')` and `CAPTURED_MODULES.includes('skills')`.
- tests/telemetryContract.test.mts: existing test, passes once 'skills' is in NOT_YET_REPORTED (it
  fails without it, which is the tripwire working).

### Risks and limits

- It needs a Rust engine build and `cargo test --workspace` (long, on a shared machine; run it
  alone, WORKFLOW.md:137,172). The module is about 100 lines and touches no parser or protocol code.
- lib.rs gains two lines and is a recorded file in engine/factoring-baseline.json; if it is at its
  ceiling the fix is a real split, never a hand edit of the baseline (WORKFLOW.md:157-160,330).
- Adding 'skills' to CAPTURED_MODULES marks every sealed archive as lacking a module, so each is
  refolded once automatically (a 250 MB log took 55 s, refold.ts). A version update does that
  anyway; a dev run pays it once.
- Levels are only known for skills that went up inside the log and its kept archives. A skill maxed
  before the log began, or archives kept without their source log, will not show. The caption must
  say this or players will read the table as complete.
- Session columns reset on the engine's offline gap (a login after 60 s away), and a session that
  spans an archive cut counts only the live log's raises.
- The per-hour number is a pace between raises of that one skill, not the Leveling tab's
  elapsed/active hour. If the owner wants the slice bar instead, the module must publish one row per
  raise (about 60 bytes each, several thousand for the owner) rather than one per skill.
- A new view id reports no telemetry until the ingest schema is widened (owner-sequenced, as for
  every tab since Achievements).
- No e2e was planned; the nav gains a row, so any e2e that counts Stats/Data rows should be checked
  by grep before the gate.

### The three first passes, checked

sonnet: HELD - no tracker exists; SkillUpEvent shape; gaps_craft and combo are the consumers; the
renderer has no skillUp reader; an engine module is needed. REFUTED - 'plus protocol frame' (modules
are served generically by id, no schema entry); 'no recipe data' (items.json holds 2,497 crafted
items, 1,960 with trivial); size L (the first slice is M). Its unchecked points are now settled:
combine and failure lines exist and are recognised in gaps_craft.rs; feign has no success line.
haiku: HELD - parser locations (who.rs:38, event.rs:93), no skills feature folder or nav row, value
is a level not a tick count (confirmed: every line carries the level). REFUTED - 'TypeScript only'
and touches_engine=false (the renderer never receives skill-up events; the TS fold is deleted,
ipc.ts:13-18); 'recipe data not committed'.
opus: HELD - items.json carries craftedBy and recipes with trivial (measured); combine
success/failure shapes are recognised in gaps_craft.rs; leveling is an engine module merged in the
renderer; a new fold module is the right shape; size M. REFUTED - 'a protocol addition (a new module
frame)' (none needed, buffConflicts precedent); 'Gaps only' consumer (combo evidence and session.rs
also read it, which its own summary half says). PARTLY - 'combines paired the way gaps_craft.rs
pairs them': that pairing names the tradeskill for only 160 of 606 successes and 55 of 130 failures,
so combine counts per tradeskill need items.json too and are their own slice, not part of slice one.

### Reply draft (posted only on the owner's word)

> Thanks for this, it is a good list. I looked at what the game log actually gives us:
>
> - Skill levels: every "You have become better at X! (n)" line carries the new level, for tradeskills and for everything else (Taunt, Sneak, Fishing and so on). So a Skills tab is coming first: each skill the log has seen go up, its current level, how many times it went up this session, a per-hour pace, and when it last went up. A skill that has not gone up while logging will not show, since the log never states it.
> - Combines, successes and failures: the log has those lines too. That is the next piece after the levels table.
> - Recipes for advancement: the wiki data the app ships already has trivial levels for most crafted items, so a "what can I make to skill up" list is possible without your spreadsheets. Later piece.
> - Fishing and foraging: successes and failures are in the log, so those can be counted.
> - Feign Death: the game only prints a line when a feign fails, nothing on success, so a success rate cannot be worked out.
> - /outputfile recipes: I have never seen one of those files. If you can attach one (any tradeskill), I can see whether it is usable for "recipes you know".

## Phase 7: Separate graph line for you and pet ([upstream #91](https://github.com/jmoyers/everquest-companion/issues/91))

- Verdict: fix. Size S. TypeScript only. Work branch: `chart-pet-line`. Requirements:
  `requirements/meter-pet-split.md`.
- On trunk today: Yes (main_community at ea201f2d8). No setting or legend click gives a line for you
  alone. A pet-alone line already exists. The chart ignores the pet layout preference entirely.
- The change: When the pet layout is 'Its own bar', the chart's gold line leaves the pet out
  (labelled 'you'), so you and your pet are two separate lines on both the Combat tab and the
  Overview card. The other two layouts draw exactly what they draw today.

### What is true

ONE chart draws damage over time: DpsOverTime (src/renderer/src/features/combat/DpsOverTime.tsx).
Two surfaces render it: (a) the Combat tab's dashboard cell (DpsChartCard, full card with legend)
and (b) the Overview tab's DpsCurveCard (compact: no legend, and it ignores the hidden-line set).
Nothing else is a rate curve: the Overview DpsCard is meter rows, the floating overlay has no SVG at
all, and CombatTimeline is an event-lane chart whose hover only prints rates sampled from the same
series ('you + pet', 'pet', 'incoming').

Series drawn, identical under all three pet layouts (nested / separate / grouped), because the chart
never reads the layout (usePetLayout is called only by meterBars.tsx, DpsCard.tsx, SegmentPanel.tsx
and CombatSection.tsx):
- 'out' (gold, with area fill, peak stat and hover dot): you + pet + group per bucket, labelled 'you
+ pet' or 'you + pet + group'.
- 'pet' (blue): your pet alone, only when the fight had pet damage.
- 'group' (green): member + allyPet + other, only when present.
- 'inc' (red): incoming, only when present.

The data for a you-alone line is already in the renderer: buildDpsSeries fills series.you from
events of kind 'you' and smooths it like the other bands, for every fight including estimated ones.
It is only ever used inside the sum.

The one existing control is the legend (Combat tab only): clicking an entry hides that line, stored
as a hidden set in eq.combat.chartHidden, where an absent key means draw everything. Hiding can only
subtract, so the reporter's description is accurate: a player can reach 'pet alone' (hide the gold
line) but never 'you alone'. Verdict is therefore not already-done.

Fix direction: make the gold line follow the existing pet layout. With 'Its own bar' (separate) the
gold line leaves the pet out (label 'you', or 'you + group'), the blue line stays the pet alone.
'Inside your bar' (default) and 'With its owner' stay exactly as today, the same predicate the
Overview DpsCard already uses (layout !== 'separate' means combined). No new storage key, no fifth
line, no protocol or engine change. Because yMax, peak, the drawn line, the area and the hover dot
all go through one function (outAt), one optional flag on the renderer-only DpsSeries moves all of
them together.

### Steps

1. src/renderer/src/features/combat/dashboardData.ts, interface DpsSeries: add one optional field
   `petApart?: boolean` with a one-line comment (the gold line leaves the pet out; set by the card
   from the pet layout, never by buildDpsSeries). Optional on purpose: the four test fixtures that
   build DpsSeries literals stay valid, and the per-timeline cache (DpsOverTime.tsx SERIES WeakMap)
   stays layout-free. buildDpsSeries and peakOut are not touched.
2. src/renderer/src/features/combat/dpsAt.ts: add three pure exports. (1) `outRate(series, i)` =
   you[i] + (series.petApart ? 0 : pet[i]) + group[i]. (2) `outLabel(series)` = 'you' + (' + pet'
   unless petApart) + (' + group' when hasGroup), giving 'you + pet', 'you + pet + group', 'you',
   'you + group'. (3) `withPetApart(series, apart)` returning the SAME object when apart is false
   and `{ ...series, petApart: true }` (typed arrays shared) when true. Change dpsAt() to `out:
   outRate(series, i)` and fix the DpsPoint.out comment.
3. src/renderer/src/features/combat/dpsChart.ts: import outRate from './dpsAt' (a relative value
   import; dpsAt has only a type import, so the node tests still load it) and make outAt (line 229)
   return outRate(series, i). Nothing else changes: yMax, peakVis, outLine, outArea, outAtVertex and
   curveYAtUserX all already go through outAt. Adjust the outLine doc comment (lines 51-54) by one
   clause. buildDpsChart keeps its three parameters.
4. src/renderer/src/features/combat/DpsOverTime.tsx, function DpsOverTime (line 414): add `const
   petApart = usePetLayout()[0] === 'separate'` (import usePetLayout beside useHiddenChartLines),
   and change the series memo to `tl ? withPetApart(keptSeries(tl, live), petApart) : null` with
   deps [tl, live, petApart]. With the default layout the memo returns the cached object itself, so
   nothing re-derives.
5. Same file, ChartLegend (line 304): replace the inline label with `outLabel(series)`. Same file,
   ChartHeaderStats (line 91): when series.petApart, the tooltip reads `Peak ${n}s rolling rate
   without your pet, in the visible window.`; otherwise the existing sentence. Update the Legend
   `id` comment at line 337 only if it no longer reads true.
6. src/renderer/src/features/combat/DpsCurveHoverLayer.tsx, dpsRows (line 91): replace the local
   label expression with outLabel(series) (rename the local to avoid shadowing the import). The
   value already comes from dpsAt().out, which now follows the flag. No signature change.
7. src/renderer/src/features/preferences/CombatSection.tsx: append one sentence to
   LAYOUT_HINT.separate: 'The DPS chart draws you and your pet as two lines.' and add 'chart graph
   line' to the 'combine-pet' keywords so Preferences search finds it.
8. Leave alone on purpose: CombatTimeline.tsx and TimelineHoverLayer.tsx (the timeline hover keeps
   its truthful 'you + pet' sum and 'pet' rows from its own unflagged series), combatPrefs.ts (no
   new key, no new line key), PetLayoutPreview, petRows.ts, the overlay, the engine and the
   protocol.
9. Tests: extend tests/dpsChartLines.test.mts, tests/dpsChartHover.test.mts and
   tests/timelineHitTest.test.mts as listed under tests.
10. Bookkeeping in the same branch: add the request row to
    docs/community/requirements/meter-pet-split.md (2026-11-02, ziplock9000 via upstream #91, the
    ask, status built) and a row for #91 in docs/community/ISSUES.md.

### Tests

- tests/dpsChartLines.test.mts (extend, using the existing YOU/PET/GROUP/INC fixture): with `{
  ...mkSeries(), petApart: true }` the outLine's Y values equal yAt(yMax, you + group) per bucket,
  petLine/groupLine/incLine point strings are byte-identical to the unflagged chart when the scale
  is unchanged, peakVis equals max(you + group), and t0/t1/i0/count do not move.
- tests/dpsChartLines.test.mts: a fixture where the pet out-damages you (e.g. you 100, pet 400, no
  group) under petApart: yMax is the pet's peak, the pet line reaches PAD_T, the gold line sits
  below it; then with 'pet' hidden yMax drops to your own peak.
- tests/dpsChartLines.test.mts: `petApart: false` and an absent flag both deep-equal today's chart
  (the default layout draws exactly what it drew), and hiding 'out' under petApart still nulls
  outLine and outArea.
- tests/dpsChartLines.test.mts or timelineHitTest.test.mts: outLabel gives 'you + pet', 'you + pet +
  group', 'you', 'you + group' for the four flag/hasGroup combinations; withPetApart(series, false)
  returns the same object, withPetApart(series, true) returns a copy whose you/pet/group/inc are the
  same array instances.
- tests/dpsChartHover.test.mts: under petApart, curveYAtUserX at each drawn vertex equals the
  outLine's own Y (the hover dot rides the you line, not the old sum).
- tests/timelineHitTest.test.mts (dpsAt block, line 132 on): dpsAt on a petApart series returns out
  = you + group with pet unchanged; the existing unflagged assertions stay as they are.

### Risks and limits

- Players already on 'Its own bar' (including anyone whose old eq.combat.petRow switch was off) see
  the gold line, its peak figure and the Y scale drop to their own damage on upgrade. That is the
  point of the change, but it is a visible change they did not ask for.
- The owner's 2026-10-21 ruling froze the damage meters until tester feedback
  (requirements/meter-pet-split.md:20). This plan touches no meter row and not the Overview meter
  card, only the DPS-over-time chart, and the owner has changed the Combat tab's meters himself
  since (2026-11-17), but the chart also sits on the Overview tab.
- In a grouped fight the gold line under 'Its own bar' is 'you + group', not you strictly alone: the
  group band stays in the headline as it is today. Taking the group out as well is a larger change
  than the issue asks for.
- The Combat timeline's hover keeps printing the 'you + pet' sum while the chart's gold line says
  'you'. Both labels are truthful, but the two surfaces no longer headline the same number under
  that layout.
- The Overview card has no legend, so under 'Its own bar' only the hover tooltip names the gold line
  as 'you'.
- With the pet line hidden in the legend and the layout on 'Its own bar', the pet's damage is on no
  line at all; the struck-through 'pet' entry is the only sign.

### The three first passes, checked

sonnet: HELD - four lines and no you line, series.you exists but is never drawn alone, legend hide
state persists, pet layouts are a meter-row setting that the chart ignores, compact card ignores the
hidden set, the 2026-10-21 ruling is worth raising. REFUTED - 'add a you line, default hidden so
nothing changes' as size S: the store is a hidden set where an absent key means draw everything
(combatPrefs.ts:257-261, pinned by tests/combatPrefs.test.mts:293-303), so default-hidden needs a
second mechanism, and the Overview card ignores the set and would always draw the fifth line. Peak
stat would not need to know a new line.

haiku: HELD - line keys, pet line gated by hasPet, hiding out/group leaves the pet alone, no
you-alone line. REFUTED - 'add a you series in buildDpsSeries': series.you is already there
(dashboardData.ts:260, 308, 342). Line numbers a few off (DPS_LINE_KEYS is at :232, the key at
:228).

opus: HELD - both surfaces share DpsOverTime, hide-only toggles cannot produce a you line because
'out' is a sum, series.you is filled for every fight (checked: smoothing and scale apply to all
bands). Cited :28 and :18 are the import lines; the renders are CombatDashboard.tsx:57 and
DpsCurveCard.tsx:26. REFUTED - 'the player gets you and pet by hiding out': true on the Combat tab
only (Overview has no legend and ignores hiding), and hiding out also removes the area fill, the
peak stat and the hover dot (DpsOverTime.tsx:90, 133; DpsCurveHoverLayer.tsx:140). Same
default-hidden objection as sonnet.

All three: no engine or protocol change, correct. None checked that the chart could follow the
existing pet layout, which needs no new line, no new key and changes nothing for the default layout.

### Reply draft (posted only on the owner's word)

> Thanks for the suggestion. You read it right: the chart draws a 'you + pet' line and a 'pet' line, and there was no way to get a line for you alone.
>
> In the community fork (kaltinril/everquest-companion) we are tying this to the existing pet setting. With Preferences > Combat > "Where your pet's damage shows" set to "Its own bar", the gold line on the DPS chart will be you alone and the blue line your pet alone, on both the Combat tab and the Overview card. The other pet settings keep the combined line.
>
> Until that build is out, one thing that already works on the Combat tab: click an entry in the legend under the chart to hide that line, which can leave just the pet line showing.

## Phase 8: Hand-set quantity on Sky Cleanup ([upstream #73](https://github.com/jmoyers/everquest-companion/issues/73))

- Verdict: fix. Size S. TypeScript only. Work branch: `cleanup-pencil`. Requirements:
  `requirements/sky-cleanup-count.md`.
- On trunk today: Yes. The Cleanup row shows the held count as plain text with no control
  (CleanupList.tsx:146-148), and CleanupList receives neither the override setter nor the override
  list (CleanupListProps, :74-81; mount at PoskyView.tsx:392-399). The hand-set count exists only on
  the quest row's Have cell.
- The change: Put the quest row's pencil on the Cleanup row's Held cell: same editor, same chip,
  same store call. Typing 0 removes the row through the existing held-count rule, and the tab shows
  the "counts set by hand" chip so the statement stays visible.

### What is true

1. Why the row stays. Under the default source "Both" only credited Sky turn-ins and logged destroys
subtract (reconcile.ts:586-598). A trade the log does not tie to a Sky quest is not subtracted, and
the dump never subtracts under Both, so the Cleanup row keeps the item. (Any completed hand-over is
subtracted only under the opt-in 'handins' source: useProgress.ts:375-377, reconcile.ts:882.)
2. The hand-set count already exists and already feeds Cleanup. ItemHaveCell
(ItemOverrides.tsx:149-193) draws the pencil, the inline CountEditor (:68-108) and the "By hand: N"
OverrideChip (:50-64) on the quest row; it calls onSetItemCount(name, count|null). PoskyView.tsx:577
wires that to useProgress.setItemOverride, which writes
window.eq.setItemOverride(itemCountKey(name), name, count) (useProgress.ts:644-646) into the main
store (src/main/storeItemOverrides.ts:39-51, shared/itemOverrides.ts:114-127). In reconcile the
statement wins over every count source: `if (w.override) return Math.max(0, w.override.base -
w.override.consumed)` (reconcile.ts:587), base = stated + loot since - destroys since (:664-677).
That net is ItemProgress.held (useProgress.ts:213-224, 705-711), and the Cleanup model reads exactly
that number (cleanup.ts:249-253).
3. An override of 0 takes the row off Cleanup today, if set from the quest row: cleanup.ts:220-225
`const quantity = held[key] ?? 0 ... if (quantity <= 0) continue`. The tab's count drops with it,
because the tab label uses the same function (PoskyView.tsx:560). Loot after the statement adds on
top, so the row returns when the item is farmed again; a turn-in or destroy after it subtracts.
4. What is missing is only the door. A Cleanup row is by rule an item whose quests are all turned in
(cleanup.ts:226-228), the quest row a player is least likely to have open. CleanupRow carries no
override (cleanup.ts:116-127) but its `key` is the counting key the override is written against
(:117-118), and PoskyBody already holds both pieces the tab needs: x.itemOverrides
(PoskyView.tsx:377) and rows.setItemCount (:577).
5. Reuse. The row name is the quest data's spelling with +N stripped (cleanup.ts:175);
itemCountKey(normalizeItemName(x)) equals itemCountKey(x) (src/renderer/src/lib/itemName.ts:23-31),
so writing with row.name lands on row.key. itemOverridesByKey already exists in shared
(itemOverrides.ts:130-136). No store, IPC, shared, engine or protocol change.
6. Undo after a 0. The row is gone, so its chip is gone. The take-back is the "By hand: 0" chip on
the quest row (ItemOverrides.tsx:175-177). The "N counts set by hand" summary chip names every
stated item on hover, but it is drawn only on the Quests tab's counts line (PoskyView.tsx:75-78,
468-475), not on Cleanup.
7. Tests today. Overrides: tests/skyItemOverrides.test.mts (sanitizer, windowed folds, reconcile
with a statement, incl. a stated 0 at :231-252; the file says it is at its max-lines ceiling,
:31-34) and tests/e2e/sky-item-override.e2e.mts (the pencil live on the quest row). Cleanup: only
tests/e2e/sky-cleanup.e2e.mts. The unit test cleanup.ts:15 names, tests/skyCleanup.test.mts, no
longer exists: it was deleted in b6ff987bb (JOS-499 test prune, 2026-08-25) because it imported the
deleted TS parser and LootModule; its case 5 was "an override zeroing the count - the row leaves the
list". So nothing on trunk pins cleanupRows without a browser.
8. The ruling. Owner 2026-09-28: "not ours to build", on the grounds that the count logic is the
creator's design to change (the original repo's #73 row in ISSUES.md). This change touches no count logic: it adds a second door
to a statement the app already honours. The ledger already notes the ruling predates the fork taking
the project over (this repo's #2 row in ISSUES.md), the owner asked today whether recent upstream issues can be fixed
in the fork, and the request that started this run says the fork has broken away from the original.
CleanupList.tsx:17-25 (JOS-401) removed a destroy button because the log states destroys; it keeps
the pencil as "the escape hatch for what the log genuinely cannot see - a trade", which is this
case. No instruction addressed to an AI in the issue text.

### Steps

1. src/renderer/src/features/posky/ItemOverrides.tsx: lift the body of ItemHaveCell (:157-192: the
   editing/text state, commit, the CountEditor branch, the Stack with OverrideChip and the pencil
   IconButton) into an exported `HandCountCell({ name, held, override, onSetItemCount, children })`.
   `children` is drawn first in the Stack (the number), then the chip when `override &&
   onSetItemCount`, then the pencil. Keep every testid, the title, the prefill `String(held)` and
   the commit rule (blank commits nothing; n >= 0, floored) exactly as they are. No new screen text.
2. Same file: ItemHaveCell becomes a thin wrapper: `<HandCountCell name={it.name} held={it.held}
   override={it.override} onSetItemCount={onSetItemCount}>` with the existing `{it.have}/{it.need}`
   Typography and the DumpBlindNote condition as children. DOM order on the quest row is unchanged
   (number, note, chip, pencil), so tests/e2e/sky-item-override.e2e.mts needs no edit. Add one line
   to the header's WHERE IT LIVES paragraph: the Cleanup row's Held cell too.
3. src/renderer/src/features/posky/CleanupList.tsx: add to CleanupListProps `itemOverrides: readonly
   ItemCountOverride[]` and `setItemCount: (name: string, count: number | null) => Promise<void>`.
   In CleanupList: `const overrides = useMemo(() => itemOverridesByKey(itemOverrides),
   [itemOverrides])` (shared/itemOverrides.ts:130) and `const onSetItemCount =
   useCallback<SetItemCount>((name, count) => { void setItemCount(name, count) }, [setItemCount])`
   (QuestList.tsx:174-179's pattern).
4. Same file, CleanupItemRow: take `override?: ItemCountOverride` and `onSetItemCount:
   SetItemCount`; pass `override={overrides[row.key]}` from the map. In the existing
   `posky-cleanup-qty` TableCell replace the bare `x{row.quantity}` with `<HandCountCell
   name={row.name} held={row.quantity} override={override}
   onSetItemCount={onSetItemCount}><span>x{row.quantity}</span></HandCountCell>`. Keep `data-count`
   on the TableRow as is (the e2e reads it).
5. Same file: in the control Stack (:198-205) draw `<OverrideSummaryChip overrides={itemOverrides}
   />` before the flex spacer, so a row zeroed by hand leaves a visible trace on this tab (it also
   shows above the empty state). Its hover already says where the take-back is. Update the header
   comment at :23-25 in one line: the row now carries the same pencil.
6. src/renderer/src/features/posky/PoskyView.tsx, PoskyBody cleanup branch (:392-399): add
   `itemOverrides={x.itemOverrides}` and `setItemCount={rows.setItemCount}`. No new prop on
   PoskyBodyProps; both are already there.
7. No change to cleanup.ts, shared/itemOverrides.ts, storeItemOverrides.ts, IPC, engine or protocol.
   Behaviour after: 0 -> row leaves, tab count drops, summary chip shows; N > 0 -> row reads xN with
   a "By hand: N" chip whose delete restores the witnesses; blank or Escape -> nothing; later loot
   adds, later turn-ins and destroys subtract; the statement wins under all five count sources.
8. Add tests/skyCleanupOverride.test.mts (step in tests). Extend tests/e2e/sky-cleanup.e2e.mts with
   one step between the reward-hover step and the destroy step.
9. Records on the work branch: new docs/community/requirements/sky-cleanup-count.md with the row
   (2026-09-26, upstream #73 SwedishLesbian, hand-set quantity on Cleanup);
   the original repo's #73 row in docs/community/ISSUES.md: disposition to fixed with the branch name and the owner's 2026-11-19
   word; one line under the Sky notes in docs/community/agent/BRANCH_NOTES.md (Cleanup's Held cell
   is HandCountCell; cleanup.ts has no unit test but the new file). Fix the stale pointer comments
   naming tests/skyCleanup.test.mts (cleanup.ts:15, sky-cleanup.e2e.mts:19) to the new file. The
   What's new line comes from the commit notes at release time; do not hand-edit
   src/shared/communityReleaseNotes.ts.

### Tests

- tests/skyCleanupOverride.test.mts (new, node:test, pure: reconcile + cleanupRows +
  shared/itemOverrides, a hand-built one-item quest as tests/skyItemOverrides.test.mts:68-82 does).
  Must prove: (a) quest turned in once, log holds 3, no statement -> one Cleanup row with the
  reconciled count; (b) a statement of 0 for that key -> reconcile net 0 -> cleanupRows returns no
  row; (c) loot after the statement (lootSinceOverride) brings the row back with that count; (d) a
  statement of 2 -> the row reads 2, under 'both' and under 'handins'; (e) clearItemOverride
  restores exactly the rows of (a) (deep equal). Date the turn-in before the statement via
  turnInInstants so the windowed consumption is unambiguous. This restores case 5 of the deleted
  tests/skyCleanup.test.mts.
- tests/e2e/sky-cleanup.e2e.mts: one new step after stepRewardHovers, while the row reads x3: click
  `[data-testid="posky-cleanup-row"] [data-testid="posky-item-count-edit"]`, fill 0, save; assert
  the row is gone, the tab label is 'Cleanup', and `posky-overrides-active` shows on the Cleanup
  tab; then on the Quests tab clear the chip (`posky-item-override` delete icon) and assert Cleanup
  is back to x3. Reversibility keeps steps 5 and 6 unchanged.
- tests/e2e/sky-item-override.e2e.mts: no edit; it must still pass unchanged, which proves the
  quest-row cell kept its DOM order and testids after the lift.

### Risks and limits

- Reverses the recorded 2026-09-28 'not ours to build' ruling. Its stated reason (the count logic is
  the creator's to change) does not apply: no count logic changes, and the owner asked today for
  recent upstream issues to be addressed in the fork.
- A mistyped 0 on a destructive-advice screen hides the row with no undo on the row itself.
  Mitigation in the plan: the summary chip on the Cleanup tab; the take-back stays on the quest row.
  Opposite direction is the safer error here: a hidden row cannot make anyone destroy anything.
- The pencil's existing hover (ItemOverrides.tsx:182) says the log cannot see a destroy, which has
  been untrue since JOS-401, and runs past the 15-word rule. Reused unchanged to keep the diff
  surgical; see the owner question.
- The open editor widens the narrow Held column for that row while it is open (inline by design, no
  popper).
- A statement is per item, not per quest: setting it on Cleanup also changes the Have count on every
  quest row that names the item. That is the existing rule and what keeps the two tabs on one
  number.
- The fix lands in the fork only; upstream #73 stays open on the creator's repo unless the owner
  answers there.

### The three first passes, checked

sonnet: held throughout (cleanup.ts:220-225 drop at 0, ItemHaveCell semantics,
PoskyView.tsx:577/392, size S, no storage change). Its caveat held and is sharper than stated: the
summary chip is not on the Cleanup tab at all (PoskyView.tsx:75-78 is the Quests pane only), so the
plan adds it there. Its unverified point (later loot re-adds after a 0) is true by design
(reconcile.ts:664-677).
haiku: two claims refuted. (a) 'a completed trade to any NPC is already subtracted
(heldCounts.ts:228-237)' is true only under the opt-in 'handins' source (useProgress.ts:375-377,
reconcile.ts:882), not under the default. (b) 'needs the owner to reverse the JOS-401 choice that
the pencil stays only on the quest row': CleanupList.tsx:17-25 records the removal of a destroy
button and says the pencil stays as the escape hatch for a trade; it does not rule the pencil out of
Cleanup. Held: the <= 0 drop, and that the override feeds ItemProgress.held (I read the path end to
end).
opus: held throughout, including the two details the plan turns on: ItemHaveCell takes an
ItemProgress and cannot be dropped on a CleanupRow as is, and CountEditor/OverrideChip are
module-private (ItemOverrides.tsx:50, 68). Its open question is answered: CleanupRow carries no
override, so the list is passed down and indexed by row.key; row.name maps to row.key
(itemName.ts:23-31).
All three missed that tests/skyCleanup.test.mts was deleted in b6ff987bb, so Cleanup has no unit
test on trunk and 'add a unit test' means a new file.

### Reply draft (posted only on the owner's word)

> This is being added in the community build (kaltinril/everquest-companion): the Cleanup row gets the same pencil the quest row has. Click it, type how many you really hold, and the count is yours from then on. Type 0 and the item leaves the Cleanup list. Anything you loot after that is added on top.
>
> Until that build is out, the same control exists one tab over: Sky > Quests, expand the quest that uses the item, and use the pencil beside its Have number. It changes the same count the Cleanup tab reads.
>
> The reason the app cannot do this by itself: the game's log does not say what left your bags in a trade to another player, and the inventory export cannot tell "gone" from "not looked at".

## Phase 9: Sky runes deposited to the Currencies tab ([fork #2](https://github.com/kaltinril/everquest-companion/issues/2))

- Verdict: already done. Size none. TypeScript only. Work branch: none. Requirements:
  `requirements/sky-rune-count.md`.
- On trunk today: The game gap is still there (an /outputfile inventory dump never lists the
  Currencies tab), so "Export only" and "Rebaseline" still read a deposited rune as 0. The
  reporter's suggested remedy is on trunk and released: count source "Log only (loot minus
  hand-ins)", in every build from 0.1.0-test.39 (2026-11-01) to today's test.51.

### What is true

1. Option exists. COUNT_SOURCE_OPTIONS has a fifth entry, value 'handins', label "Log only (loot
minus hand-ins)", with a one-sentence hover
(src/renderer/src/features/inventory/countSource.ts:128-135). It is a stored pick (KNOWN at :74) and
never the default (DEFAULT_COUNT_SOURCE = 'both', :72).
2. Where the player reaches it. The "Count items from" dropdown
(src/renderer/src/features/posky/QuestFilterBar.tsx:468-480) is drawn on the Sky Quests, Ready,
Targets and Cleanup tabs (CleanupList.tsx:200, TargetsView.tsx:301, PoskyView.tsx:214) and on the
Loot ledger (LootChrome.tsx:214-215). One stored key, 'eq.countSource'.
3. What it does. useProgress.ts:375-377 folds computeLogOnlyCounts(lootHistory, trades) only under
'handins'. That fold (posky/heldCounts.ts:239-260) walks loot and completed trades in time order:
loot adds (currency-tab loot included, heldCounts.ts:8), every item a completed trade took from you
subtracts by stack count, whatever the NPC and whether or not a known quest matched (:245-251), a
destroy subtracts (:91), floored at 0 per row. reconcile.ts:591 returns that number and never reads
the dump; countsFromInventory is false for it (countSource.ts:152), so the export-freshness caption
and dump-blind notes stand down. A hand-set count (pencil) still wins over it (reconcile.ts:587).
4. Against the reporter's words ("ignore them in the /output inventory process, loot log controls
adds, quest turn-ins control deletes"): it does that, with two differences. It is wider on the
remove side (any completed hand-over and any destroy, not only known quest turn-ins), and it is a
whole-tab choice (the export is ignored for every item, not only runes), so an item only the export
ever saw reads 0 under it.
5. Released. Commit 1df1333c0 (2026-10-29) added it; tag community-0.1.0-test.39 is the first tag
containing it; the What's new entry is src/shared/communityReleaseNotes.ts:585 inside the
0.1.0-test.39 block (:519-520, dated 2026-11-01). package.json:3 is 0.1.0-test.51.
6. Tests on trunk: tests/skyLogOnlyCount.test.mts (9 cases: currency loot adds, any-NPC hand-over
removes its stack, cancelled or refused offer removes nothing, destroy removes, export ignored, time
order, pre-`given` rows, no-fold fallback).
7. Known limit, by design: it only knows loot the log (plus the app's archive) shows, so a rune
looted before that window reads 0 until the pencil states it
(docs/community/agent/BRANCH_NOTES.md:1007-1009; dumpBlindItems.ts:46-47 says the same on screen).
8. Nothing is left to build under the owner's ruling. The owner's 2026-11-02 comment on the issue
already points at the dropdown; the only unbuilt idea is reading the Currencies tab off the screen,
which the owner named as a some-day idea. No instruction addressed to an AI in the issue text.
9. Records are stale, not the code: this repo's #2 row in docs/community/ISSUES.md and
docs/community/requirements/sky-rune-count.md:8 still say "not yet tested in the app" and "Not
answered on the issue", and neither records the 2026-11-02 comment or the test.39 release.

### Risks and limits

- Records only: this repo's #2 row in docs/community/ISSUES.md and docs/community/requirements/sky-rune-count.md:8
  still read 'not yet tested in the app' and 'Not answered on the issue'; worth correcting the next
  time the ledger is touched (shipped in test.39, owner commented 2026-11-02).
- "Log only (loot minus hand-ins)" ignores the export for every item, so a player who switches to it
  for runes loses the export's vouching for banked items the log never saw. The reply should say so.

### The three first passes, checked

sonnet: held on every point the verdict rests on (option at countSource.ts:128-135, export ignored
at :152, test.39 block at communityReleaseNotes.ts:519/585, default still Both). Its 'archived-log
drift' gap is imprecise: under handins loot and trades come from the same log window, so the limit
is loot from before that window, not drift (BRANCH_NOTES.md:1007-1009). It did not read the fold; I
did, and it matches.
haiku: facts held (commit 1df1333c0, test.39 build 9f191b796, reconcile.ts:126-127 and 590-591,
ledger does not record the 2026-11-02 comment). Its kind 'by-design-or-not-fixable' is the wrong
label: the suggestion was built and shipped, so this is already-done.
opus: all code claims held (reconcile.ts:586-597, 125-129, 882; release note). Its
'present_on_trunk: no' contradicts its own text; the option is on trunk and the export gap remains.

### Reply draft (posted only on the owner's word)

> What you suggested is in the app from test build 0.1.0-test.39 on. On the Sky page, open the "Count items from" dropdown and pick "Log only (loot minus hand-ins)". Loot adds, anything you hand to an NPC or destroy removes, and the inventory export is ignored, so a rune moved to the Currencies tab stays counted.
>
> Two things to know. It is a choice, not the default (the default is still "Both (higher of the two)"), and it ignores the export for every item, not only runes. It also only knows loot your log shows: a rune looted before your log begins reads 0 until you set it with the pencil beside the item on the quest row.
>
> Reading the Currencies tab off the screen is not built. The game's export still leaves that tab out.

