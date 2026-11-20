# Screens opened headlessly: what was found (2026-11-19)

The day's fixes changed many screens and the fix agents were not allowed to open the app. Each
screen was then driven in the hidden e2e window by a probe (text, rectangles, clipping, what covers
what, at the default window, at 900x600 and at 125% text) and every reported defect was re-checked
against the code by a skeptic on another model. This file lists what was reported and how it was
judged. NOTHING HERE IS FIXED YET. The probe scripts are on the local branch `ui-probe`
(tests/e2e/zz-probe-*.mts, never merged); the full evidence and each fix plan are in
`.claude/worktrees/_handoff-2026-11-19/data/ui-probe-so-far.json`; the fix workflow that was ready
to run is `scripts/ui-fix-wf.js` in the same folder.

- Screens probed: 8 of 12 (Preferences: left menu row height and text size; Skills tab; Timers:
  respawn pre-alert control and the edit dialog; Settings recovery notice; Plane of Sky: Cleanup
  hand counts and turn-in controls; Combat: DPS chart, header, Copy; Gear: Void motes tab; Bazaar
  watches and Buffs captions). Not probed: the log archive card (its probe was interrupted),
  Achievements and Factions, the "Reading log..." box and band, Maps and Wiki Gaps.
- Defects reported: 55. Confirmed and fixable as proposed: 21. Confirmed, but the fix is a choice of
  wording or behaviour for the owner: 16. Refuted: 4. Not yet re-checked when the pass was stopped:
  14.
- Also found by the pass, outside any one screen: the engine's typed wire message drops `sharedName`
  from a respawn watch (`RespawnWatch` in `protocol/schema/messages.schema.json` has no such
  property; the fold reads it from raw JSON, so its own tests pass). The same gap may exist for
  other fields a define sends: compare each define's schema with what the app sends before trusting
  a fold-level test.

## Preferences: left menu row height and text size

- NOT RE-CHECKED [low, cosmetic] The feedback row's second line wraps to two lines whenever the menu
  has a scrollbar Seen: nav-feedback .MuiListItemText-secondary 'Off in the community build': ink
  142.9px wide on 1 line in a 150px box when there is no scrollbar (147px box at 16px text). With
  the 12px scrollbar the box is 138px (135px at 16px text) and the ink becomes 112.9 x 31.6, two
  lines. The row grows from 41.8 to 57.4px (14px text), ...
- REFUTED [low, cut-off] At 110% in-app text size the shipped menu no longer fits the default
  window: a scrollbar appears and the version line is pushed off the foot Seen: Drawer 742px tall,
  menu scrollHeight 761: 19px over, 12px scrollbar. The miss is 3.4px before the feedback line wraps
  (745.4 against 742); the wrap adds the other 15.6. With the drawer at its top all 24 rows are in
  view but the version line 'v45.1.0 · updates off (dev)' ends 19.2px past the drawer's foot (it is
  30.8px ... Verdict: I accept the numbers. They follow from how the app works, and I can't find a
  defect in them. (1) In-app text size is webContents.setZoomFactor (src/main/windows.ts:350). At
  110% every CSS px is 1.1 screen px, so the drawer's height in CSS px drops by about 9%. The menu
  has 74px ...
- CONFIRMED, OWNER [low, confusing] The card's note says 'the text size above' when the only text
  size above it is its own Text size row Seen: Search 'sidebar': cards in order: Left menu@200 only;
  'In-app text size card on screen above it: false'. The note still reads 'This sizes the left menu
  only; the text size above still scales it.' The nearest thing called text size above the sentence
  is the card's own 'Text size 14px' row, two rows up, so the sentence ... Verdict: Confirmed from
  the code. The note in NavMenuSetting.tsx:60 is fixed text: "This sizes the left menu only; the
  text size above still scales it." It sits two rows under the card's own row labelled "Text size"
  (:37). The control it means is the separate "In-app text size" card ... Fix
  (src/renderer/src/features/preferences/NavMenuSetting.tsx line 60 (the pref-nav-note caption)):
  Change one string: name the other control instead of pointing "above" at it. For example: "This
  sizes the left menu only. In-app text size scales it too." That stays true when the card shows
  alone in search, and it can't be read as meaning the card's own Text size row. It uses no dash.
  Nothing else changes: no layout, no keywords, no stepper. The wording is the owner's call. Test:
  Add a source-reading unit test in tests/uiScale.test.mts, which already reads these source files
  and pins navMenuItem(SIZE_WORDS). Read NavMenuSetting.tsx, take the pref-nav-note caption text,
  and assert three things: ...
- NOT RE-CHECKED [low, missing] Searching Preferences for 'row height', the label printed on the
  card, finds nothing Seen: Query 'row height' (and 'Row height'): 'Left menu card NOT SHOWN; cards
  in order: none'. 'row' alone and 'height' alone each show the card; 'text size' shows it. Also not
  found: 'taller', 'menu size'. The search is a substring test of the whole query against label plus
  keywords, and the keywords hold 'rows row spacing ...
- NOT RE-CHECKED [low, cut-off] At 150% text size in the minimum window the card's two labels
  disappear, leaving two unlabelled steppers Seen: 'Text size' label box 0px wide holding 51px of
  text; 'Row height' label box 0px wide holding 70px (white-space nowrap, overflow hidden,
  text-overflow ellipsis, so nothing of either is drawn). Steppers at x 448.7..560.7, 0.7px past the
  card's right edge at 560. The note wraps to 4 lines. At 125% minimum the boxes are ...
- CONFIRMED [low, confusing] Stepping to the end of a ladder with the keyboard drops focus out of
  the card Seen: Enter x7 from 28px: 32px, 36px, 40px with focus on BUTTON[pref-nav-row-plus], then
  at 48px the button disables and document.activeElement becomes BODY; further Enter presses do
  nothing and Tab starts again from the top of the window. This is the shared PrefStepper, so the
  other steppers on the page behave the same; ... Verdict: Confirmed with my own probe,
  tests/e2e/zz-probe-verify-nav-menu-1.mts. With focus on pref-nav-row-plus, Enter goes 28 -> 32 ->
  36 -> 40 -> 48px. On the press that reaches 48, document.activeElement becomes BODY, with
  document.hasFocus() still true, so this is not the hidden ... Fix
  (src/renderer/src/features/preferences/PrefStepper.tsx (the shared stepper, so the fix covers
  every stepper on the page)): Keep the disabled ends (decided in JOS-408) and move focus to the
  other button of the same stepper when a press lands on an end: 1. Add a ref to each IconButton:
  minusRef, plusRef. 2. In each onClick, note whether the clicked button has focus: `pending.current
  = document.activeElement === e.currentTarget ? 'plus' : null` (or 'minus'), then call onStep. 3.
  Add a useEffect on [atMin, atMax]. If pending is 'plus' and ... Test: Only the running app can
  show focus, and the repo's unit tests run plain node with no DOM. So this is an e2e check: add a
  step to the spec that already opens Preferences > Appearance, such as ...

## Skills tab

- FIXED 2026-11-19 (with the tab line every other tab uses, `LogReadInline`, not the constant proposed
  below) [medium, missing] While the log is still being read, the Skills tab shows no rows and
  does not say it is reading Seen: From t+1.6 s to t+9.5 s after launch:
  window.eq.getModuleSnapshot('skills') === null; [data-testid="skills-view"] innerText is exactly
  "Skills/nTradeskills only/nSkills appear here once the log shows them going up."; no
  [data-testid="skills-table"], no [data-testid="skills-empty"]; /Reading/ matches nothing in ...
  Verdict: The code confirms it and so did a re-run. In src/shared/skills.ts lines 79-82,
  skillsEmptyText returns null when the snapshot is null, and tests/skills.test.mts line 83 pins
  that. SkillsView.tsx lines 125-130 then draws neither the table nor the skills-empty line. While
  the ... Fix (src/shared/skills.ts skillsEmptyText (lines 75-82), plus its unit test in
  tests/skills.test.mts (line 83). ...): Add an exported constant SKILLS_READING_TEXT = 'Reading
  log...', the words the Combat and Overview panels use (CombatView.tsx line 68, OverviewView.tsx
  line 106). Change skillsEmptyText so that a null snapshot returns SKILLS_READING_TEXT instead of
  null. Rows on screen still return null, and a loaded snapshot with no rows still returns
  NO_SKILLS_TEXT or NO_TRADESKILLS_TEXT. Update the function's doc comment ("null ... Test: Unit
  test in tests/skills.test.mts: replace assert.equal(skillsEmptyText(null, 0), null) with
  assert.equal(skillsEmptyText(null, 0), SKILLS_READING_TEXT). Also assert that the text matches
  /^Reading log/ and contains no ...
- NOT RE-CHECKED [low, cut-off] At the minimum window with larger text, the list scrolls sideways
  and the right-hand columns are cut off Seen: 125%, long names (probe 1 step 8): the list box has
  scrollWidth 444 against clientWidth 412; the table is 444.4px wide in a box whose visible right
  edge is x=664; the "Last raised" cell text runs 606.1..680.4, so 16px of every date is outside the
  box until the list is scrolled sideways. 125%, real log with short names ...
- CONFIRMED, OWNER [low, cosmetic] At the minimum window every row is two lines tall once a long
  skill name is in the list Seen: Table 592px wide, no sideways scroll, nothing cut. Every one of
  the 47 rows is 53px tall instead of 33px because the Last raised text wraps (text box 39px tall:
  "11/19/2026," over "7:09:09 PM"); the headings "This session" and "Per hour" wrap too (header 61px
  instead of 37px); "Specialize Transmutation" and ... Verdict: 1. The report is real, and I
  reproduced it with real game skill names only. The reporter's "Specialize Transmutation" is not an
  EQ skill, so I left it out. My probe is tests/e2e/zz-probe-verify-skills-1.mts in the ui-probe
  worktree. 2. Short names only, 900x600 at 100%, dates ... Fix
  (src/renderer/src/features/skills/SkillsView.tsx: SkillRowLine (lines 56-63) and the SkillsTable
  header cells (lines ...): Smallest fix: add sx={{ whiteSpace: 'nowrap' }} to the four
  right-aligned cells in each body row (Level, This session, Per hour, Last raised) and to their
  four header cells. Only the Skill name may then wrap. Expected widths at 900x600 and 100%: the
  Skill column at the width of its longest word (about 112px) plus about 64+107+86+187 for the
  others comes to about 556px, which fits the 592px table. Short-name rows go ... Test: Only the
  running app can show table layout, so this needs an e2e check: add a step to the Skills e2e (or to
  text-size.e2e.mts beside stepNavMenu). 1. Stage raises for real names including "Percussion
  Instruments", plus ...

## Timers: respawn pre-alert control and the edit dialog

- FIXED 2026-11-19 (branch `two-screen-bugs`) [high, broken] "Several mobs share this name" does nothing: the box never ticks and the
  estimate never changes Seen: Click on the label of [data-testid="respawn-edit-shared-name"]:
  window.eq.getRespawn() shows {key:"a wan ghoul knight", sharedName:true} within 300 ms, but the
  input's checked stays false at +300 ms, +1 s, +2 s, +4 s, +6 s, after Close and reopen, and after
  a second click (which re-sends true, so the player cannot ... Verdict: Confirmed in the code and
  again in the running app. The switch is a decided feature that is supposed to work
  (BRANCH_NOTES.md:636-643, owner 2026-11-09: the switch writes on the click and the row carries
  sharedName). It fails because the engine's typed wire struct drops the ... Fix
  (protocol/schema/messages.schema.json ($defs.RespawnWatch, line ~1343), then the generated ...):
  Add an optional boolean property "sharedName" to RespawnWatch in messages.schema.json, with a
  description like "Several mobs share this name: estimate from gaps of ten minutes or more only.
  Absent means off." Leave it out of required. Run npm run gen:protocol so generated.rs gains
  `#[serde(rename = "sharedName", default, skip_serializing_if = "Option::is_none")] pub
  shared_name: Option<bool>`. Set shared_name: None ... Test: 1) Unit/integration test at the
  engined level (engine/crates/engined/tests, using the harness): send respawn.define with watches
  [{key:"a vis ghoul knight", display:..., sharedName:true}], then read the respawn module ...
- FIXED 2026-11-19 (the note is on its own line under the box; measured by
  `tests/e2e/respawnAlertNoteSteps.mts`) [medium, cut-off] When the "No alert will play" note shows, the seconds field is
  squeezed and its label "Seconds (5-300)" is cut off Seen:
  .MuiTextField-root:has([data-testid="respawn-alert-lead"]) is 132 px wide with no note; with the
  note it is 85.5 px (900x600 100%, deleted), 103.6 px (1280x860 125%, deleted), 78.6 px (900x600
  125%, off), 55.6 px (900x600 125%, deleted). Its label (white-space nowrap, overflow hidden,
  text-overflow ellipsis) measures ... Verdict: I re-ran tests/e2e/zz-probe-respawn-alert-2.mts and
  got the reporter's numbers exactly. With the alert deleted at 900x600 and 100%, the seconds field
  is 85.5 px wide and its label measures 114/82. With the alert switched off at 900x600 and 125%,
  the label measures 114/72. With ... Fix (src/renderer/src/features/timers/RespawnAlertControl.tsx,
  lines 48 to 83 (the row Stack, the FormControlLabel sx, the ...): Smallest fix, matching the
  requirement's "a note under the box": make the outer element a column Stack (spacing 0.5,
  alignItems flex-start). Its first child is the existing row Stack holding the checkbox and the
  field. Its second child is the note Typography, rendered only when note !== null. Also add
  flexShrink: 0 to the FormControlLabel sx ({ mr: 0, flexShrink: 0 }) and to the TextField sx ({
  width: 132, ... Test: Only the running app can show this. No pure function decides the layout, and
  respawnAlertSilentNote's words are unchanged and already unit-tested. Add an e2e check to
  tests/e2e/respawn-timers.e2e.mts: 1. Answer the ...
- REFUTED [low, confusing] Save stays greyed out, with a green reading, when the number in force is
  retyped Seen: Field cleared and "3m" typed again, or "3m " typed: reading shows "= 3m 00s" in the
  success colour and Save is disabled; "180" and "3m 00s" enable Save for the same number. On the
  typed row "12m" keeps Save disabled and "720" enables it. Nothing on the dialog says why Save is
  unavailable or that the number must be ... Verdict: The evidence is accurate, but what it
  describes is a design decided and tested today, and no sentence on screen is untrue. In
  src/shared/respawnEdit.ts:14-26, respawnDraftToSave returns null when the trimmed typed text
  equals the prefill. The doc comment explains why: saving the ...
- CONFIRMED [low, untrue-words] The note names "Respawn timer ending" when the switched-off alert
  has another name Seen: [data-testid="respawn-alert-silent"] reads: No alert will play: "Respawn
  timer ending" is switched off on the Alerts tab. The Alerts tab has no alert of that name in this
  state (store: [{id:probe-own-respawn, name:"Camp is about to pop", enabled:false}]). With that
  alert switched on the note leaves, as it should. Verdict: The code confirms it, and nothing in the
  docs records it as a choice. respawnAlertHeard (src/shared/respawnAlert.ts:60-68) matches by
  signal and says so on purpose: the player's own alert on the signal counts. But
  respawnAlertSilentNote (:71-75) always prints the fixed sentence ... Fix
  (src/shared/respawnAlert.ts (respawnAlertHeard and respawnAlertSilentNote), with the call at ...):
  Smallest correct fix: carry the name of the switched-off alert into the note. Change
  respawnAlertHeard to take Pick<AlertDef, 'enabled' | 'trigger' | 'name'> and return { state: 'ok'
  | 'off' | 'missing', offNames: string[] }, collecting a.name for each disabled alert on the
  respawnSoon signal. Alternatively keep the union and add a small helper,
  respawnAlertOffNames(alerts). respawnAlertSilentNote(on, heard, ... Test: Unit tests in
  tests/respawnAlert.test.mts on the pure functions. (1) respawnAlertHeard with [{name:'Camp is
  about to pop', enabled:false, trigger:{type:'app',signal:'respawnSoon'}}] returns 'off' with
  offNames ['Camp is ...
- CONFIRMED, OWNER [low, missing] A respawn alert that fired leaves "Recent fires (0)" and "No fires
  recorded yet." on its row Seen: Speech seam recorded "a wan ghoul knight in 20 seconds"; seconds
  later the seeded row's history button has aria-label "Recent fires (0)" and the opened panel reads
  "Recent fires No fires recorded yet." This is the named gap JOS-499 in main (it applies to every
  app signal), so it is known, but this alert is new today ... Verdict: 1. The code confirms it.
  src/main/ipc/alerts.ts:87-89 receives IPC.appFired and only returns. The comment above it marks
  this as a NAMED GAP (JOS-499): the engine has no `alerts.appFired` command, so a fire on an app
  signal never reaches the alerts module's history ring. ... Fix (Real fix: the engine alerts module
  (the per-alert history ring the `alerts` module snapshot serves), a new protocol ...): Option A
  (closes JOS-499 for every app signal): 1. Add an `alerts.appFired {alertId, context}` command to
  the engine protocol. 2. The engine alerts module pushes a fire record (ts, context) onto that
  alert's history ring, using the same shape event fires use, and emits the module delta. 3. In
  main, the IPC.appFired handler forwards the payload through engineRequest when the engine is
  serving, and drops it otherwise. ... Test: Option A: 1. A Rust test in the engine alerts module:
  after `alerts.appFired {alertId:'respawn-soon', context:'a wan ghoul knight - open +0'}`, the
  module snapshot's history['respawn-soon'] holds one record with that ...
- CONFIRMED, OWNER [low, untrue-words] "60 running in other zones" when 70 watched clocks are
  running there Seen: [data-testid="respawn-empty"]: "No clocks in Befallen. 60 running in other
  zones."; scope switch "BEFALLEN (0) ALL ZONES (60)"; All zones draws 60 rows; eq.getRespawn()
  holds 70 watches. Back in the zone the switch reads (70)/(70). The cap on other zones' rows is
  decided (commit f7838624d); only the count printed is ... Verdict: The code confirms it without a
  re-run. TimersView.tsx:501 passes elsewhere = snap.rows.length - hereRows.length, and the scope
  switch total at line 481 is snap.rows.length. snap.rows is capped for other zones in two places:
  respawn.rs collect (`standing || elsewhere < ... Fix
  (src/renderer/src/features/timers/TimersView.tsx: the ClocksPanel empty sentence (line 270) and
  the ScopeSwitch total ...): Smallest correct fix, renderer only, no snapshot change: add a pure
  function in src/shared/respawn.ts, e.g. otherZoneCountLabel(n) returning `${n}` when n <
  RESPAWN_MAX_ROWS and `${RESPAWN_MAX_ROWS} or more` when n >= RESPAWN_MAX_ROWS. Those words stay
  true at exactly 60 too. In ClocksPanel, use it in "No clocks in X. {label} running in other
  zones." In ScopeSwitch, when the other-zone row count reaches the cap, ... Test: Unit test
  (tests/respawnRowCapWords.test.mts or next to tests/respawnJoinRowCap.test.mts) on the pure label
  function: 0, 1, 59 print the plain number; 60 and 61 (and 70) print "60 or more"; the result never
  contains an ...

## Settings recovery notice

- FIXED 2026-11-19 (the offset is said per breakpoint; measured by
  `tests/e2e/settings-recovery-notice.e2e.mts`) [medium, overlap] The card sits 24 px from the top, not the 56 the component asks for,
  so it is drawn over the bottom 16 px of the title bar Seen: Computed top of
  [data-testid="settings-recovery-notice"] is 24px. Two rules match its class .css-1pbq11k: `top:
  56px` with no media, and `top: 24px` inside `@media (min-width: 600px)`; the media rule wins at
  every reachable width (the narrowest is 600 CSS px, at 150% in a 900 px window). Card rect y 24,
  title bar rect ... Verdict: I confirmed it with my own probe. MUI 7.3.11's Snackbar root sets
  `top: 8` with `[breakpoints.up('sm')]: { top: 24 }` for a top-anchored snackbar
  (node_modules/@mui/material/Snackbar/Snackbar.js lines 58-60). Emotion/stylis writes the
  component's plain `top: 56px` from sx into ... Fix
  (src/renderer/src/components/SettingsRecoveryNotice.tsx line 32, the Snackbar's `sx={{ top: 56
  }}`): Give the offset at the same breakpoint MUI uses, so it comes after MUI's own media rule and
  wins: `sx={{ top: { xs: 56, sm: 56 } }}`. The longhand `sx={{ top: 56,
  [theme.breakpoints.up('sm')]: { top: 56 } }}` also works. 56 is the 40 px title bar (TitleBar
  BAR_HEIGHT) plus a 16 px gap, so a short comment tying it to BAR_HEIGHT would keep the two from
  drifting apart. No wording change. Test: Only the running app can show this, because the fault is
  how CSS rules combine; a unit test of settingsRecoveryNotice() cannot catch it. Add an e2e spec
  (the catch_all row already notes there is none). Stage a cut-off ...
- FIXED 2026-11-20 (the card is above the first-run strip and never taller than the window;
  `settings-recovery-notice.e2e.mts` clicks OK at 150%) [low, overlap] At 150% text in the minimum window the first-run notice is drawn over the
  card's OK button and the end of the path Seen: Card rect y 24..341.8 (317.8 px of a 400 px tall
  viewport, 10 lines of text). First-run notice rect y 280..376, same x range 147..441: 61.8 px
  shared. OK button rect 197..261 x 297.7..327.8 lies wholly inside the first-run notice;
  document.elementFromPoint at its centre returns P.MuiTypography-body2 inside ... Verdict: I re-ran
  zz-probe-settings-notice-1.mts in the backupold state and got the reporter's numbers exactly. At
  900x600 and 150% text the viewport is 600x400 CSS px. The card spans y 24..341.8 and the first-run
  strip spans y 280..376, over the same x range 147..441. Both Snackbars are ... Fix
  (src/renderer/src/components/SettingsRecoveryNotice.tsx (the Snackbar's sx and the Alert's sx
  only). No change to the ...): All changes are in SettingsRecoveryNotice.tsx. 1. Make the top stick
  at every width: put top:56 inside the sm breakpoint as well (sx={{ top: { xs: 56, sm: 56 } }}, or
  a more specific selector) so MUI's top:24 no longer wins. The card then really sits under the 40
  px title bar. 2. Stop the half-window squeeze: give the Alert width: 'min(520px, calc(100vw -
  32px))', or anchor the Snackbar with left/right 16 and ... Test: Only the running app can show
  this, so write an e2e spec, tests/e2e/settings-recovery-notice.e2e.mts. Stage a cut-off live store
  plus a v13 backup with no telemetry key (the probe's backupold staging) and a long ...
- FIXED 2026-11-20 (the card spans the content column, up to 520 px) [low, cosmetic] The card is only half the window wide, so it never reaches its 520 px in
  a window under 1040 CSS px and the path breaks over 3 to 4 lines Seen: Alert max-width is 520px,
  but the measured card width is the viewport's half minus the gutter: 444 at 900 px (card x
  222..666 while the content area runs to x 888), 354 at 125% (viewport 720), 294 at 150% (viewport
  600), 506 at 1280x860 at 125% (viewport 1024). The Snackbar is `left: 50%` with `translateX(-50%)`
  ... Verdict: Confirmed in the code and on the hidden app. MUI 7's Snackbar
  (node_modules/@mui/material/Snackbar/Snackbar.js lines 96-104) gives a top/center anchor `left:
  50%; right: auto; transform: translateX(-50%)` inside `@media (min-width:600px)`. A fixed box with
  left 50% and right ... Fix (src/renderer/src/components/SettingsRecoveryNotice.tsx lines 29-33
  (the Snackbar sx). The same ineffective pattern is ...): Restate the overrides inside the sm
  breakpoint so they come after MUI's own media rule. Keep `maxWidth: 520` on the Alert; the
  Snackbar's flex `justifyContent: center` keeps the card centred: sx={(theme) => ({ top: 56, left:
  16, right: 16, transform: 'none', [theme.breakpoints.up('sm')]: { top: 56, left: 16, right: 16,
  transform: 'none' } })} Raising specificity with `'&&': { ... }` also works. The card is then ...
  Test: Only the running app can show this (it is CSS cascade), so add an e2e check to the notice's
  missing spec. Stage a cut-off everquest-companion-progress.json, launch, wait for
  [data-testid="settings-recovery-notice"], and ...
- FIXED 2026-11-20 (the card starts at the menu's right edge; measured at 100, 125 and 150%) [low, overlap] At 125% and 150% text in the minimum window the card is drawn over the
  right edge of the left menu and hides the Stats group's arrow Seen: Left menu rect x 0..220. Card
  left edge is 177 at 125% (43 px over the menu) and 147 at 150% (73 px over). The expand arrow of
  [data-testid="nav-group-stats"] (svg box 179.2..199.2 x 84..104, 20x20) is fully under the card at
  both sizes. The right 30 px (125%) or 60 px (150%) of the rows nav-overview, nav-combat, ...
  Verdict: I re-ran the reporter's probe (zz-probe-settings-notice-2.mts, launch A: a cut-off
  settings file and no backup) and got the same numbers. In the 900x600 window, which is the app's
  minimum (windows.ts minWidth 900, minHeight 600), the Alert's box is x 177..531 at 125% and x ...
  Fix (src/renderer/src/components/SettingsRecoveryNotice.tsx, the Snackbar's sx (lines 29 to 34),
  importing DRAWER_WIDTH from ...): Centre the card over the content column instead of the window.
  Keep the top-centre decision, but measure it from the right of the menu. The values must beat
  MUI's `breakpoints.up('sm')` rule for top, left, right and transform, which plain sx loses to
  (this is why top 56 renders as 24 today). So raise their specificity, for example: sx={{ '&&': {
  top: 56, left: DRAWER_WIDTH + 16, right: 16, transform: 'none', ... Test: Only the running app can
  show layout, so this needs an e2e check, not a unit test. Add a spec, for example
  tests/e2e/settings-recovery-notice.e2e.mts: 1. Write a cut-off everquest-companion-progress.json
  into a fresh ...

## Plane of Sky: Cleanup hand counts and turn-in controls

- CONFIRMED, OWNER [medium, untrue-words] The '+' hover says the items are subtracted, but under
  Both with an inventory export loaded nothing is subtracted Seen: [data-testid=posky-record-turnin]
  title = 'Record another turn-in. The items it required are subtracted, so the quest goes back to
  what you hold toward running it again.' Pressing it: Azarack Skin 1/1 -> 1/1 and Wind Rune Heda
  1/1 -> 1/1 (the rune was looted after the dump), and the row then shows 'Turned in' beside ...
  Verdict: I re-ran the probe and it confirms the report. Under 'both' with a dump loaded, the '+'
  hover reads 'The items it required are subtracted, so the quest goes back to what you hold toward
  running it again.' Pressing '+' leaves skin at 1/1 and rune at 1/1, and the row then shows ... Fix
  (src/renderer/src/features/inventory/countSource.ts (recordTurnInTitle, turnedInHover; perhaps
  ...): The owner chooses first: either the wording or the behaviour. (a) Wording only, the smallest
  change and the one the audit leaned toward. Give recordTurnInTitle and turnedInHover a second
  argument, exportLoaded: boolean. For 'both' with an export loaded, return a sentence that is true
  item by item. Example: 'Record another turn-in. Items your log counts are subtracted; items your
  export holds stay until you export ... Test: A unit test in
  tests/skyRecordedTurnInCounts.test.mts, against the real reconcile through the existing
  held()/moves() helpers. 1. Check that moves('both', true) is false: a dump of 5 vouches for the
  item and the '+' ...
- FIXED 2026-11-19 (re-checked in the code: the commit dropped an out-of-range count and closed the
  box; the box now stays open and says "Whole number, 0 to 99,999", `handCountProblem`) [medium, confusing] Typing 100000 (or -5) in the pencil box and pressing Enter
  closes the box, changes nothing and says nothing Seen: Input value '100000': validity.valid true,
  validationMessage '', aria-invalid 'false', no max attribute (min=0, step=1). After Enter: editor
  gone, row still 'x3' (or 'x99999 By hand: 99999'), tab text byte-identical before and after, no
  .MuiFormHelperText-root, no role=alert or status besides the caveat. '1e5' and ...
- FIXED 2026-11-19 (the line is now the first thing inside the list's scroller; `sky-cleanup.e2e.mts`
  step 4b checks it) [medium, cut-off] The hidden-chip line has no height limit and takes the list's room: 30
  zeroed items leave less than one row at the minimum window Seen:
  [data-testid=posky-cleanup-hand-hidden] sits above the scrolling list, outside it. 900x600, 30
  chips: line 7 lines / 188 px (y268-456); list box top 472, bottom 584 = 112 px for 23600 px of
  rows; the count line (20 px) and table head (36.5 px) take 64 of those, rows are 79 px, so no
  whole row shows. The page itself ... Verdict: I re-ran zz-probe-sky-cleanup-6.mts and got the
  reporter's numbers exactly. At 1280x860 the list box shrinks from 596 px with no hand counts to
  532 px with 8 zeroed, 504 px with 16 and 448 px with 30. At 900x600 with 30 zeroed, the chip line
  is 7 lines (188 px, y268-456) and the ... Fix (src/renderer/src/features/posky/CleanupList.tsx, in
  the default-export CleanupList's return: the `<HandHiddenLine ...): Smallest correct fix: move the
  HandHiddenLine element so it is the first child inside the `<Box sx={{ flexGrow: 1, overflow:
  'auto' }}>`, before the `rows.length === 0 ? ... : ...` branch. Then it scrolls with the count
  line and the table, and it shows in both branches (the empty-list message and the table). The list
  box then always gets all the height left under the caveat and the control row, whatever the number
  ... Test: Only the running app shows this, so it needs an e2e check. Add it to
  tests/e2e/sky-cleanup.e2e.mts near step 4b, which already zeroes a row with the pencil and takes
  it back. With at least one row zeroed, check that ...
- FIXED 2026-11-19 (the list keeps a 240 px floor and the page scrolls; measured by
  `tests/e2e/sky-quests-min-window.e2e.mts`. Seen while measuring and NOT fixed: at 900x600 the quest
  list also scrolls sideways, at 100% and at 125% text) [medium, broken] At the minimum window the Quests tab leaves the quest list 54 px, and
  at 125% text 0 px: the '+', '-' and the row's pencil cannot be clicked Seen: 900x600: column 528
  px = tabs 36 + filter bar 270 + counts row 76 + achievements line 15 + list 66 (scroll box
  clientHeight 54 for 512 px of content). Real clicks on '+', '-' and the pencil work only after
  scrolling inside that 54 px box. 900x600 at 125%: the list scroll box has top 709 = bottom 709
  (clientHeight 0) ... Verdict: I re-measured it with my own probe
  (tests/e2e/zz-probe-verify-sky-cleanup-1.mts) and the numbers match the report. On Sky > Quests
  with one quest expanded, the tab column is a flex Stack set to height:100%. Its last child is
  QuestList's scroll Box (QuestList.tsx line 182, sx { ... Fix
  (src/renderer/src/features/posky/QuestList.tsx (the scroll Box at line 182, sx { flexGrow: 1,
  overflow: 'auto' }). That ...): Smallest fix: give QuestList's scroll Box a floor so it cannot
  collapse, e.g. sx { flexGrow: 1, overflow: 'auto', minHeight: 240 } (about one expanded quest's
  header plus its turn-in row and item table start; tune it to the 1280x860 at 125% value of 242).
  The PoskyView Stack already overflows into the content area's overflow:auto DIV, which measured
  scrollHeight 653 vs clientHeight 440 at 125%. So with the floor, a ... Test: Only the running app
  can show this, so it needs an e2e check in the nearest Sky spec, or in text-size.e2e.mts beside
  its 125% case. Steps: open Sky > Quests, search one quest, expand it. Narrow the window to 900x600
  ...
- NOT RE-CHECKED [low, confusing] The hidden-chip line can read 'Off this list by a count you set:
  Azarack Skin: 1', a count that would not take the item off the list Seen: Row 'Azarack Skin x1 By
  hand: 1'; after '+' on the quest (quest reads 0/1, 'Turned in x2') the Cleanup tab shows no row,
  summary chip '1 count set by hand', and the line 'Off this list by a count you set:' + chip
  'Azarack Skin: 1'. The number shown is the count stated, not the count now held (0); it was the
  turn-in ...
- FIXED 2026-11-19 (`handCountChipTitle` names the "Count items from" setting, not the witnesses) [low, untrue-words] The hand-count chip's hover says removing it goes back to 'the log
  and the export' under sources that read only one of them Seen: [data-testid=posky-item-override]
  title ends 'Remove this to go back to counting from the log and the export.' under all five
  sources. Removing it under Export only left 'no row' although the log had looted 5 skins by then
  (log not counted); under Log only it left x4 (the export's skin not counted). Verdict: The report
  holds up in the code. The OverrideChip hover in src/renderer/src/features/posky/ItemOverrides.tsx
  (line 74) is one fixed string: "...Remove this to go back to counting from the log and the
  export." The component never reads the count source, yet the number you get ... Fix
  (src/renderer/src/features/posky/ItemOverrides.tsx, the OverrideChip title. Move the words into a
  pure function beside ...): Smallest correct fix: replace the last sentence with one that is true
  under every source and does not name the witnesses, e.g. 'Remove this to go back to the count your
  "Count items from" setting gives.' No new prop is needed. That keeps the hover short, true in
  every state, and free of em and en dashes. To keep it testable, export the whole title from a pure
  function, e.g. handCountChipTitle(count, statedOnText), ... Test: Add a unit test, e.g. in
  tests/skyItemOverrides.test.mts or tests/skyRecordedTurnInCounts.test.mts. It asserts that
  handCountChipTitle(5, 'a date') names neither 'the log and the export' nor any single witness,
  ends by ...
- NOT RE-CHECKED [low, confusing] After Enter, Escape, the check or the X the keyboard focus is
  dropped to the page body Seen: On open document.activeElement is the input (focused: true). After
  Enter (7, 99999, 100000, blank, -5, 2.7) and after Escape, document.activeElement is BODY; the
  pencil button that opened the editor is not focused again, so a keyboard user starts from the top
  of the page.
- REFUTED [low, cut-off] The pencil's box is too narrow for its own largest number Seen:
  [data-testid=posky-item-count-input] input: clientWidth 68; scrollWidth 68 with '3' or '7', 70
  with '99999', 79 with '100000' (the number field's spin buttons take part of the 56 px text
  width). Verdict: The measurement holds, but no player would notice it or be misled. I re-measured
  with my own probe, tests/e2e/zz-probe-verify-sky-cleanup-73.mts (output saved as
  verify-73-pencilwidth.log in the sky-cleanup scratch folder). The box is 68 px wide on screen and
  set to 56 px in ...

## Combat: DPS chart, header, Copy

- CONFIRMED, OWNER [medium, untrue-words] The chart calls a stranger's damage 'group' when you are
  in no group Seen: Snapshot entity kind 'other:Zebuxoruk', roster {members: [], seen: false},
  roster popover 'No group signal yet this session - the Group scope is showing everyone.' The meter
  row reads '1 Zebuxoruk other 2.8k · 51 dps'. The DPS card beside it: legend 'you + pet + group' |
  'group', hover 'you + pet + group 92 dps' / ... Verdict: I re-ran
  tests/e2e/zz-probe-combat-chart-5.mts and got the same result. With an empty roster that has never
  seen a group signal (members [], seen false) and a stranger, Zebuxoruk, recorded as kind 'other',
  the meter row beside the chart says "Zebuxoruk other 2.8k · 51 dps". The ... Fix
  (src/renderer/src/features/combat/dashboardData.ts buildDpsSeries (track which kinds filled the
  band); ...): Smallest correct fix. (1) In buildDpsSeries, keep hasGroup as "the band has anything"
  so the line keys, colours and hide toggles stay the same. Add one field to DpsSeries, hasOther =
  true, when any e.kind === 'other' lands in the band. (2) In dpsAt.ts, export bandLabel(series) =
  series.hasOther ? 'others' : 'group'. The word itself is for the owner to choose ('others' is the
  reporter's suggestion; 'allies' is wrong ... Test: Unit tests in tests/dpsChartLines.test.mts (or
  a new small file if it is near the line ceiling). (a) buildDpsSeries on a TimelineView with you
  plus one kind:'other' event gives hasGroup true and hasOther true. With you ...
- CONFIRMED, OWNER [medium, confusing] Its own bar does not give a line for you alone once anyone
  else hits the mob, and the peak tooltip says only 'without your pet' Seen: Preferences hint: 'The
  DPS chart draws you and your pet as two lines.' On screen the gold line is 'you + group' (legend
  and hover), head '141 dps peak', peak tooltip 'Peak 5s rolling rate without your pet, in the
  visible window.' At 1:36 hover reads 'you + group 129 dps', 'group 70 dps': 70 of the 129 is the
  group ... Verdict: The evidence checks out against the code and the reporter's saved output
  (run2-g1.txt in the combat-chart scratchpad). Under 'separate', outRate (dpsAt.ts:26) still adds
  series.group, outLabel (:31) prints 'you + group', and peakTitle (:92-93) prints 'Peak 5s rolling
  rate ... Fix (src/renderer/src/features/combat/dpsAt.ts peakTitle (lines 89-95); test in
  tests/dpsChartLines.test.mts): Smallest fix that keeps the decided behaviour: peakTitle names what
  outRate actually sums when the pet is apart and the series has a group. For example:
  series.petApart ? (series.hasGroup ? `Peak ${secs}s rolling rate of you and your group, without
  your pet, in the visible window.` : `Peak ${secs}s rolling rate without your pet, in the visible
  window.`) : (unchanged). Use no em or en dash. The owner should also rule ... Test: A unit test in
  tests/dpsChartLines.test.mts on the pure functions. Build a DpsSeries with hasGroup=true, then:
  (a) withPetApart(series, true) gives a peakTitle that mentions the group and says 'without your
  pet'; (b) ...
- FIXED 2026-11-19 (both hover layers now take their rows from `rateRows` in dpsAt.ts) [medium,
  untrue-words] Timeline hover row 'you + pet' holds the group's damage too Seen:
  Timeline hover at 1:42: 'you + pet 59 dps', 'pet 0 dps'. The DPS card at the same 1:42: 'you + pet
  + group 59 dps', 'pet 0 dps', 'group 50 dps', so you + pet is about 9 dps and the Timeline prints
  59. At 1:35 the Timeline says 'you + pet 141 dps', 'pet 0 dps' while the card at 1:36 says 'group
  70 dps'. The Timeline ... Verdict: The code and the reporter's own output agree, and nothing on
  file refutes it. In src/renderer/src/features/combat/TimelineHoverLayer.tsx:106-112, dpsRows
  labels p.out as 'you + pet'. The series behind it is CombatTimeline.tsx:130, buildDpsSeries(tl),
  which puts every member, ... Fix (src/renderer/src/features/combat/TimelineHoverLayer.tsx,
  function dpsRows (lines 106-113). Also the bullet at ...): Build the timeline's rows the same way
  the DPS card does. Replace the body of dpsRows with `return curveRows(series, t, []).map((r) => ({
  label: r.label, value: r.value, color: ROW_COLOR[r.key] }))`, importing curveRows from './dpsAt'.
  Share the ROW_COLOR map (out: KIND_COLOR.you, pet: KIND_COLOR.pet, group: KIND_COLOR.member, inc:
  KIND_COLOR.enemy) with DpsCurveHoverLayer.tsx:86-91 by exporting it, or by moving it ... Test:
  Unit test in tests/timelineHitTest.test.mts, or tests/dpsChartHover.test.mts, on the pure function
  that makes the words. Move the row-making out of the TSX into dpsAt.ts as an exported function,
  for example ...
- CONFIRMED, OWNER [medium, confusing] A folded pet row prints a DPS the header over it contradicts
  (same damage, two rates), and Copy pastes both Seen: p2 e4: panel header 'a greater kobold (5) +2
  87 dps (act 104 dps)· 5.8k · 1:07' over its only row '1 You 5.8k · 172 dps' (172 = You 142 +
  Gonekn 30, each over its own clock; 5.8k over the 1:07 shown is 87). With its owner: pair box '172
  dps 5.8k'. Paste: 'Outgoing damage · 5.8k · 87 dps (act 104 dps)' then '1 You 5.8k ... Verdict: I
  reproduced it with my own probe, tests/e2e/zz-probe-verify-combat-chart-71.mts, on
  g1-group-lifecycle.log with the default 'Inside your bar' layout and the You scope. The panel
  header reads 'a ghoul sentinel +3 71 dps · 7.3k · 1:43' and its only row reads 'You ... 7.3k · 82
  ... Fix (Every place that adds a pair's rates: - src/renderer/src/features/combat/petRows.ts:
  combinedSelf (line 161, dps: sum ...): The owner rules first. meter-dps-clock.md does not say what
  a combined you + pet bar divides by. Suggested rule: one rate per pair, the pair's total over the
  pair's own clock. Smallest correct fix, for your own pair: 1. Thread the segment's selfSec into
  meterSources/meterPanel, as an optional argument. 2. In combinedSelf, set dps = total / max(1,
  selfSec) when selfSec > 0. Otherwise keep the summed fallback. 3. In ... Test: Unit tests, no e2e
  needed: 1. In tests/combatPetGroups.test.mts (or a new petRows test next to
  tests/meterScope.test.mts), build SourceViews self {kind 'you', total 4400, dps 43, ownSec 102}
  and pet {kind 'pet', total ...
- CONFIRMED [medium, cut-off] At 125% text in the default window the DPS card shows 86 px of its
  192: the legend is below the card's own fold and the hover readout is cut off Seen: Dashboard
  region y 161..440 (279 px) between the header and the fixed log (y 493..661). Four panels
  374x133.3. DPS card body: scrollHeight 192, clientHeight 86 (y 198.1..283.9, overflow auto); plot
  rect 198.1..316.1 (118 px), legend buttons at y 340..360 and '5s rolling' at 369.9, all outside
  the body box ... Verdict: The hover readout clip is real. The legend part is not a defect. I
  measured it with my own probe, tests/e2e/zz-probe-verify-combat-chart-1.mts, on
  g1-group-lifecycle.log. It scrolls the DPS card body to the top, the middle and the bottom, then
  hovers the plot each time. 1. ... Fix (src/renderer/src/lib/ChartTooltip.tsx, the shared tooltip
  that DpsCurveHoverLayer, TimelineHoverLayer, LevelHoverLayer ...): Smallest correct fix: stop
  rendering the tooltip inside the clipping ancestors. 1. Keep the model's x/y relative to the hover
  layer, as today. 2. In ChartTooltip, put a zero-size anchor span in the hover layer and read its
  getBoundingClientRect in the existing layout effect. 3. Render the card with react-dom
  createPortal into document.body, position:fixed, at anchorRect plus x/y. Plain DOM, so the overlay
  bundle can ... Test: Unit test, tests/chartTooltipPlace.test.mts, on the exported pure
  place(cursor, size, off, limit): 1. When the card fits after the cursor, it is placed at
  cursor+off. 2. When it does not fit after the cursor, it flips ...
- CONFIRMED, OWNER [medium, cut-off] At the 900x600 minimum window the dashboard is a strip: 42 px
  tall at 125% text, panels 89 px tall at 100% Seen: 125%: header y 56..178 (122 px now that the
  second row wraps; 94 px at 100%), log 285..453, dashboard region y 190..232 = 42 px tall with
  scrollHeight 1316 (four stacked 444x320 panels). The DPS card sits at y 522..842 of that scroller:
  no more than 42 px of any panel is ever visible at once. 100%: region 162..352, ... Verdict: I
  reproduced it with my own probe (tests/e2e/zz-probe-verify-combat-chart-47.mts,
  g1-group-lifecycle.log). The probe sets the size with setBounds on a frameless window, so the
  viewport is exactly the window divided by the zoom. 1. 900x600 at 100%: the header is 94 px and
  the log ... Fix (src/renderer/src/features/combat/CombatView.tsx: the tab's Stack (around line
  386) and DashboardGrid's sx (around lines ...): The smallest correct fix: 1. Give DashboardGrid a
  floor: minHeight about 300 px at md (two rows of about 145 px plus the gap) and 320 px at xs (one
  whole panel). 2. Change the tab Stack from overflow hidden to overflowY auto, so that only when
  header + floor + log exceed the window does the tab scroll and the log move below the fold. This
  keeps Task #56's rule. Every child still has a bounded height: the log stays ... Test: An e2e
  check, because only the running app can show the layout. Add it to a combat layout spec, or to
  text-size.e2e.mts, which already sets the scale. 1. Launch on a combat fixture, answer the notice
  and open Combat. 2. ...
- REFUTED [low, cut-off] At 900 px wide and 100% text, Group with no roster squeezes the note and
  the modifier pills to a letter or two Seen: '(no roster yet)' clientWidth 38 to 41 for scrollWidth
  75 (text-overflow ellipsis); modifier values 'Offensive' 14 of 51 px and 'Inversion' 13 of 50 px
  (pills 32 and 31 px wide, was 69 and 67). Hover titles hold the full text ('No group signal yet,
  so Group shows everyone', 'Modifier 1 - combat stance: offensive'). No ... Verdict: The
  measurements hold up. The default window is 1280 (windowState.ts:66), which is plenty wide. The
  cut only happens at the 900 px minimum (windows.ts:386; the window is frameless, so 900 is the
  real client width). Both the report's numbers and my own probe show the lens row ...

## Gear: Void motes tab

- NOT RE-CHECKED [high, cut-off] At the minimum width, and at 125% text, the table does not fit: the
  last columns are off to the side and rows grow up to 228 px tall Seen: 900 px, 100%:
  [data-testid="gear-motes-list"] scrollWidth 726 against clientWidth 622. "Copies come from" spans
  x733.4 to x962.9 and the visible area ends at x859, so 104 of its 229.5 px are hidden ("Camp: 1 in
  12, hard fight" is cut). The Next tier column is 91 px (367 px at the default window), so rows are
  74 to 228 ...
- NOT RE-CHECKED [medium, cut-off] The week's plan line is cut off and its hover does not give the
  text Seen: [data-testid="gear-motes-plan"] is one nowrap line with text-overflow ellipsis and
  title "Void-Touched Potential: three a week from raids, each skips a whole tier." Default 1280
  window, three +9 pieces: "This week: Lustrous Russet Vambraces +9→+10 · Gauntlets of Fiery Might
  +9→+10 · Earring of Disease Reflection ...
- FIXED 2026-11-19 (`wornKey` in itemsDb.ts: the worn item's key is the resolved record's own) [medium, untrue-words] A worn ring the app knows is called "not in the item data" and
  left out of the ranking Seen: The tab: "Not ranked: Djarn's Amethyst Ring +1 (not in the item
  data)". In the same launch: window.eq.lookupItem("Djarn's Amethyst Ring") returns page "Djarns
  Amethyst Ring" with its stats (AGI +9, HP +80); window.eq.gearIndex() holds a row with key "djarns
  amethyst ring"; window.eq.characterSheet() gives the cell { ... Verdict: The code bears the report
  out, and so does the reporter's own output (run-4.txt lines 4 and 5). 1. The worn host's key comes
  from the dump name only: src/main/ipc/planner.ts:157 does `key: itemKey(h.name)`, which gives
  "djarn's amethyst ring". 2. Gear rows are keyed by the ... Fix (src/main/ipc/planner.ts line 157
  (the plannerInventory handler), using itemDb() from src/main/itemLookup.ts. Also check ...): In
  the plannerInventory handler, resolve each worn name through the item DB index before building the
  key: `const rec = itemDb().get(itemKey(h.name)); key: rec ? itemKey(rec.name ?? rec.page) :
  itemKey(h.name)` This gives the record's own key, which is the one gearIndex rows use. Best to put
  it in a small pure helper in main, for example `wornKey(name, index)` in itemsDb.ts, so it can be
  tested. Then look over the ... Test: Unit test (new or in tests/voidMotes.test.mts): 1. Build an
  index with buildItemDbIndex from a small item file: record key "djarns amethyst ring", page
  "Djarns Amethyst Ring", otherNames ["Djarn's Amethyst Ring"]. 2. ...
- FIXED 2026-11-19 (the header row wraps and the plan line takes a zero basis; `gearVoidMoteSteps.mts
  stepGearVoidMotesNarrow` measures it) [medium, cut-off] At 900 px with 125% text the order buttons run out of the panel and
  the page scrolls sideways Seen: Header row scrollWidth 533 against clientWidth 454.
  [data-testid="gear-motes-order"] right edge 769.9; panel right edge 692; app-content right edge
  708. "Most hours saved" spans x663.6 to x767.9, so 44 of its 104 px are inside the content area;
  document.elementFromPoint at its centre returns null. app-content ... Verdict: I re-ran
  zz-probe-void-motes-2.mts and got the same numbers as the report. At a 900 px window with 125%
  text (720 CSS px, dpr 1.25), the Void motes header Stack measures scrollWidth 533 against
  clientWidth 454. The order group's right edge is at 769.9, past the panel (691.2) and ... Fix
  (src/renderer/src/features/gear/VoidMotePanel.tsx, the header Stack in VoidMotePanel (the row
  holding the "Void motes" ...): Add flexWrap="wrap" and useFlexGap to the header Stack, keeping
  spacing={1.5}. This is the pattern CombatHeader.tsx and combatShared.tsx already use. useFlexGap
  is needed because Stack spacing otherwise uses margins, which misalign once the row wraps. With
  the wrap, the picker and the order group drop to their own line when they do not fit, and the plan
  line keeps its noWrap ellipsis. Optionally add rowGap 0.75 so ... Test: Only the running app can
  show this, so it needs an e2e check, not a unit test. In tests/e2e/gearVoidMoteSteps.mts (run from
  gear.e2e.mts), after the Void motes rows appear: narrow the window to its 900 px minimum and ...
- NOT RE-CHECKED [low, untrue-words] The empty text claims everything is +10 when nothing known is
  worn Seen: Nothing worn: "Nothing you wear can go higher: every piece the item data knows is
  already +10." with 0 rows and no other line. Only unmatched pieces (22 of them, tiers +0 to +8):
  "Every worn piece the item data knows is already +10." above a not-ranked line naming all 22. In
  both no known piece is worn, so no piece is ...
- CONFIRMED, OWNER [low, untrue-words] Two header hovers do not match the rows, and a three-mote row
  mixes a three-tier arrow with one-tier numbers Seen: Item header hover: "A worn item, and the tier
  this week takes it to". 19 of 21 rows carry "-" (hover "Below +7: ordinary motes get it there")
  yet show an arrow, e.g. "Gauntlets of Fiery Might +5→+6": this week takes them nowhere. # header
  hover: "A number marks one of this week's motes; a dash is not yet": the number ... Verdict: I
  re-ran zz-probe-void-motes-1.mts and checked the code. All three parts of the report hold. 1. Item
  header. The `HEAD` hint at VoidMotePanel.tsx:78 says "A worn item, and the tier this week takes it
  to". But the tier text at line 175 (`+{tier}→+{tier + Math.max(1, picks)}`) is ... Fix
  (src/renderer/src/features/gear/VoidMotePanel.tsx: the `HEAD` hints at lines 77 and 78 and the
  tier text at line 175. To ...): Smallest correct fix that keeps every row true: (a) Make the Item
  cell always show the next tier, `+{tier}→+{tier+1}`, whatever the picks, so every column on a row
  describes the same single tier. The week's destination is already stated by the plan line ("This
  week: Thelvorn, Blade of Light +5→+8") and by the # count. (b) Item hint: "A worn item and its
  next tier". (c) # hint, saying what each mark means: "How many ... Test: Unit test, in
  tests/voidMoteEmptyText.test.mts or a new tests/voidMoteWords.test.mts, against voidMotePrefs.ts:
  1. `moteTierText(7, 0)` is "+7→+8". 2. `moteTierText(5, 3)` is "+5→+6" under option (a), or
  whatever the ...
- CONFIRMED, OWNER [low, confusing] The Saves hover counts "copies of experience", which overstates
  the copies for a dropped item Seen: Row "Drop of Crystallized Flame +7→+8": Saves hover "Without a
  mote: 128 copies of experience, mostly by farming copies", source "Camp: 1 in 2, 4.4 min respawn".
  The plan document prices a dropped copy at 16 experience (8 copies for this tier), and the source
  hover on the same row speaks in experience ("about 2165.414 ... Verdict: 1. The code matches the
  report. MoteAdvice.copies is expToNextTier(tier), which is 2^tier item experience
  (voidMotes.ts:111 and :239). moteHoursTitle (voidMotePrefs.ts:95-98) prints it as "<n> copies of
  experience". For +7 to +8 that reads "128 copies of experience, mostly by ... Fix
  (src/renderer/src/features/gear/voidMotePrefs.ts, moteHoursTitle (lines 94-98), plus the doc
  comment on moteCopiesText ...): Smallest fix: state the cost in the unit the source hover already
  uses. moteHoursTitle returns `Without a mote: ${advice.copies.toLocaleString('en-US')} item
  experience, ${road}`. Example: "Without a mote: 128 item experience, mostly by farming copies".
  Then remove moteCopiesText, or keep it only if the owner wants the copies wording. Alternative, if
  the owner wants the requirement's "copies": pass the supply kind ... Test: Unit test in
  tests/voidMotes.test.mts, next to the "tab words" test: 1. assert.equal(moteHoursTitle({ copies:
  128, road: 'copies' }), 'Without a mote: 128 item experience, mostly by farming copies'). 2. ...
- CONFIRMED, OWNER [low, confusing] With no list, the picker and the three order buttons are live
  and change nothing on screen Seen: With the text "No inventory dump for this character yet. Type
  /outputfile inventory in game." showing, the picker (aria-disabled null) and all three buttons
  (disabled null) are enabled. Pressing Biggest gain moves aria-pressed to it and no word on the tab
  changes. Verdict: The code bears the report out. In
  src/renderer/src/features/gear/VoidMotePanel.tsx, the header Stack draws <MoteControls> whatever
  list.length is, and the controls are never disabled. In the empty branch the only words are
  motes-free: the fixed plan line 'One lifts a worn item a ... Fix
  (src/renderer/src/features/gear/VoidMotePanel.tsx, the header Stack in VoidMotePanel (the line
  that renders ...): Smallest fix: render the controls only when there is a list: `{list.length > 0
  && <MoteControls motes={motes} setMotes={setMotes} />}`. The saved prefs stay in eq.gear.motes and
  come back when a dump arrives. If the owner would rather keep the header layout steady, pass a
  `disabled` prop through MoteControls to the TextField (disabled) and the ToggleButtonGroup
  (disabled), with the same list.length === 0 condition. ... Test: The decision is one condition
  inside the component, and no pure word-making function changes, so the check is e2e. In
  tests/e2e/gearVoidMoteSteps.mts, on the existing no-dump (or index-loading) launch, assert that
  ...
- CONFIRMED, OWNER [low, confusing] The gains depend on the Gear tab's class pick, and this tab
  never names it Seen: Target Tank, no class picked: Thelvorn +0.8, Lustrous Russet Boots +9.5, Ring
  of Pureblood +11.3, Polished Mithril Mask +7.1 above Lustrous Russet Bracer +8.7. After picking
  Wizard on the Gear tab and returning: +0.2, +9.2, +11.1, Mask +6.8 below Bracer. No text on the
  Void motes tab contains a class name or the word ... Verdict: The code confirms it.
  VoidMoteView.tsx line 28 reads the area's shared class pick (useGearClasses, key eq.gear.classes,
  the same pin the Gear and Plan tabs show as a picker). VoidMotePanel.tsx line 218 passes it into
  moteAdvice/motePlan. There roleValuer(target, { classes }) ... Fix
  (src/renderer/src/features/gear/voidMotePrefs.ts (a new pure word function) and ...): Add
  `moteClassesText(classes: readonly ClassAbbr[], target: MoteTarget): string` to voidMotePrefs.ts.
  It returns '' for a single-stat target, because classes do not change a stat's own points. For a
  role target with classes it returns e.g. "for WIZ" (or the full names joined, in the same spelling
  the Gear tab's picker uses). For a role target with no classes it returns "for any class", because
  the unknown gate ... Test: Unit: in tests/voidMoteEmptyText.test.mts (or a new
  tests/voidMoteClassesText.test.mts), call moteClassesText for three cases. (a) target 'tank' with
  ['WIZ'] contains the class. (b) target 'tank' with [] gives the ...

## Bazaar watches and Buffs captions

- FIXED 2026-11-19 (branch `two-screen-bugs`; a typo now stores nothing and the field reverts) [high, untrue-words] Bazaar: a watch price typed with a comma stays in the field but is
  not stored, so every price alerts Seen: Field input[data-testid=bazaar-watch-wts-max] still reads
  "12,500"; row chip reads "Watch: WTS"; stored entry wtsMax null. A live "Mira auctions, 'WTS
  Fleeting Quiver 20k'" then alerts: "Mira WTS Fleeting Quiver 20k (on your watchlist)" while the
  field still reads 12,500. Same for "1 500" and "abc". Typed over an ... Verdict: The code confirms
  the report, so I did not re-run the probe. I ran parsePlat directly on the trunk worktree. It
  returns null for "12,500", "1,500pp", "1 500" and "abc", and 12500 for "12500". Its regex
  /^/s*(/d+(?:/./d+)?)/s*(k|m|pp|p)?/s*$/i has no place for a comma. In ... Fix
  (src/shared/bazaar.ts parsePlat (line 472), and
  src/renderer/src/features/bazaar/BazaarWatchPanel.tsx PriceField onBlur ...): 1. In parsePlat,
  accept thousands commas the same way the chat parser does: only commas that group exactly three
  digits. Number part //d{1,3}(?:,/d{3})+(?:/./d+)?|/d+(?:/./d+)?/, with the commas stripped before
  Number(). Then "12,500" reads 12500, "1,500pp" reads 1500 and "1,500k" reads 1,500,000, while
  "1,50" and "12,5000" still read null. formatPlatExact never writes a comma, so its round trip is
  unchanged. 2. In ... Test: Unit tests in tests/bazaarWatch.test.mts. Expect parsePlat('12,500')
  === 12500, parsePlat('1,500pp') === 1500, parsePlat('1,500,000') === 1500000 and
  parsePlat('2,500k') === 2500000. Expect null from parsePlat('1,50'), ...
- NOT RE-CHECKED [medium, untrue-words] Bazaar: a tier's row chip and panel say nothing alerts on it
  while the every-tier watch does alert on it Seen: Row chip on bazaar-row-Fleeting Quiver|4 reads
  "Watch"; its panel reads Watch=on, Every tier=off, "Alert on WTS (someone selling)"=off, "Alert on
  WTB (someone buying)"=off. The box above lists "Tovi WTS Fleeting Quiver +4 25k (at or under your
  31k)". The 31k is shown nowhere on the +4 row or panel. With +4 set to WTB ...
- CONFIRMED, OWNER [medium, confusing] Bazaar: ticking "Every tier" on a tier's own watch silently
  replaces the existing every-tier watch and its prices Seen: Stored list before: [{tier 4, wts
  false, wtb false}, {tier null, wts true, wtsMax 31000}]. After the one tick: [{tier null, wts
  false, wtb false, wtsMax null}]. The +0 row's chip goes from "Watch: WTS ≤ 31k" to "Watch"; the +0
  panel shows "Alert on WTS" unticked. Nothing on screen says a price was dropped. Verdict: I
  confirmed this in the code and by re-running the probe. In BazaarWatchPanel.tsx, findWatch returns
  the tier's own watch before the every-tier one. The "Every tier" onChange (lines 57-60) runs
  remove(w.item, w.tier) and then put({...w, tier: null}). setWatch (bazaarWatch.ts ... Fix (Two
  places. src/shared/bazaarWatch.ts gets a new pure function.
  src/renderer/src/features/bazaar/BazaarWatchPanel.tsx ...): Add `setEveryTier(list, item, tier,
  every): BazaarWatchlist` to bazaarWatch.ts and make it the one place that decides. When every is
  true and an every-tier watch already exists on the item, remove the tier's own watch and keep the
  every-tier watch as it is. If the owner wants nothing lost, merge instead: each side comes from
  whichever watch has it on, and when both have it on, the every-tier watch's side and prices ...
  Test: Unit tests in tests/bazaarWatch.test.mts on setEveryTier. (1) The list [{tier 4, wts false,
  wtb false}, {tier null, wts true, wtsMax 31000}] with every=true gives exactly [{tier null, wts
  true, wtsMax 31000}], so the ...
- CONFIRMED [low, untrue-words] Bazaar: with "All tiers as one", the row chip and the panel show one
  tier's watch, not the every-tier watch Seen: Combined row text: "Fleeting Quiver 3 tiers at +4
  Watch: WTB". Panel: Watch on, "Alert on WTS" off, "Alert on WTB" on, "at or over" blank, and no
  "Every tier" box, so nothing says this is the +4 watch. Alerts in the same session fired on +0, +2
  and +4 sales "(at or under your 31k)". Verdict: I confirmed this in the code and by running the
  pure function. watchOnItem (src/shared/bazaarWatch.ts:132) returns the first watch on the item in
  list order. setWatch puts each new or edited watch at the end of the list. So if the +4 watch
  exists and the every-tier watch is ... Fix (src/shared/bazaarWatch.ts watchOnItem (line 132).
  BazaarView.tsx:354 and BazaarWatchPanel.tsx:42 need no change.): Smallest correct fix: have
  watchOnItem return the item's every-tier watch (tier === null) when there is one, and otherwise
  the first watch on the item. For example: const on = list.entries.filter(w => w.item.toLowerCase()
  === lower); return on.find(w => w.tier === null) ?? on[0] ?? null. Update the doc comment to say
  the every-tier watch comes first. The combined chip and panel then show and edit the watch that
  ... Test: Add a case to tests/bazaarWatch.test.mts: (a) setWatch a +4 watch {wtb:true}, then an
  every-tier watch {wts:true, wtsMax:31000, wtb:true, wtbMin:9500}. watchOnItem(list, 'fleeting
  quiver') returns the tier:null entry. ...
- CONFIRMED [low, untrue-words] Bazaar: the row chip names only the price when a price and a percent
  are both set Seen: Chip: "Watch: WTS ≤ 100p + WTB ≥ 9.5k". Heard: "Sela WTS Fleeting Quiver 9k
  (68% of the 7-day median 13k)". With 12500 and 80 the chip reads "Watch: WTS ≤ 12.5k"; with 80
  alone it reads "Watch: WTS ≤ 80% median". Verdict: The code confirms the report, so I did not
  re-run the probe. In BazaarWatchPanel.tsx the panel lets the player set both "at or under" and "or
  under % of 7-day median", and the second label says "or". wtsReason in src/shared/bazaarWatch.ts
  alerts when either test passes: a price ... Fix
  (src/renderer/src/features/bazaar/BazaarItemRow.tsx watchChipLabel (line 32-36). Move it into
  src/shared/bazaarWatch.ts ...): Build the WTS part from both thresholds instead of a ternary. Make
  a parts list: if wtsMax !== null, add formatPlatExact(wtsMax). If wtsShare !== null, add
  `${Math.round(wtsShare*100)}% median`. The WTS part is then parts.length ? `WTS ≤ ${parts.join('
  or ')}` : 'WTS', giving "Watch: WTS ≤ 12.5k or 80% median". The word "or" matches the panel's own
  field label and the either-one logic in wtsReason. Keep the WTB part ... Test: Unit tests in
  tests/bazaarWatch.test.mts on the exported watchChipLabel: (a) wts on, wtsMax 12500, wtsShare 0.8:
  expect 'Watch: WTS ≤ 12.5k or 80% median'. (b) wtsMax only: 'Watch: WTS ≤ 12.5k'. (c) wtsShare
  only: ...
- NOT RE-CHECKED [low, untrue-words] Bazaar: the percent field shows a typed 12.5 as 13 while 12.5%
  is what is stored Seen: After the last key the field reads "13", the chip reads "Watch: WTS ≤ 13%
  median", stored wtsShare is 0.125.
- NOT RE-CHECKED [low, untrue-words] Buffs: a card reads "- elapsed" for its first second Seen: Card
  text right after landing: "Jonthan's Whistling Warsong | message | - elapsed | ~4s left | log |
  n=1"; "Bounce | message | - elapsed | ~8s left | set | n=1"; "Flash of Light | message | - elapsed
  | ≥ 15s left | log | n=0". The next second it reads "1s elapsed". The left-hand caption was given
  "0s" today; the ...
- FIXED 2026-11-19 (`statCells` in buffs/format.ts prints the three cells with tenths) [low, untrue-words] Buffs Durations: the estimate reads 4.5s and the median beside it
  reads 5s for the same two casts Seen: Row: "Jonthan's Whistling Warsong ; 4.5s log ; 2 ; 5s ; 4s -
  5s ; 4s - 5s". Dialog: "From my log · 4.5s | The middle of your last five clean casts". The median
  column prints the same middle rounded to 5s. Verdict: I re-ran the reporter's probe and got the
  same result. With two casts (4 s and 5 s) and From my log saved, the row reads "4.5s log ; 2 ; 5s
  ; 4s - 5s ; 4s - 5s". The dialog says "From my log · 4.5s | The middle of your last five clean
  casts". Both numbers are the same 4500 ms. ... Fix (src/renderer/src/features/buffs/BuffStats.tsx,
  StatsRow, the median, IQR and min-max cells (lines ~152-157), and the ...): In the median, IQR
  (p25/p75) and min-max cells, replace fmtDuration with fmtPrecise, and import fmtPrecise in place
  of fmtDuration if nothing else in the file uses it. fmtPrecise already falls back to fmtDuration
  at a minute and above, and prints '-' for null or 0, so long buffs and empty cells look the same
  as now. Min and max come from whole-second timestamps, so their output does not change. The median
  and the ... Test: Unit test in tests/buffsFormat.test.mts. If the statCells helper is added: for
  {medianMs: 4500, p25: 4250, p75: 4750, minMs: 4000, maxMs: 5000} it returns median '4.5s', iqr
  '4.3s - 4.8s' and range '4s - 5s'; the median ...
- CONFIRMED, OWNER [low, untrue-words] Buffs duration dialog: "Automatic" is described as the wiki
  duration raised to your longest cast when it is a death bound with no cast logged Seen: Dialog:
  "Flash of Light | Now 15s · At least this long - the target died still carrying it and no wear-off
  was ever printed | Automatic · 15s | The wiki duration, raised to your longest recent cast | From
  my log · - | No clean cast yet, so it stays automatic until one is logged". The wiki says 12 s and
  no cast is ... Verdict: I re-ran tests/e2e/zz-probe-bazaar-buffs-5.mts and got the same result.
  The table shows "≥ 15s log" with n 0 and the tooltip "At least this long...". The dialog shows
  "Now 15s · At least this long - the target died still carrying it..." and, right under it,
  "Automatic · 15s | ... Fix (src/renderer/src/features/buffs/format.ts gets a new pure function for
  the Automatic option's note. ...): 1. Add a pure function to format.ts, e.g.
  automaticChoiceText(ms, src, overridden), that returns {title, note}. 2. When no choice is saved
  (overridden false), stat.estimatorSource is the automatic source, so pick the note by it. Proposed
  wording, for the owner to approve: - db: "The wiki duration" - observed: "The wiki duration,
  raised to your longest recent cast" - cluster: "Shorter than the wiki: your clean casts ... Test:
  Add unit tests in tests/buffsFormat.test.mts for the new function: - deathBound, not overridden:
  the title is "Automatic · ≥ 15s" and the note contains neither "wiki" nor "cast". - cluster: the
  note does not say ...
- CONFIRMED, OWNER [low, cut-off] Bazaar list: at the default window three of ten columns are
  outside the list box, and the watch chip pushes them further Seen: No watch: box bazaar-scroll
  clientWidth 972, table scrollWidth 1169 (197 px hidden): "Offers" [1135.8-1232.7] cut by the box
  edge at 1224, "Traded 30d" and "Last seen" outside it. "Last seen" is the column the list is
  sorted by. With the chip "Watch: WTS ≤ 31k + WTB ≥ 9.5k" the Item column is 340 px and the table
  1287 ... Verdict: 1. I re-measured it with my own probe at the real default size (window 1280x860,
  devicePixelRatio 1, viewport 1280, so this is not a hidden-window quirk), no watch set and only
  short item names. The bazaar-scroll box is 972 px wide (clientWidth 972) and the table is 1169 px
  ... Fix (src/renderer/src/features/bazaar/BazaarItemRow.tsx (the cells and the Item cell's nowrap
  Stack) and the SortHead header ...): Smallest fix with no change to wording: 1. Tighter horizontal
  padding on the nine number and date columns, in both header and body (for example sx px: 1, so 8px
  instead of 16px). That saves about 144 px. 2. Give the Item cell a maximum width (about 260 px, or
  a share of the table), with minWidth 0 on the Stack and an ellipsis on the name. Let the watch
  chip shrink with an ellipsis (MUI Chip label: overflow hidden, ... Test: An e2e check, because
  only the running app's layout can show this. In a Bazaar e2e spec, stage a fixture with a long
  item name (35 or more characters) and an item with a two-sided watch (WTS at or under plus WTB at
  or ...
- NOT RE-CHECKED [low, cut-off] Bazaar detail at 900 px with 125% text: the price grid's "Predicted
  today" column leaves the panel and the page scrolls sideways Seen: bazaar-detail scrollWidth 507
  against clientWidth 410; the "Predicted today" head and its values ("19k", "9k") sit at x
  649.7-759.7, 112.7 px past the panel's inner edge; app-content scrolls sideways by 64 px
  (scrollWidth 540, clientWidth 476). At 900 px with 100% and at 1280 with 125% the panel's
  scrollWidth equals ...
- CONFIRMED [low, cosmetic] Buffs card: a long spell name breaks "8s elapsed" onto two lines at the
  default window Seen: Card "Jonthan's Whistling Warsong": name box 171 px wide and 40 px high (two
  lines), "8s elapsed" box 51.8 px wide and 39.8 px high (two lines), card 98.7 px high against 78.8
  for its neighbours. With boxes on, "Quivering Veil of Xarn" does the same (name 129 px x 40, "29s
  elapsed" 57.7 x 39.8). Nothing overlaps and ... Verdict: I checked the evidence against the code
  and it holds. Some of my checks were narrower than the reporter's, as noted below. 1. Cause in the
  code: in ActiveBuffRow.tsx (lines 167-216) the header is a single flex row: box, name, rank,
  chips, a flexGrow spacer, then the ... Fix (src/renderer/src/features/buffs/ActiveBuffRow.tsx, the
  elapsed Typography at lines 214-216 (the last child of the ...): Add sx={{ whiteSpace: 'nowrap',
  flexShrink: 0 }} to the caption that prints "{fmtDuration(elapsed)} elapsed". The name Typography
  (flexShrink 1 by default) then takes all the squeeze and wraps by itself. The caption stays one
  short line, at most about 60 px ("35m 00s elapsed" is roughly 85 px), so it fits a 308 px card at
  the 900 px minimum and at 125% text size. No change to the words and no change in format.ts. Test:
  This needs an e2e check, because only layout can show it and fmtDuration's words are not at fault.
  In the Buffs e2e spec (or a new small one), stage a cast of "Jonthan's Whistling Warsong" at the
  default 1280x860 ...
