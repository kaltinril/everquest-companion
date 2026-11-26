# AA level requirements: the wiki against the owner's log (2026-11-26)

The Alt. Advancement tab's level filter reads each AA's level from the wiki's text (`aaStartLevel`
in `shared/aaBoard.ts`). The owner's rule (2026-11-26): fix the wiki when a row is found wrong; the
app does not override it. This file is the list to fix and to check.

## What the log can and cannot prove

- **A paid purchase at level N proves the rank can be bought at N or lower.** So a purchase below
  the wiki's level proves the wiki too high. Nothing in the log proves a wiki level too LOW: not
  buying an AA is not evidence that the game refused it.
- **The level is the one the game shows**: the latest `Welcome to level N!` ding or own `/who` row
  before the purchase. That number is the MINIMUM over the loadout's class levels
  (`engine/crates/fold/src/modules/combo/levels.rs`). Whether the game checks a requirement against
  that minimum or against the AA's own class level is not measured, so a class AA bought at a low
  shown level is strong evidence, not proof.
- **Free (cost 0) grants are not evidence.** The game writes a grant up to a second BEFORE the ding
  that earns it (MEASURED.md, "Alternate advancement"), so they read one level low.
- **`/alt list` prints no requirements**, and clicking a row in the game window writes nothing to
  the log. Only the window's rank panel shows the game's own requirement.

## Wiki rows the log contradicts (fix these)

| AA | Wiki says | Log shows | When, shown combo |
| --- | --- | --- | --- |
| Tireless Sprint (Berserker class AA, rank 1, cost 3) | Level 10 | bought at level 8 | 2026-11-26 01:45:56, last `/who` before it WAR/MNK/SHM (the combo had changed since; the purchase needs BER in it) |

Check in the game window before editing the wiki: the rank panel's "Requirements" line.

## Checked and consistent (no change)

- **Bestow Divine Aura**: the game window says "Level: 50, Divine Aura at Level 1"; the wiki says
  "Level 50, Divine Aura at Level 1". Same.
- **Bought exactly at the wiki's level** (supports the wiki): Rapid Feign rank 2 at 17, Burst of
  Power ranks 1 to 3 at 46.
- **Bought above the wiki's level** (says nothing): Double Riposte 3 at 21 (wiki 15), Soul Abrasion
  1 at 26 (wiki 15), Master of All at 31 (wiki 20), Holy Steed at 38 and Unholy Steed at 42 (wiki
  20), Rampage at 49 (wiki 30), and every "Level 1" row bought later.

## Free grants that read one level low (timing, not the wiki)

Unbound Drain 1 (11, wiki 12), Unbound Drain 2 (29, wiki 30), Unbound Destruction 2 (29, wiki 30),
Harm Touch 6 (25, wiki 26), Harm Touch 7 (30, wiki 31), Harm Touch 10 (45, wiki 46). Each one's ding
to the wiki's level is the next line, one second later. Not to be filed as wiki errors.

## How it was built

All of the owner's logs (`Logs/companion-archive/eqlog_Drywrought_oggok_*.log.gz` and the live
log), read in time order: 263 purchase lines (193 paid), 99 AAs. Each purchase took the latest ding
or own `/who` level, with a second's level lines read before its purchase lines; each AA name matched
a row of `AA_ROWS` (`shared/aaOfficial.ts`) and that rank's level came from `aaRequirements`
(`shared/aaGranted.ts`). The one-off script was not kept; the rule above is all it did.

## Open

- A "record" helper: the owner clicks through every AA in the game window and the app reads each
  rank panel (screenshot OCR, as screenshot-to-wiki reads item windows), building a table of the
  game's own requirements to diff against the wiki. Not started (owner, 2026-11-26: "not tonight").
- Whether a class AA's requirement checks the shown (minimum) level or that class's level.
