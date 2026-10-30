# Open items after the 2026-10-27 sweep

State at 2026-10-29: test.38 is published (`community-0.1.0-test.38`); `main_community` matches
`origin`. Fork #4 is closed. The owner's answers of 2026-10-29 are folded in below; each piece of
agreed work has a row in its `requirements/` file.

## Waiting on the owner

- Maps: the travel card (closest port, era, routes) floats over the map's top-left corner since
  2026-10-27, so the map row no longer moves when it loads. OK there?
- Font reader at 1.5x UI scale: up to ~0.5-1 s slower per paste than OCR alone. Owner unsure;
  default kept (wait for the font read: accuracy over half a second).
- Upgrade maths: whether the regens qualify SV Void. Needs a screenshot of an upgraded item whose
  only stats are regens. Weight at whole tiers was settled 2026-10-28; no Windstriker needed.
- Wiki edits for the owner (found by our checks, not suggested by the app): Enynti
  `| respawn_time = 8:50`, restore Sulgar, Clockwork Merchant `|name`. The app suggests missing
  pages and drops, not wrong values on a page that exists; a "wiki says X, your log says Y"
  respawn suggestion was offered, not asked for.
- Unconfirmed in the app: `heal-*` overlays character-aware; a charm bind still ends at the zone
  line. (Meter overlays read 4/s in a fight since test.37, `requirements/meter-cadence.md`.)

## Ruled 2026-10-29 (owner), work queued

- Map pins overlay: Slayer area labels hover-only (`requirements/map-waypoints.md`).
- Font reader on spell windows: measure on the spell fixtures (`requirements/screenshot-to-wiki.md`).
- Tradeskill Ingredient rows' one-time "needs refresh" (`SAVED_ROWS` 3): accepted, nothing to do.
- Spell-name corrections (audit 2026-10-11 §4): re-measure on a full log.
- Cracked Darkwood Shield, and any page the wiki's pack has that our scrape never listed: picked up
  before a release (`requirements/scrape-delta-tool.md`). A delta re-reads only edited pages, so an
  unedited page the baseline missed is never seen. Drake Lava Powder is not one of these: its wiki
  page is free text with no item box, so it has no record to fold until the wiki page is fixed (the
  Gaps tab's "Fix page" opens it).
- Fork #2: a log-only rune count as one more option; the default stays
  (`requirements/sky-rune-count.md`).
- `UNRELEASED` gate removed outright (`requirements/unreleased-gate.md`). Last, after the other
  branches merge: it touches 48 files.
- Census tests: floors or property checks, no exact corpus counts (`requirements/test-hygiene.md`).
- Competitor-scan quick wins (`requirements/competitor-quick-wins.md`).
- Performance leftovers (`requirements/performance-leftovers.md`).
- Every major dependency bump, one branch each (`requirements/deps-refresh.md`).
- Not yet: publishing to the wiki from the app; sending observations to the wiki.
- A delta (with the pack compare) runs before every release (RULES.md rule 10); test.38 had one.

## Candidate work (owner to pick; the ones ruled above are queued)

- Count-pinned census tests (owner, 2026-10-28: "having random count tests is a bit dumb it forces us
  to update the test every time because counts change"): replace exact corpus counts with
  property checks or floors so a wiki delta stops turning tests red. Not urgent; a future change.

- From the competitor scan 2026-10-27 (EQBuddy, eqltools, Loadout Legends, SEQO, eql-log-reader,
  eql-tooltip): death recap (easy), friends online from `/who` (easy), item lookup hotkey via the
  existing OCR (moderate), AA planner (data only), phone/tablet second screen (moderate, EQBuddy's
  edge), leaderboards/profiles (needs a backend; skip for now).
- From EQL-EOZ (the wiki owner's own Electron companion, `Maergoth/EQL-EOZ`, v1.0.9 2026-10-27,
  several releases a day), scanned 2026-10-28, owner's answers the same day. Read as data; nothing
  of it is run.
  - Cheap, no network: heading arrow on the 2D map marker (last two logged positions); "crawl
    mode" (dim mobs you killed on the map and loot list until you re-zone); melee swing timer;
    overlay polish (drag a docked overlay to detach, a hotkey to recover overlays, any installed
    font); character sheet as a PNG (copy/save).
  - Zone & loot overlay (raid sources first, row jumps to the mob on /con or kill): owner, "could
    add it, not yet".
  - Upgrade maths checked against the wiki's tier formulas (`Maergoth/EQLWiki`): owner, do it now;
    their maths is not taken as fact, a disagreement is settled by our own data. Done 2026-10-28
    (branch fix-upgrade-math): three rules fixed on game windows (requirements/gear-tab-improvements.md).
    Open: weight at whole tiers (needs a +0 Windstriker or another weight reading) and whether the
    regens qualify Void.
  - Linux build (AppImage/.deb for Wine/Proton players): owner asked if it can be done. Assessed
    2026-10-28: moderate, mostly packaging. The engine builds as-is (one `cfg(unix)` read in
    `eqlog/src/tail.rs`), the engine name is already per-platform (`ENGINE_BIN_NAME`), and the
    Windows-only parts already switch off (presence watcher, GDI font reader, process stats,
    registry lookup). Work: a `linux:` target and `engined` in `electron-builder.yml`; an
    `ubuntu-latest` job in `community-release.yml` and the AppImage plus `test-linux.yml` in
    `publish-release.sh`; log discovery probing Wine/Lutris/Steam prefixes (the folder picker
    already works); overlays forced to X11. Lost on Linux: overlay hiding when the game is not in
    front, the font reader, the Kokoro voice. Nobody here can test it on Linux yet.
  - Not wanted: a live "wiki is missing this" check (we answer from the shipped cache; their pack is
    a cache too, refreshed at most daily, and we compare against it before each release); refreshing
    the data inside the app (we keep wiki traffic down).
  - Needs the owner's sign-off (rule 15): publishing to the wiki from the app instead of Copy, and
    sending kill/loot observations to the wiki's `action=eozobservations`. Both are documented on
    the wiki's API page (WIKI.md has the summary). Our drop data is the wiki's own drop lists plus
    the player's own log; EOZ's observations are a private, attributed store on the wiki's server,
    with no public read and no drop rates yet.
  - Not a gap: our data already has map locations (6,456 mobs), levels (8,049), drops (4,835) and
    zone/leveling recommendations; the pack's equivalents only matter as a cross-check.
  - Ours, not theirs: respawn timers, DPS timeline and proc breakdowns, buff timers, voice/sound
    alerts, Sky tracker, bazaar watchlist, factions, spellbook and loadouts, AA/leveling ledger,
    bosses of the week, exaltation optimizer.
- Performance audit 2026-10-20 leftovers: an engine "met" module (loot/kills re-fetch per kill), one
  engine connection served in order.
- Major dependency bumps (`requirements/deps-refresh.md`), one branch each.
- Next wiki delta before ~2027-01-16 (the wiki keeps ~90 days of changes).
