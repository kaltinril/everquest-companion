# test-hygiene: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the feature;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-28 | owner | Count-pinned census tests force a test edit every time the wiki's counts change. | built (census-floors, not yet tested in the app): see the next row |
| 2026-10-29 | owner | Replace exact corpus counts with property checks or floors: "so that we are not saying 'oh, we had 400 spells, now there are 401, test failed' that's useless". | built (census-floors, not yet tested in the app): the 19 TS count pins over the wiki data and the Rust spell-category counts are floors at 90% of the measured count (`tests/corpusFloor.mts`) or properties; token censuses and named-record pins stay |
