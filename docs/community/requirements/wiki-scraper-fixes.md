# wiki-scraper-fixes: what was asked for

Every request this branch has taken, newest at the bottom. Read it before changing the branch;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-10 | owner | Find out why a druid's Healing Water (DRU 34) is missing from the spell lists. | answered: the spell scraper names a spell by the page's `spellname`, which on page 57458 still said `Greater Healing`; the wiki fixed the name on 2026-09-03 and the committed `spells.json` predates that |
| 2026-10-10 | owner | Review all of our wiki-scraping code for more bugs, and fix all of them. | built (code; re-deriving the data is a separate owner decision) |
| 2026-10-10 | owner | Re-derive the data so the fixes show ("ok re-derive the data"). | built offline with zero requests: items, mobs, quests, mob factions and races, spell lines. Held: `spells.json` (needs a revid-checked `scrape:spells`, owner's call) and `respawns.json` (a re-derive keys the page The Ghoul Lord (Hoptor Thaggelum) by its full name, so Lower Guk's ghoul lord would lose its floor; needs a key fix first) |
