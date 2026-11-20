# sky-cleanup-count: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the feature;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-09-26 | SwedishLesbian (upstream #73); owner 2026-11-19 | "If you give the items in a trade, EQC will continue to report it as part of cleanup. fix is allow users to manually change quantity." Owner, 2026-11-19: address the original repo's recent issues in the fork where they still remain. For this request that replaces the 2026-09-28 "not ours to build" (ISSUES.md), for the pencil only: no count logic changes. | built (branch `cleanup-pencil`; plans/2026-11-19-issue-sweep.md, phase 8): the Cleanup row's Held cell draws the quest row's pencil (`HandCountCell`), same statement and store call; 0 takes the row off, and the tab shows the "counts set by hand" chip |
| 2026-11-19 | owner (the bug hunt of that day: "do a big hunt review for other issues in our code, logic issues, code issues, intention for the feature issues. Fix things that you validate are real"; "continue to add unit tests") | Found in the upstream #73 fix: a Cleanup row set to 0 by hand could not be taken back from the Cleanup tab, and the chip pointed at a quest row that "Hide turned in" usually hides; a count over 99,999 was dropped and also deleted the count already in force. | built: under the "counts set by hand" chip the tab lists what a hand-set count took off the list, one chip per item, and removing the chip brings the row back; the pencil's rule is a tested function (`parseHandCount`) and an out-of-range count changes nothing. Cleanup's own rule has unit tests again (`tests/skyCleanup.test.mts`) |
