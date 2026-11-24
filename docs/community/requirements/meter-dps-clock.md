# meter-dps-clock: what was asked for

Every request about what time a damage meter's DPS is divided by, newest at the bottom. Read it
before changing a DPS figure; nothing listed here is removed or narrowed without the owner's word
(RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-11-17 | owner | "it's counting dps timer from when the fight begins even if i didn't start attacking yet"; "if i don't attack at all for the entire fight and I do 1 hit at 40000 dps, that should be my dps": a row's DPS is its damage over the time that attacker spent attacking, not over the whole fight it joined late. Measured on the owner's log (2026-11-17 21:46:45, Cleric of Innoruuk): a group-mate's bow shot opened the fight 3 s before the owner's first hit, so 7,247 damage read 426 DPS over the 17 s fight and is 518 over the owner's own 14 s. | built: each row (outgoing and incoming) divides by its own clock, first swing to last swing (hits, misses and resists) in each fight, at least one second per fight, summed over the fights an overall view holds. Under the You scope the headline is your and your pets' damage over your own clock; a drilled row's headline is that row's own rate. Unchanged: the fight's own headline (whole damage over the fight's length), the Group and Everyone headlines (their share of it), and the healing meters |
| 2026-11-23 | owner (answering the bug hunt's open questions): "pet dps from when it first attacked, if I cast a spell and the mob runs over thats 1-5 seconds" | A folded pet row's DPS runs on the pet's own clock, starting at the pet's first attack, not on the header's fight clock. | ruled; check today's code against it before building |
| 2026-11-23 | owner (answering the bug hunt's open questions) | Time a mob spends held on mez still counts in the fight clock and the zone clock. | ruled |
