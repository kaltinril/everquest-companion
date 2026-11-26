# cursor-ring: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the feature;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19).

The ring itself (off by default, drawn only over the EverQuest window, size, thickness, colour)
predates this file; its rules are in `src/shared/presencePrefs.ts` and the cursor-ring section of
`agent/BRANCH_NOTES.md`.

The owner's words, 2026-11-26: "ok, the curor thing is very plain. Can we have more shape options ?
diamond (45 degree rotated square ish) square, oval, and then 4 more things 1. user can upload an
icon (it can either be auto downsized if it's not a lot of code bloat, or, require it be a small
icon) 2. a simple quick NxN grid they can draw on like paint 3. a cross hair like thing, 1 vertical
line across the entire screen at the mouse posiiton, and 1 horizontal at the mouse position (they
can control line color and weight) 4. trail/particle affects". Then, the same day: "ok can we just
add more shapes for now".

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-11-26 | owner | More shapes for the ring: diamond (a square turned 45 degrees), square, oval. | built (Preferences > Cursor ring > Shape; plus rounded square, ring with a centre dot, target/double ring, owner's same-day "a few more"; circle stays the default, so nobody's ring moves) |
| 2026-11-26 | owner | The player can upload an icon to use as the cursor mark, auto downsized if that is not much code, or else required to be small. | queued (owner, 2026-11-26: shapes first) |
| 2026-11-26 | owner | A simple NxN grid the player can draw on, like Paint, to make their own cursor mark. | queued (owner, 2026-11-26: shapes first) |
| 2026-11-26 | owner | A crosshair: one vertical line across the whole screen at the pointer and one horizontal line, with the line colour and weight the player's to choose. | queued (owner, 2026-11-26: shapes first) |
| 2026-11-26 | owner | Trail / particle effects behind the pointer. | queued (owner, 2026-11-26: shapes first) |
