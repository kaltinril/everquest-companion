# map-improvements: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the feature;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19). Rows
before 2026-10-10 were gathered that day from agent notes and the branch history.

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-09-12 | owner | Nothing that does not relate to EQ Legends (drop ports whose spell the client lacks). | built |
| 2026-09-12 | owner | Precompute the zone graph once; no per-open work. | built at idle; full precompute open |
| 2026-09-12 | owner | Closest-port item names open their item. | built |
| 2026-09-14 | owner | Where to level skips out-of-era zones, home cities and locked zones, and seeds the level from the character. | built |
| 2026-09-21 | owner | The map must not keep following the mouse after a release. | built |
| 2026-09-23 | owner | Plane of Hate (and the other planes) show their ports. | built |
| 2026-10-17 | owner | Out-of-era wiki content is never offered as if it were in the game, across all wiki data, not only items (A Hatebone Drake, a `{{FearHateRevamp Era}}` mob, was listed under Achievements Where to go): every wiki record keeps its page's era banner, and every list applies the app's one era rule (recommending lists hide out-of-era entries, lookups tag them). | built (zone bands, wish counts, the level caption, the mob list and wish pins leave out-of-era mobs off while Current era only is on) |
| 2026-10-17 | owner | The log outranks the wiki banner: nothing the player's log shows they looted, killed, considered, cast or entered may be hidden or marked out of era ("I've seen it drop so it can't be out of era"); measured against the whole log before the era work merges. | built (src/shared/metInLog.ts, fed by the engine's kills, loot, consider and progression; mobs, items and zones the log met are in era; measured on the whole log 2026-10-17: 2,327 mobs, 2,260 items, 143 zones met, none out of era) |
| 2026-11-17 | owner | Closest port: where a port lands is readable without scrolling past the item names (12 item names hid "lands in Misty Thicket" on Clan RunnyEye). | built (the landing text comes before the item chip) |
| 2026-11-19 | owner (the bug hunt of that day) | Three map defects found by the hunt are fixed: the wizard's level-24 port to The Dreadlands (Combine Gate) was missing from Closest port, so the chip began at 34; the Map pins overlay was blank with no note on a zone whose map has nothing to fit (an empty map file or a single label); and on a zone change the overlay drew the last zone's map under the new zone's pins and could say "No map for this zone" while the map was still loading. | built (the port pattern reads coordinates in parentheses; a map with no span on either axis is not an extent, so the "No map" note shows, the fit cannot produce NaN, and a broken saved view is dropped on load; the overlay holds its map with the zone it was asked for, draws no other zone's map, and stays silent until the answer is in; tests in zonePorts, mapTrack and mapPinsNote) |
