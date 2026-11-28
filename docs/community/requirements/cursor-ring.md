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
add more shapes for now". Then: "can we also control the offset, X/Y, with a demo showing the icon
and mouse ?" Then, the same day: "can you build in the other features now to the cursor, and can we
cal it cursor overlay instead of cursor ring?"

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-11-26 | owner | More shapes for the ring: diamond (a square turned 45 degrees), square, oval. | built (Preferences > Cursor ring > Shape; plus rounded square, ring with a centre dot, target/double ring, owner's same-day "a few more"; circle stays the default, so nobody's ring moves) |
| 2026-11-26 | owner | The player can upload an icon to use as the cursor mark, auto downsized if that is not much code, or else required to be small. | built (Preferences > Cursor overlay > Shape "My icon / drawing" > Upload icon: png, jpg, gif, webp, bmp or ico up to 5 MB, auto downsized in Preferences to fit 64 x 64 with its aspect ratio kept, never upscaled, stored as a small PNG; drawn at the Size footprint with the X/Y offset; thickness hidden, colour only tints the trail; Remove picture goes back to the circle) |
| 2026-11-26 | owner | A simple NxN grid the player can draw on, like Paint, to make their own cursor mark. | built (same row > Draw one / Edit drawing: 8, 12, 16 (default), 24 or 32 cells a side; click or drag paints in the brush colour (white default), right-click or Eraser clears, Clear, Save; Save stores one pixel per cell as the same picture an upload makes, drawn crisp; the grid is kept so Edit reopens it. "Load current icon into the grid" skipped) |
| 2026-11-26 | owner | A crosshair: one vertical line across the whole screen at the pointer and one horizontal line, with the line colour and weight the player's to choose. | built (Preferences > Cursor overlay > Crosshair lines: own switch, on with or without the shape; own colour, white default; weight 1 to 8 px, 2 default; off by default. The lines span the overlay window, which is the EverQuest window, so the whole screen only in fullscreen; they follow the raw pointer, not the shape's offset. A "Shape around the pointer" switch, on by default, lets the crosshair or trail run without the shape) |
| 2026-11-26 | owner | Trail / particle effects behind the pointer. | built (Preferences > Cursor overlay > Trail: Off (default) / Trail / Sparkles, Length 1 to 10, drawn in the shape's colour; no own colour picker yet) |
| 2026-11-26 | owner | Control the X/Y offset of the mark from the pointer, with a demo showing the mark and the mouse. | built (Preferences > Cursor ring > Offset X / Offset Y, -60 to +60 px, 0/0 default; the sample draws a mouse arrow with its tip on the pointer spot and the shape at the offset) |
| 2026-11-26 | owner | Call the feature "cursor overlay" instead of "cursor ring". | built (every player-visible string: Preferences section and item, switch, captions, window title; internal names, files, IPC channels, the `cursorRing` store key and data-testids keep "ring" so existing installs and tests are untouched; search still finds "ring") |
| 2026-11-27 | owner | "add a toggle button to turn the mouse overlay features on/off so the user can add it. Should go in a hotkeys area, but also show the hotkey on the mouse overlay preference tab". Then, the same day: "everything should be where it is, but also in hotkeys". | built (a "Cursor overlay on/off" hotkey, off until set, Ctrl, Alt or Win required; a press flips the master switch through the same path as the Preferences switch, so the ring window, cursor poll and presence watcher start or stop, the tab's switch follows live, and the press is logged; set in a new Preferences > Hotkeys section, last in Display under Cursor overlay; the Cursor overlay tab shows "On/off key: ..." or "No on/off key set", read-only, with a button to Hotkeys; two actions never share a key, a clash is refused naming the other action; tests `hotkeyBoard.test.mts`, `overlayHotkey.test.mts`, e2e `cursor-ring-color` wiring) |
