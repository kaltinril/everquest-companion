# Macro editor (fork #11)

Opened 2026-11-20. Requirements: `../requirements/macro-editor.md`. Status at the bottom.

## What the game stores (measured on the owner's install, 2026-11-20, files read only)

- Macros ("socials") live in `<Character>_<server>_LO<n>.ini` in the game folder, section
  `[Socials]`. Not the `UI_...` file beside it (window positions).
- Keys, one macro per slot: `Page<P>Button<B>Name=`, `Page<P>Button<B>Color=<number>`,
  `Page<P>Button<B>Line1=` to `Line5=`. A line that is empty is not written. Keys are not in slot
  order (public guides say the same).
- The owner's files hold slots `Page2Button1` to `Page2Button4` only. Page 1 is never in the file:
  taken to be the game's built-in set (not measured).
- `_LO<n>` is the class loadout. The game's own text: "This option will reset the UI for the
  current loadout on your character ... The existing UI file will renamed with _backup appended".
  Only `_LO1` files exist on the owner's install (five characters), so a second loadout's file name
  is inferred, not seen.
- `<Account>_characters.ini` lists every character as `CharacterN=<name>,<server>`.
- Hotbar buttons are in the same file, `[HotButtons]`, `[HotButtons2]` ...:
  `Page1Button9=E13,@-1,0000000000000000,0,,`. `E13` and `E14` appear on the owner's bars and the
  owner has macros on page 2 buttons 1 to 4, so `E<n>` is read as slot number
  `(page - 1) * 12 + button`. Inferred from two values; `E229`, `E2136`, `E6120` on the same bars
  are something else.
- The macro window is a list with a search box, a "show blank" box and "New Macro: add a new macro
  in the first blank slot" (`uifiles/default/EQUI_ActionsWindow.xml`). Its edit window has a name,
  five lines and twenty colour buttons, numbered 0 to 19 (`EQUI_SocialEditWnd.xml`). Neither file
  states a length limit.
- The game's own Copy UI Settings window has three boxes: Hot Buttons, Loadouts, Socials
  (`EQUI_LayoutCopyWindow.xml`). So the game can copy every macro from another character's file,
  all or nothing.
- Message table (`eqstr_us.txt`): `/Hotbutton [Name] <Color> [Text]`, "Text - Up to 255 character
  macro to be used for the hotbutton"; "You have reached the limit of %1 hotbutton sets". No message
  about a macro limit was found. The reporter's "100" is not confirmed.
- When the game writes the file: on 2026-11-20 the owner's log and UI file were written at 10:57
  and the character file was last written 2026-11-19 23:56. So a play session that changes no macro
  or hotbar does not rewrite it. Public reports for the older game say edits made while logged in
  are lost at camp.

## What public guides say (the older EverQuest; fetched 2026-11-20, none checked in EQL)

- Five lines a macro, one command a line, with an optional `/pause N,` in front. The pause runs
  AFTER the line's command although it is typed first. N is about tenths of a second and will not
  go past about 70 seconds. A macro does not wait for a cast to end.
- `%t` (the target's name) is the substitution seen in examples. `# text` after a command is used
  as a comment.
- The file is read at login and written at camp ("best guess" in the thread). "If you're logged in
  while you edit them EQ likes to eat the changes when it logs out." No way to reload in game.
- Players copy macros by copying the `[Socials]` lines and renumbering page and button by hand.
  One asked for a way to copy ONE macro, because the game's copy replaces the whole set.
- No outside macro editor, share format or import command was found for the unmodified game.
  The tools that exist are add-ons to a client injector, which this app does not touch.
- Macros players share: assist, pet attack with an announce, auto forage, aggro announce, a cure
  hail, invites, follow on and off, a tell reply. Names seen for EQL: PetAttack, Forge, AdvLoot.
- Sources: eqlegends.wiki/guide/ui-macros, almarsguides.com (character file; advanced macros),
  everquest.allakhazam.com/wiki/eq:macros, two redguides.com threads (83097, 94565). The EQL wiki's
  macro guide was not read (no wiki request was spent on this).

## Design

- **The library is the app's.** A macro: name, colour number, up to five lines, plus tags and a
  note the game never sees. Kept in the app's own store file. The game's file is a place to read
  from and, later, send to.
- **A set** is a named layout: slot (page, button) to a library macro. One macro may sit in many
  sets. A character file (character, server, loadout) has one chosen set.
- **Import** reads `[Socials]` from every character file in the game folder; a macro identical to
  one in the library is not added twice. Pasted ini lines import the same way.
- **Out, in P0:** the set as `[Socials]` text on the clipboard, and what would change against the
  file. No write to the game folder.
- **Isolation:** `src/shared/macros/` (pure), `src/main/ipc/macros.ts` and its store,
  `src/renderer/src/features/macros/`. Shared files touched: the tab's registration only.
- **Limits** are constants in one file, each marked measured or assumed: 5 lines, 12 buttons a
  page, 10 pages, 255 characters a line, colours 0 to 19.

## Character-first flow (owner, 2026-11-20, after first use of the three-tab screen)

The owner found Library / Sets / Characters clunky ("feels random"). The page is reworked around
one sentence a player can follow with no explanation: **pick a character, click a button to edit
it, press Send.**

- **Two sections only: "Characters" (first, the default) and "Library".** The Sets tab is gone.
- **A character's buttons are just there.** Every character file gets its own layout the first
  time the tab sees it, made from what the game holds; its macros go into the library (identical
  ones once). No "make a set" step. A one-time line says what was brought in.
- **The grid is the editor.** Pages 2 to 10, twelve buttons a page. Click a filled button: the
  macro's editor opens beside the grid. Click an empty one: "New macro" or pick from the library,
  right there. Drag a button onto another to move or swap.
- **One macro, many places, said out loud.** An edit changes that macro everywhere it sits; the
  editor names where else it is and offers "Change only here" (a copy for this button).
- **Changes are visible before they are sent.** A button that differs from the game is marked
  (new, changed); a slot the game has and the layout does not is marked removed. A bar at the
  bottom counts the changes and holds "Review and send". Nothing reaches the game until Send.
- **Layouts replace sets,** behind one menu on the character's page: save these buttons as a named
  layout, load a layout, copy another character's buttons, reset to what the game has. That is how
  macros move between characters and loadouts, and how a set is swapped in at the game's limit.
- **Undo and Redo** for every change to the library and the layouts (not for a send or a restore:
  those have the dated copies).
- The Library section stays the place to see every macro, tag, paste in and delete.

## Phases

- **P0, proof of concept (no game write):** library, tags, editor, sets, per-character choice,
  import from the game's files and from pasted text, copy out as ini text, the diff.
- **P1, in-game tests** (below). Results go in `agent/MEASURED.md`.
- **P2, apply:** write `[Socials]` of one character file: refuse while the game runs, show the
  diff, one-click restore.
  - **Owner rule (2026-11-20: "We should always backup the ini before the first time we touch
    it"):** before the FIRST write the app ever makes to a given game ini, it copies the file as it
    was. That first copy is never overwritten by a later one. A write does not go ahead when the
    copy could not be made. The same holds for an agent editing a game ini by hand for a test.
  - **Owner ruling (2026-11-20: "Original copy and last version. Dated or something yeah in
    folder. Build it"):** two copies, in the game folder beside the ini, each with its date in the
    name: the ORIGINAL (made once, never replaced) and the LAST (the file just before the latest
    write; the one before it is removed). "Build it" is taken as the word to build this step, and
    so as leave for the app to write `[Socials]` in a character ini. Nothing else in the game
    folder is written: not the `UI_` file, not the hotbar sections.
  - Built before the in-game tests, so what the game does with the file is still unproven: the
    screen says so, and the write is refused while the game runs.
- **P3:** keep hotbar buttons pointing at a macro that moved slot; copy a set between loadouts in
  one step; a share code between players.

## In-game tests owed (the owner; an agent reads the files after each)

1. Pickup: game closed, one macro added to a character file by hand. Is it there at login?
2. While logged in: a macro's text changed in the file. Does the game show it? After camp, is the
   edit still in the file?
3. Hotbar link: drag the macro at page 2 button 3 to a hotbar. Which `E<n>` is written? Then move
   the macro to another slot in game: does the hotbar button follow?
4. ~~Loadouts: switch loadout once.~~ **Answered 2026-11-20** by the owner's files: switching to a
   new fourth loadout on Drywrought made `Drywrought_oggok_LO4.ini` and `UI_Drywrought_oggok_LO4.ini`
   at 18:39, and the new file opens with the same macros and hotbar buttons as `_LO1` (a copy). So
   each loadout has its own macro file, numbered from 1 (`AutoSkillsLO0` to `LO3` in the file are
   the same four, numbered from 0). Loadouts 2 and 3 exist in the game and have no file: a file
   seems to appear only once a loadout is played (inferred). No text file read, and nothing the log
   printed in those minutes, names a loadout or its classes.
5. Limits: how many characters the name box and a line box take; how many pages, and buttons a
   page; what happens at the reporter's 100.
6. Page 1: are its macros editable, and does an edit to one get written to the file?
7. Colours: what colours 0 to 19 are on screen (a screenshot of the twenty buttons).

## Open decisions (owner)

- May the app write the game's character file (P2)?
- Top-level tab, or under an existing one. P0 ships it as its own tab, "Macros".

## Status

- 2026-11-20: research done; requirements written.
- 2026-11-20: mockup published for the owner (the usual first step: owner, "mockup first please"):
  https://claude.ai/artifact/JkMN41trsBNEeY18EgGXUT . No answer on it yet.
- 2026-11-20: P0 built (owner: "then you can send the agent back to building the real thing").
  `src/shared/macros/` (pure, 24 unit tests), `src/main/ipc/macros.ts` (the library is
  `<userData>/macros.json`; the game folder is listed and read, never written),
  `src/renderer/src/features/macros/` (Library, Sets, Characters). The tab sits in the Config
  group under Alerts (the app has no Tools group).
- **Not yet seen on screen by anyone**: checked by typecheck, lint and the unit tests only. No e2e
  spec. The main-process file has no unit test.
- Not built in P0: removing or renaming one's own tag; dragging a macro between slots; a file
  watcher (the game's files are read when the tab opens, when Characters opens and on "Read
  again"); a retry button when a save fails.
- The copied `[Socials]` text is the set alone: pasted over a file's section by hand it drops every
  slot the set leaves empty (the table shows those as removed).
- Parser choices not measured in game: lines are positional (a gap is kept, trailing blanks cut); a
  slot with only a colour is empty; a colour that is not a number reads as 0; character and server
  names hold no underscore; files are read as latin1. The pause hint (runs the command, then
  waits, tenths of a second) is from guides for the older game.
- 2026-11-20: P2 built (`src/shared/macros/socialsWrite.ts`, `backups.ts`, `unsavable.ts`;
  `src/main/macros/gameFileSend.ts`, the one module that writes in the game folder, and
  `gameRunning.ts`). 31 new unit tests, 15 of them on real files in a temp folder. **Not yet seen
  on screen and never run against a real game folder.**
  - A send: the name must be a character file of the folder's own listing; macros that cannot be
    written faithfully block it (a character above U+00FF, a control character, an empty name, a
    slot off the grid); refused while a game client runs, asked once on the click through the app's own in-process
    scan (`presenceNative.ts` `eqRunning`, on a one-shot worker thread; no process is started:
    `tests/noChildProcess.test.mts` forbids one, and a first cut that ran `tasklist` was caught by
    it), and refused when the scan cannot tell; refused when the file's sha256 is not the one the
    screen read; the copy is made and read back; temp file + flush + rename; read back and checked
    (the macros parse as sent, every byte outside `[Socials]` unchanged), put back from the copy
    when wrong.
  - Kept inside `[Socials]`: page 1's keys and any line that is not a macro key. The file is read
    and written as latin1, in its own line ending.
  - A restore puts the WHOLE file back (hotbars too) and first keeps the current file as the last
    copy, so it can be undone. The original copy is never removed.
  - Known edges: any program running from the game folder counts as the game, the launcher
    included; a client the scan may not inspect (another Windows user's) is not seen; the game
    could start between the check and the rename; the worker thread has run under Node in a test
    and in no Electron build yet; a refused send can leave an extra last copy until the next good one; a crash between
    copy and rename can leave `<file>.companion-write.tmp`, removed by the next send.
  - Not built: hotbar links (P3). A set that moves a macro may leave a hotbar button pointing at
    the wrong slot; in-game test 3 decides what to do.
- 2026-11-20: the owner used P0 in the dev app, found the three tabs clunky and asked for the
  character-first flow (above). Being built on `macro-flow`. No mockup first this time: the owner's
  word was "build A, B, and C".
- 2026-11-20: the character-first flow is built (`src/shared/macros/layouts.ts`, `buttons.ts`,
  `history.ts`; `ButtonGrid`, `ButtonPanel`, `MacroPicker`, `LayoutsMenu`; `GameFileSend` is now
  the bottom bar; `SetsSection` deleted). 81 macro unit tests. **Not yet seen on screen.** Nothing
  under `src/main`, the preload or the send and backup logic changed.
  - A character's own layout is the set `chosen[fileKey]` points at (`isCharacterLayout` is the one
    rule); every other set is a saved layout. Data saved by the three-tab screen still loads: a
    set chosen for a character becomes that character's own and takes its name; a second character
    pointing at the same set gets a copy.
  - Page 1 macros in a file are not put in a layout (a send leaves page 1 alone). A page above 10
    or a button above 12 that a file holds is shown as an extra page or button.
  - "Change only here" keeps the macro's name, so nothing shows as changed until it is edited.
  - Most likely to misbehave, none tried: Ctrl+Z / Ctrl+Y outside a text box (the app's Edit menu
    may take the keys; the buttons do not depend on it), native drag and drop on the buttons
    ("Move to..." is the fallback), the bottom bar staying pinned, the name box taking focus on
    "New macro".
  - Not built: scrolling to the editor on a narrow window; a per-page marker of where the changes
    are; a one-click put-back on a "removed" button.

