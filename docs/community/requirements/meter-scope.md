# meter-scope: what was asked for

Every request the meters' You / Group / Everyone scope has taken, newest at the bottom. Read it
before changing the scope control; nothing listed here is removed or narrowed without the owner's
word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-11-16 | owner | "add a mine only for the combat section so i can see me and my pet only": a way on the Combat tab itself to narrow the meter to you and your pet. | built (the scope word on the Combat tab is clickable and steps You, Group, Everyone; it writes the one preference Preferences > Combat holds, so the Overview card and the overlays follow). Superseded on that last point by the 2026-11-17 row |
| 2026-11-17 | owner | "a user who picks only me in the combat tab, thats only for the combat tab, not the overlay": the Combat tab's pick stays on the Combat tab; the overlays do not follow it. | built (the tab's click writes the tab's own key `eq.combat.tabScope`; absent, the tab follows Preferences > Combat. The overlays and the Overview card read Preferences > Combat alone, and a pick there also clears the tab's own, so Preferences still sets every meter) |
