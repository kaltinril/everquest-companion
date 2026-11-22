# Repeatable faction quests on the Factions tab (designed, not built)

Owner, 2026-11-21, after maxing factions by handing Palatos Kynarn ale: "is there anything that
really notates that you can easily get the faction up", "check if the app shows this as an easy
route to max faction", "why can't we somehow show that?". The last question to the owner was whether
to build both steps below. **No answer yet: do not build until the owner says so.** Wiki notes do not
fix this: the Factions tab reads neither a mob's description nor an item's notes.

## What the app does today

- `QuestEntry` (`shared/types.ts`) has no repeatable field. Of 913 catalog quests, 645 state faction
  changes and none is marked repeatable. `scripts/sources/questPage.ts parseQuestPage` drops the signal.
- `factions/factionQuests.ts` sorts a faction's raises by amount per turn-in only (`byPayout`).
- One row per quest page: one giver, one item list, one receipt for the whole page.
- The Painting on the tab today: #4 for Craftkeepers, #13 for High Council of Erudin, #3 for High
  Guard of Erudin. It names Danaria Hollin in South Qeynos, not Palatos Kynarn in East Freeport; shows
  the ale with no count, price or seller; and its receipt mixes in Lenka Stoutheart's later step
  (Wolves of the North, Shamen of Justice, Merchants of Halas, Steel Warriors).

## What the wiki already states (saved pages, `scripts/sources/cache/quests`, no request needed)

23 pages with faction lines say a quest repeats:

- 19: `[[Category: Repeatable Turn-in Quests]]` (with or without the space after the colon).
- 2: a `!Repeatable:` table field (`page-15594`, `page-15598`).
- 2: a walkthrough sentence: The Painting (`page-15276`, "This step can be repeated to easily raise
  Craftkeepers and Erudin city factions") and `page-15889` ("rapidly repeatable" wording).
- Not one: `page-16007` says repeat attempts had their reward removed, and has no faction lines.

## Step 1: the marker

- Read the three signals in `questPage.ts`, add an optional `repeatable` to `QuestEntry`, and
  re-derive `quests.json` from the cached pages (no wiki request). Parser and data are separate commits.
- On the Factions tab, repeatable raises come first in a faction's list, with one small chip. Screens
  are already busy: no sentence, no new column.
- Read each of the 23 by hand first; a page that merely mentions repeating is not marked.

## Step 2: the step you repeat

- Where the page's repeat sentence sits inside a longer quest, take that step's facts: the nearest
  `facblock` above the sentence, the NPC speaking above it, and the item and count in the hand-in line
  above that (The Painting: "Upon handing Palatos four drinks").
- The row then reads Palatos Kynarn, 4 Capt. Orlin's Spiced Ale, +5 Craftkeepers, +5 High Council of
  Erudin, +5 High Guard of Erudin, -1 Heretics, with the seller and the player's last price.
- No hand-written override for one page. If a page's step cannot be read, it keeps the plain marker.

## Measured on the owner's log (2026-11-21)

In `agent/MEASURED.md`, "The Painting's repeatable hand-in".
