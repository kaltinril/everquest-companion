# Log loading: every way it can fail, traced (2026-11-19)

A read-only audit made for fork issue #9 and the owner's question of the same day: "if the log was
missing, locked, or too large, would our code handle those and other crazy potential failure
situations". Four investigators each traced one class of situation through the engine, main and the
renderer; a skeptic then tried to overturn every "handled" claim. Nothing was run: each row is a
reading of the code as it stood on `main_community` that afternoon, after the first log-read report
was built. The fixes are planned in `plans/2026-11-19-reading-log-robustness.md`.

**88 situations.** 19 handled, 20 told, but stuck, 14 silent, 17 wrong message, 7 wrong data, 5 not settled by the code, 6 restart loop.

Verdicts: **handled** (the app keeps working or recovers and says what is going on); **told, but stuck** (the reason is on screen, the app does not recover when the cause goes away); **silent** (waiting, empty or stale with no reason); **wrong message** (told something that is not what is wrong); **restart loop**; **wrong data**; **not settled by the code** (needs a run on a real machine).

## What best explains the report, by class

**The log file itself.** No situation in this class is a clear match, and nothing was run to test one. The best fit inside
the class is rows 3a/3b and 4a: the engine cannot open the log at attach (held open without sharing
by another program, or access denied) while main can still stat it. It is the only file-level
situation that (1) repeats at every launch for days, (2) puts the app on "Reading log..." and not on
the "No EverQuest logs found yet" screen or on stale numbers, and (3) before today's build gave no
words at all, because the engine went idle after its single open attempt and the old wait kept
polling forever. With today's build that player would see "Windows will not let the app read the log
file." The other file situations do not fit: a missing file is re-resolved at every launch (another
log or the empty state), a zero-byte file goes live at once, the wrong file shows numbers, and
truncation or replacement only matter after live. How often a program really holds an EverQuest log
without sharing is not something the code can say, so a cause outside this class (engine never
connecting, a fold that panics on one line, a very large log) is at least as likely.

**What is inside the log, and its size.** Row 3: the player's log has grown until one whole-log reply (the loot history first) is larger than
the 8 MiB limit on a single protocol message. It fits the report better than anything else in this
class, for five reasons that are all in the code. (1) It is a hard threshold, so the app works one
day and not the next, and then fails on every launch: "for the past couple of days". (2) It fails
right after the read finishes, on the request Overview always makes (the whole loot module), so the
panels fall back to "Reading log…". (3) Nothing gets out of it: main's one connection is never
reopened, the supervisor's probes use their own connections and keep passing, and the engine is
never restarted. (4) On the build the player had, nothing else was on screen. (5) The archive that
would keep the log small is off by default. Rough size, not measured: 65,000 to 100,000 loot rows at
80 to 130 characters each. If loot is about 1 line in 100 (my assumption), that is 650 MB to 1 GB of
log, which a player writing the owner's stated 300 MB a month reaches 2 to 3.5 months after the
2026-07-28 launch, that is, in October or November 2026. What settles it: the new box will read "The
app cannot connect to its data engine." with "Engine running, connection failed, caught up" and
"Last error none", and the console will hold "a frame exceeded 8388608 characters". Ask the reporter
for that screenshot and the log's size. Second candidate in this class: the engine dying part-way
through a very large log on every attempt (out of memory, row 4, or a false health verdict, row 2);
its signature is "Still reading your log." with a "Read so far" figure that climbs and then starts
again. The plain slow read (row 1) does not explain days: even 4 GB at the 1 MB/s floor is about 68
minutes.

**The engine process and the connection to it.** From this class only, and with no log from the player, my pick is the endless relaunch-and-re-read
with no card (rows 5 and 7a): the engine reaches READY within milliseconds of starting, so when it
then dies or is killed during the read (a security product, an abort on a large log, or the app's
own health watchdog judging a starved engine dead) the failure count has already been reset, the
relaunch comes after 1 s, the read starts again at byte 0, and no rule ever raises a card or stops.
It fits "for the past couple of days" because it repeats on every launch and every play session. The
code itself records the ingredients: 122 EngineUnhealthy reports in two days in the fleet with the
engine actually present (supervisorHealth.ts:10-16), a 1.11.0 report of the log that "keeps catching
up" (engineProtocol.ts:575-580), and the measured fact that CPU starvation makes the app restart the
engine in a loop (WORKFLOW.md:167-170). The player would also have seen the catch-up bar restart,
which the report does not mention, so confidence is modest.

Second candidate: a strand that lasts until the app is really quit (rows 4c, 8a, 8b, 8c). Main's one
connection is never retried and an abandoned fold wait is never resumed. Because the window's X only
hides the app to the tray, one such strand can last days without the player ever restarting. Row 8a
has a deterministic variant worth testing on a big log: a single reply over 8 MiB breaks main's
connection at the same moment on every launch.

What would settle it: errors.log from the player (EngineExited, EngineUnhealthy,
EngineServedCycling, EngineLaunchLoop entries), or a screenshot of today's box. In the loop it reads
"Still reading your log." with a Waiting time and Read so far that keep starting over; in the strand
it reads "The app cannot connect to its data engine." or "The data engine is not answering."

Outside this class there is a simpler explanation that the other auditors own: before today's change
an engine that could not open or finish the log reported idle and the wait polled for ever with no
words.

**The report, and every place a player can still be left waiting.** The code does not settle it. Two situations in this class leave "Reading log…" on screen across
restarts for days, and I rank them in this order.

1. The engine is live, but the combat read behind Overview and Combat is never served. Main gives
every combat.snapshot 2 s (src/main/dataServer/serveShim.ts:102) and otherwise answers an empty
shape marked hydrating (src/main/ipc/world.ts emptyCombat). A new launch has no kept answer, so the
panel draws "Reading log…" until one read finishes inside 2 s
(src/renderer/src/features/combat/combatFeed.ts:62-73). The repo records this exact symptom from a
tester (combatFeed.ts header, 2026-10-20) and keeps a file for it (slowReads.ts: "the 'Reading log…'
a player sees"). A log that grows daily fits "for the past couple of days". In this case Loot and
Leveling show data, and the new box says "The data engine is not answering." with "Engine running,
connected, caught up".

2. The read dies the same way at every launch (a panic on one line, a read error, an unopenable
file) and the engine reports idle. Before commit 3e11ff8fb the wait polled an idle engine forever
with no words, and nothing retries now either. In this case every tab is empty and the new box says
"The data engine stopped before the end of your log." with the engine's own line under it.

A third, weaker candidate is the engine that reaches ready and dies every time (no card is ever
raised): the player would see "Catching up on your log" restarting.

The question that separates 1 from 2 without a screenshot: does the Loot tab show rows while
Overview says "Reading log…"? The file userData/slow-reads.log would also show case 1.

## The log file itself

### 1a. The log file does not exist at launch and the Logs folder holds no other character log (/log never typed, or the only log was deleted)

- Verdict: **handled**. When: at start. Recovers by itself: yes. How likely and how bad:
  likely-and-mild.
- What happens: Engine: starts, is told the folder (logs.setDir), is never attached, health stays
  idle. Main: resolveInitialCharacter finds no saved file (existsSync) and no listed log, logs 'No
  EQ log found; watching for one to appear', and starts a 2 s rescan (watchForFirstLog). Renderer:
  the character list is empty, so every view except Preferences is replaced by the empty state. No
  'Reading log...' panel is mounted.
- What the player sees: Title bar chip "No log detected". Body: "No EverQuest logs found yet" / "We
  looked for your EverQuest Legends install automatically but didn't find any character logs. Make
  sure logging is on in-game (type /log on), or point us at your install folder." / button "Open
  preferences".

### 1b. The saved log is gone at launch but another log exists in the folder (deleted log, or the character was renamed so the game now writes eqlog_<NewName>_<server>.txt)

- Verdict: **handled**. When: at start. Recovers by itself: yes. How likely and how bad:
  rare-and-mild.
- What happens: Engine: attaches to whatever main names and reads it normally. Main: a saved path
  that fails existsSync falls through to the most recently written log in the folder; a saved path
  that still exists loses to any log written after it (launchCharacter). Renderer: normal views for
  the chosen log. For a rename the new log is the right file, but everything the app keeps per
  character (progress, item overrides, turn-ins, archives) is keyed by name_server (characterId) and
  stays under the old name. Nothing says the app changed character.
- What the player sees: nothing about the change: the title bar picker shows "<Name> · <server>" of
  the log it chose, and the tabs show that log's numbers

### 2a. The file appears later while no character is attached (the player types /log on after the app is open)

- Verdict: **handled**. When: at start, then any time while the empty state is up. Recovers by
  itself: yes. How likely and how bad: likely-and-mild.
- What happens: Main: the 2 s rescan re-probes discovery cheaply, finds the new log, calls
  tailCharacter, which sends the world-rebuilt signal; the engine client sends session.attach.
  Engine: opens, reads (tiny file), goes live, follows. Renderer: main pushes the folder config, the
  list is re-read, the views replace the empty state. With a manual folder set in Preferences the
  rescan only looks in that folder.
- What the player sees: The empty-state text of row 1a, then within about 2 s the normal views
  ("Reading log…" for the moment the read takes).

### 2b. The engine is told to attach a path that is missing at that moment (picked from a stale picker list, or deleted between launch and engine start), and the file appears afterwards

- Verdict: **told, but stuck**. When: at start, or at any attach. Recovers by itself: no. How likely
  and how bad: rare-and-bad.
- What happens: Engine: session.attach is always accepted before the file is opened; the ingest
  thread's one File::open fails, it prints 'the ingest of <path> ended: The system cannot find the
  file specified. (os error 2)' and reports idle. It never tries again. Main: the wait sees idle,
  records error step 'fold', sets attachedTo to null. Nothing re-attaches: the 2 s rescan runs only
  when no character is selected, picking the same character again is a no-op (Select onChange), and
  re-saving the folder in Preferences re-tails only while the file is still missing. Renderer:
  Overview and Combat stay on 'Reading log…'; the box appears 5 s after the panel mounted. Other
  tabs and the meter overlays show only their loading state, with no box.
- What the player sees: "Reading log…" then the box: "Waiting on The log file is missing." / "Log
  eqlog_<Name>_<server>.txt" / "Engine running, connected, not reading" / "Last error read: the
  engine reports idle after an accepted attach" / "Engine said" lines / "Stuck here? Post a
  screenshot of this box on your report." Once the file exists the first line changes to "The data
  engine stopped before the end of your log." and stays that way.
- Fix (typescript, S): After failed('ended') in engineClientHost.ts, start an unref'd 5 s probe of
  the log for that turn (the existing probeLog). When its answer changes (missing to present,
  unreadable to readable) take a new turn and call attachAndProbe. Cap the tries so a fold that
  panics cannot loop. Add one line to the box saying the app will try again by itself. This one
  change also fixes rows 3a, 3b, 4a and 6a.

### 1c / 9b. The file is deleted or renamed away while it is being read or followed, and the game recreates it on its next line (player deletes it, or a player's own rotation tool moves it)

- Verdict: **silent**. When: during the first read / after live. Recovers by itself: yes. How likely
  and how bad: rare-and-mild.
- What happens: Engine: both handles come from std File::open with no share_mode override, which on
  Windows shares read, write and delete, so the delete or rename succeeds. The first read keeps
  reading its open handle to the end and goes live. The tail's stat returns NotFound: it marks the
  path vanished and waits, printing nothing. When the name comes back it reopens, sees the size
  below its cursor, restarts at byte 0, and the new lines fold on top of the history held in memory.
  Main: nothing notices; health is not asked after live. Renderer: unchanged numbers. NOT SETTLED:
  the engine never closes its first-read handle (the local 'file' lives until run returns). On a
  Windows build or filesystem without POSIX delete, a deleted file with an open handle stays
  delete-pending and its name cannot be recreated, which would stop the game writing its log until
  the app exits. Experiment: with the app live, run 'del' on the log, type in game, check that the
  file comes back.
- What the player sees: nothing: the last numbers stay on screen and the live dot stays lit; new
  lines show again once the game has recreated the file
- Fix (engine, S): Engine, one line: drop(file) after the first-read loop in ingest.rs so no handle
  pins the old file. Telling the player is the after-live fix of row 3c.

### 3a / 3b. Another program holds the file open without sharing (Windows error 32) at the moment the engine attaches: briefly (antivirus, backup) or for good

- Verdict: **told, but stuck**. When: at start. Recovers by itself: no. How likely and how bad:
  rare-and-bad.
- What happens: Engine: one File::open, which fails with 'The process cannot access the file because
  it is being used by another process. (os error 32)'; the read ends and health goes idle. There is
  no retry at this step, unlike the tail, which says in its own comment that ending on a transient
  sharing violation would be wrong. Main: its own stat calls succeed on a locked file, so it still
  selects that log; the wait ends as 'ended'. The on-screen cause comes from main's own open at the
  moment the box asks: still locked gives 'unreadable', released gives no problem. Renderer: as row
  2b. A brief lock therefore kills the read for the whole run; a permanent one does so at every
  launch. NOT SETTLED: the 'Engine said' lines are a snapshot taken when the idle answer arrives;
  the engine's stderr pipe and its socket are separate channels, so the reason line can miss the
  snapshot. Experiment: hold the log open with no sharing during launch and read the box.
- What the player sees: "Reading log…" then, while the lock is held: "Waiting on Windows will not
  let the app read the log file." After the lock is released: "Waiting on The data engine stopped
  before the end of your log." plus "Engine running, connected, not reading" and, if captured, the
  os error 32 line under "Engine said".
- Fix (typescript, S): The retry of row 2b (re-attach when the probe says the file can be opened
  again). For the snapshot race: read the newest stderr lines when the report is composed for a
  'fold' error, not when the error is recorded.

### 3c / 4c / 6b. After live, the tail cannot stat, open or read the file (a byte-range lock, permissions changed, a network share or USB drive drops out and comes back)

- Verdict: **silent**. When: after live. Recovers by itself: yes. How likely and how bad:
  rare-and-mild.
- What happens: Engine: a stat failure that Rust reports as NotFound (file, path or network path
  missing) is treated as 'file not there yet' and is silent. Any other failure returns an error: the
  engine prints 'a tail poll of <path> failed: <error>' on every poll (400 ms), drops its handle and
  leaves the cursor where it was. Status stays live. When the cause goes away the next poll reopens
  the file and continues from the same byte, so no line is lost or read twice. Main: the stderr
  lines go to the console and an 8-line buffer only; health is not asked after live; no panel is
  hydrating, so no box. Renderer: last numbers. An open with no sharing by another program cannot
  succeed while the engine is attached, because the engine keeps a read handle open: the other
  program gets the sharing violation instead.
- What the player sees: nothing: the numbers stop moving with no reason given; the live dot stays
  lit
- Fix (typescript, S): Smallest: in TypeScript, when the quiet-switch poll finds the attached log
  silent, run the existing probeLog and show one line when it answers missing or unreadable. Fuller:
  add the tail's state (missing since, last poll error) to session.health and have main ask every
  few seconds after live (protocol change, both sides, M).

### 3d / 6a. A read fails part way through the first whole-log read (byte-range lock, the share or drive holding the log drops out)

- Verdict: **told, but stuck**. When: during the first read. Recovers by itself: no. How likely and
  how bad: rare-and-bad.
- What happens: Engine: file.read returns an error, the read ends with 'the ingest of <path> ended:
  <os error>', health goes idle. Main: 'ended', as row 2b; nothing re-attaches when the drive
  returns. The launch banner's phase stays 'folding' because nothing moves it on an ended read, so
  the progress bar under the title bar stays frozen at its last percentage. Renderer: the box under
  'Reading log…' plus the frozen bar. If the read hangs instead of failing (a stalled share), the
  engine stays 'folding', the box says stalled after 60 s without progress, and the read resumes by
  itself when the share answers.
- What the player sees: While the path is unreachable: "Waiting on The log file is missing." or
  "Windows will not let the app read the log file." After it is back: "Waiting on The data engine
  stopped before the end of your log." The top bar keeps showing the last percent and byte counts.
  Hung read: "Waiting on The data engine has stopped making progress."
- Fix (typescript, S): The retry of row 2b, plus clear the banner's fold on failed('ended') (one new
  function in engineLaunchState.ts called from engineClientHost.ts).

### 4a. Permission denied on the log file itself

- Verdict: **told, but stuck**. When: at start. Recovers by itself: no. How likely and how bad:
  rare-and-bad.
- What happens: Engine: File::open fails with 'Access is denied. (os error 5)', the read ends, idle,
  no retry. Main: 'ended'; its own open fails with a code other than ENOENT, so the cause is
  'unreadable'. Renderer: the box with the right words. Fixing the permission does not restart the
  read.
- What the player sees: "Reading log…" then "Waiting on Windows will not let the app read the log
  file." / "Engine running, connected, not reading" / "Last error read: the engine reports idle
  after an accepted attach"
- Fix (typescript, S): The retry of row 2b.

### 4b. Permission denied on the Logs folder (it cannot be listed)

- Verdict: **wrong message**. When: at start / any. Recovers by itself: yes. How likely and how bad:
  rare-and-mild.
- What happens: Main: readdir fails, so listCharacters returns an empty list; the engine's own scan
  answers 'unreadable', which main refuses as an answer and falls back to the same empty list. If
  the saved file cannot be stat'ed either, no character is attached and the 2 s rescan runs. If the
  saved file can still be opened (Windows usually lets a file be reached inside a folder that cannot
  be listed), the engine reads it normally. Renderer: an empty list hides every view either way.
  Preferences has the right words; the main screen does not.
- What the player sees: Main screen: "No EverQuest logs found yet" and "Make sure logging is on
  in-game (type /log on), or point us at your install folder." Chip: "No log detected". Only
  Preferences says: "This folder could not be read (<code>). Its files may be blocked by permissions
  or security software, or it may be a broken shortcut. Try choosing one of the log files directly."
- Fix (typescript, S): NoLogsEmptyState reads the folder config main already builds (readable,
  readError, logsDir) and prints the same three verdicts the Preferences card prints, with the
  folder it looked in. Do not hide the views while a character is attached.

### 5. The Logs folder is missing, or the EverQuest folder the app remembers no longer exists (drive letter changed, game moved or reinstalled)

- Verdict: **wrong message**. When: at start. Recovers by itself: partly. How likely and how bad:
  rare-and-mild.
- What happens: Main, folder found automatically: the remembered root is re-checked, dropped, and
  the registry and fixed drives are swept again, so a standard new location is found and used. Main,
  folder chosen by hand in Preferences: the saved choice is used as it is; automatic discovery is
  not tried while a choice is saved, and the 2 s rescan only re-reads that dead folder. The saved
  log path fails existsSync, so no character is attached. Engine: idle. Renderer: empty state. It
  comes back by itself only if the same path returns.
- What the player sees: Main screen: "No EverQuest logs found yet" / "We looked for your EverQuest
  Legends install automatically but didn't find any character logs…" (with a saved choice it did not
  look automatically). Preferences: "This folder doesn't exist. Pick the folder your eqlog_*.txt
  files are in - or pick one of the files itself."
- Fix (typescript, S): The empty-state change of row 4b (name the folder and say it does not exist).
  Optional: when a saved choice's folder is missing, also run discovery and offer what it finds.

### 6c. The automatically found EverQuest folder is on a drive that drops out and comes back while the app runs

- Verdict: **wrong message**. When: after live. Recovers by itself: partly. How likely and how bad:
  rare-and-bad.
- What happens: Engine: the tail recovers as in row 3c. Main: the root is re-checked at most every 5
  s when anything asks for it (spell icons, output-file lookups, character listing, and the
  quiet-switch poll once the log has been silent 5 minutes). During the outage the check fails, the
  saved root is dropped, a new sweep finds nothing, and that null is remembered for the rest of the
  run: only a folder change in Preferences or the no-character rescan clears it. The effective
  folder becomes the default install path. The engine was told the old folder and its list answer is
  refused because the folder names no longer match, so the character list comes from the default
  path. Renderer: the next time the list is re-read (opening the picker does it) it is empty and the
  empty state replaces every view while the engine is still live. Inventory and other /outputfile
  lookups also look in the default path. The sweep itself is synchronous on main with a 6 s ceiling.
- What the player sees: After the drive is back and the picker is opened: "No log detected" and "No
  EverQuest logs found yet …" over a working session, until the app is restarted
- Fix (typescript, S): In discoverOnce, do not remember a null that replaces a root that was valid
  earlier in this run: keep the last good root and re-check it on the 5 s cycle (config.ts only).

### 7a. The path is a directory (a folder named eqlog_<Name>_<server>.txt)

- Verdict: **told, but stuck**. When: at start. Recovers by itself: no. How likely and how bad:
  rare-and-mild.
- What happens: Engine's lister skips anything that is not a file, but the first choice of a launch
  is always made by main's own lister, which only tests the name. If the folder is the newest match
  it is attached. Engine: File::open on a directory fails on Windows (Rust does not ask for
  directory access), the read ends, idle. Main: 'ended'. NOT SETTLED: main's probe uses Node's open,
  which on Windows can open a directory, so the cause would come out as neither missing nor
  unreadable. Experiment: make such a folder in a test Logs dir and launch.
- What the player sees: "Reading log…" then, if the probe opens it: "Waiting on The data engine
  stopped before the end of your log." with the engine's "Access is denied. (os error 5)" line under
  "Engine said"
- Fix (typescript, S): Main's lister skips entries that are not files, as the engine's does
  (characterLogFiles / resolveActiveCharacter in config.ts).

### 7b. A zero-byte log file (new character, or the fresh log after an archive)

- Verdict: **handled**. When: at start. Recovers by itself: yes. How likely and how bad:
  likely-and-mild.
- What happens: Engine: opens, the first read returns end of file at once, reports 0 bytes, ticks
  once (which takes the combat engine out of hydrating), goes live and follows from byte 0. Main:
  sees live on the first or second health answer and starts serving. Renderer: panels leave 'Reading
  log…' and show their empty states; lines appear as the game writes them.
- What the player sees: "Reading log…" for a moment, then the normal empty panels

### 8a. The file is emptied to zero bytes while it is being followed (the player or a tool clears it)

- Verdict: **handled**. When: after live. Recovers by itself: yes. How likely and how bad:
  rare-and-mild.
- What happens: Engine: the next poll sees the size below its cursor, restarts at byte 0, drops any
  half-read line, and reads new lines from the start. What it had already folded stays in memory, so
  the session's numbers continue. Main and renderer: no change. After a restart the app reads only
  what is in the file, so the earlier history is gone unless the app's own archive made the cut.
- What the player sees: nothing: numbers carry on; new lines keep arriving

### 8b. The file is cut to a shorter, non-empty length while followed, or replaced by a smaller file (a trim tool keeps the newest lines; an editor saves the log with lines removed)

- Verdict: **wrong data**. When: after live. Recovers by itself: no. How likely and how bad:
  rare-and-bad.
- What happens: Engine: the only trigger is size below cursor; it restarts at byte 0 and emits every
  surviving line again into the same fold (the module header says so: de-duplication is declined).
  Those lines were already counted, so kills, loot, damage and experience from them are counted
  twice. Main and renderer: served as normal. A restart re-reads the file once and is correct again.
  If the file is cut and grows back past the old cursor between two polls (400 ms), the cut is never
  seen and the tail reads from an offset that now points into different bytes.
- What the player sees: nothing: totals jump (history counted twice) with no notice
- Fix (engine, S): In the ingest tail loop, when a poll reports a restart and the file is not empty,
  end this fold and start a fresh attach of the same log (a new epoch, read from byte 0) instead of
  folding the survivors on top. Keep today's behaviour for a cut to zero, which the app's archive
  relies on.

### 8c. The file is cut shorter while the first whole-log read is running

- Verdict: **wrong data**. When: during the first read. Recovers by itself: partly. How likely and
  how bad: rare-and-mild.
- What happens: Engine: the sequential read returns end of file at the new, shorter end with no
  error; the read lands (the last progress frame can be well under 100 percent) and goes live with
  the history it read before the cut. The tail then starts at the smaller of its mark and the
  current size (a clamp, not a restart), so lines the game wrote between the cut and the hand-off
  are skipped. Main and renderer: normal go-live.
- What the player sees: nothing: the app goes live; a few lines written right after the cut never
  show
- Fix (engine, S): In FileTail::open, when the file is smaller than the requested offset start at 0
  (the same rule the poll applies), not at the current size.

### 9a. The app's own "Summarize and archive log" moves the live log away and creates an empty one

- Verdict: **handled**. When: after live. Recovers by itself: yes. How likely and how bad:
  likely-and-mild.
- What happens: Main: refuses unless the engine is live on this log and the archive folder is on the
  same drive; captures totals, writes a journal, renames the log into the archive folder, at once
  creates an empty file at the old name (never truncating one the game made), verifies, compresses,
  deletes the moved file. One archive per app run. A rename refused because a program holds the log
  is reported and nothing changes. Engine: its handles share delete, so the rename succeeds; the
  tail sees size 0 below its cursor, restarts at 0 and keeps the in-memory history. A crash mid-way
  is finished at the next launch before the log is resolved. Two leftovers: the engine's
  never-closed first-read handle keeps the deleted old log's disk space in use until the app exits,
  and a log smaller than what the game writes within one poll after the move hits the hole of row
  9c.
- What the player sees: The card's reply: "Archived to <path>. Your history is kept." (plus "<n>
  line(s) written during the move are in the archive but not in the totals." when that happened). On
  a refused move: "Not archived: another program is holding the log open, so it was not moved.
  Nothing has changed."

### 9c. The file at the path is replaced by a different file of the same size or larger with no moment where the name is missing (rename-over by a sync or restore tool, an editor save that adds text)

- Verdict: **silent**. When: after live. Recovers by itself: no. How likely and how bad:
  rare-and-bad.
- What happens: Engine: the stat never fails and the size never drops, so the tail keeps trusting
  the handle it already holds, which follows the old file. Each poll asks that old file for bytes
  past its end, gets zero, treats it as 'the file shrank under us', and keeps the handle. This
  repeats on every poll: the tail reads nothing more for the rest of the run, with no error line and
  status live. If the tail held no handle yet, it opens the new file and reads from the old cursor,
  which lands mid-line. The module header names the hole and calls it unreachable in practice. Main
  and renderer: nothing notices. The app's own 'put a log back' has this shape and avoids it by
  restarting the app.
- What the player sees: nothing: the numbers stop updating with no reason given, until the app is
  restarted
- Fix (engine, S): In tail.rs, when a read returns zero bytes while the stat says the file is longer
  than the cursor, drop the handle and reopen by name on the next poll. Also remember the file's
  creation time at open and treat a change as a replacement (reopen and restart at 0).

### 10a. Non-ASCII characters in the Windows user name or path; a very long path

- Verdict: **not settled by the code**. When: any. Recovers by itself: not-settled-by-the-code. How
  likely and how bad: rare-and-bad.
- What happens: By reading: main sends the path as a JSON string, the engine builds a PathBuf from
  it and opens it through std, with no ASCII-only step; the name parsers slice with checked byte
  ranges; the engine's lister skips only names that are not valid Unicode. Paths in the on-screen
  box are scrubbed to the base name and ~. NOT SETTLED: nothing here was run with such a path, the
  long-path behaviour of Rust std and Node was not checked, and whether the game itself writes logs
  there is unknown. Experiment: an e2e run with a staged Logs dir under a non-ASCII folder, and one
  under a path longer than 260 characters.
- What the player sees: not settled by the code
- Fix (none, none): none until the experiment says otherwise

### 10b. A log name with more than one underscore after the character name (a server name containing '_', or a player's backup copy such as eqlog_<Name>_<server>_2026-11.txt left in the Logs folder)

- Verdict: **wrong data**. When: any. Recovers by itself: no. How likely and how bad: rare-and-mild.
- What happens: Main and the engine's lister split at the FIRST underscore (name, then server). The
  engine's reader takes the character name by splitting at the LAST underscore, because the shared
  pattern it tries first needs a slice suffix that product logs do not have. For such a file the
  reader's own-character name is '<Name>_<server part>', so the rules that depend on knowing which
  lines are yours (own /who line, pet owner, self heals) decline. A backup copy also shows in the
  picker as another character on a server named '<server>_2026-11', and can win the launch choice if
  it is the newest file. No server name with an underscore is known from this repo.
- What the player sees: nothing: the picker shows "<Name> · <server>_<suffix>"; the player's own
  lines are not credited to them for that log
- Fix (engine, S): In ingest.rs character_of, split at the first underscore so all three readers
  agree.

### 10c / 11a. Which log is read: two logs for one character on different servers, several characters in one folder, or the player changes character in game while the app is open

- Verdict: **handled**. When: at start / after live. Recovers by itself: partly. How likely and how
  bad: likely-and-mild.
- What happens: Main: at launch the saved pick is used unless another log in the same folder was
  written after it, in which case the newest wins. Each name+server pair is its own character. After
  that the app stays on one log; it never switches by itself. A watcher looks at the folder only
  once the attached log has been silent for 5 minutes (1 minute when the other log shows a fresh
  'Welcome to EverQuest' line) and then offers a switch, once per log per run. Engine: reads
  whatever it is told. Renderer: the title bar names the log in use; the box under 'Reading log…'
  names the file.
- What the player sees: Title bar: "<Name> · <server>". Box row: "Log eqlog_<Name>_<server>.txt,
  <size>". After the quiet period, a card: "Another character's log is active" / "<A>'s log has been
  quiet for N minutes, but <B>'s is being written to right now. Switch to <B>?" with "Switch to <B>"
  and "Not now".

### 11b. The game is being played from a different EverQuest folder than the one the app reads (second install, or the old folder still exists after a move or reinstall)

- Verdict: **silent**. When: at start / any. Recovers by itself: no. How likely and how bad:
  rare-and-bad.
- What happens: Main: the saved log still exists and the remembered folder still holds logs, so both
  pass their checks and nothing looks elsewhere; the launch choice and the quiet-switch watcher only
  ever read that one folder. Engine: reads the old log, goes live, and waits on a file nobody
  writes. Renderer: yesterday's numbers, no 'Reading log…', no card. Only Preferences shows which
  folder is in use.
- What the player sees: nothing: old numbers for the old log. Preferences shows "Reading logs from
  <old folder>/Logs" and "Found N character logs in this folder."
- Fix (typescript, M): When the attached log has been silent for the quiet period and no log in its
  folder is growing, run the cheap discovery probes for other folders that hold a growing log and
  offer the existing switch card for them.

## What is inside the log, and its size

### 1. Very large log, healthy machine: 500 MB, 2 GB, more than 4 GB (the read itself)

- Verdict: **handled**. When: during the first read. Recovers by itself: yes. How likely and how
  bad: likely-and-mild.
- What happens: Engine: streamed, never loaded whole. One 1 MiB buffer (SCAN_READ_BYTES = 1<<20),
  lines split by TailCore, offsets are u64 so 4 GB is not a limit. Between buffers it checks
  ownership, sends at most one progress frame per 250 ms and answers asks. No sleep, no throttle, no
  timeout. session.health is answered on a connection thread from a copy taken under a short lock;
  it never waits on the reader. Main: session.attach is answered before the file is opened; foldWait
  polls session.health every 400 ms with no deadline (ends only on live, idle, superseded turn, or 3
  refusals in a row; each request has a 15 s client deadline). The 10 s announce timer is disarmed
  before any attach. Renderer: reads are refused locally as notLive, no round trip. Time, from
  measured rates in the repo, assuming the fold stays linear (not measured above 250 MB): at 16 MB/s
  (68 MB in 4.2 s) 500 MB = 31 s, 2 GB = 2.1 min, 4 GB = 4.3 min; at 4.5 to 5.4 MB/s (250 MB in 55
  s) 500 MB = 1.5 to 1.9 min, 2 GB = 6.3 to 7.6 min, 4 GB = 12.6 to 15 min; at the 1 MB/s budget
  floor 8 min, 34 min, 68 min.
- What the player sees: Banner "Catching up on your log"; Overview and Combat show "Reading log…";
  after 15 s the box: "Waiting on Still reading your log.", "Read so far <bytes> (<pct>%), <n>
  events", "Engine running, connected, reading", "Last error none".

### 2. A healthy long read mistaken for a hung engine by the supervisor's health watch, then killed and re-read from byte 0

- Verdict: **restart loop**. When: during the first read. Recovers by itself: partly. How likely and
  how bad: rare-and-bad.
- What happens: Engine: nothing in the fold can delay a probe. The probe is a fresh connection
  (hello, session.health) served by its own threads; the world lock is held only for short sections
  (progress broadcast; the reset frames at landing). So the code does NOT kill a healthy read by
  itself at any log size. What can still trip it is the machine: the engine runs at below-normal
  priority and a probe has 5 s for the whole conversation (plus a 2 s connect). Main: probe every 30
  s; one transient failure buys one immediate second ask; two failures in a row (about 14 s of no
  answer at worst) end the launch as 'unhealthy': stdin closed, kill after 2 s, respawn after 1 s,
  new token, attach, read again from byte 0. The watch does not look at fold progress or at main's
  own answered polls. Probes run fold_time/30 s times (2 GB at 5 MB/s = 13 probes; 4 GB at 1 MB/s =
  137), so one bad 14 s window anywhere in the read costs the whole read. A death after 30 s of life
  is never 'quick', so the trail never collapses and no fault card is raised; one
  EngineServedCycling entry goes to the error store after 3. The supervisor file itself records 122
  EngineUnhealthy reports in two days in the upstream fleet before the two-strike rule. Second path:
  if session.health on main's own connection goes unanswered 3 times in a row (15 s deadline each, 1
  s pauses, about 48 s), foldWait stops for the turn and nothing asks again until a character
  switch, even if the engine then goes live.
- What the player sees: "Reading log…" with the banner percentage and the box's "Read so far"
  starting again from 0 each cycle; the box still says "Still reading your log." (briefly "Starting
  the data engine."). Nothing says the engine was restarted. On the second path: "The data engine is
  not answering." and it stays.
- Fix (typescript, M): Do not retire an engine on a probe timeout while main's own client has heard
  from it recently (progress frames arrive about 4 times a second during a read, and foldWait's
  polls answer every 400 ms); show the restart count in the box. Not settled by the code whether
  real machines hit this: experiment is a 2 GB log with the CPU saturated at normal priority,
  watching for 'health probe failed (timeout)' in the console.

### 3. (added) The log's loot history outgrows the 8 MiB limit on one protocol message

- Verdict: **wrong message**. When: after live. Recovers by itself: no. How likely and how bad:
  likely-and-bad.
- What happens: Engine: the loot module keeps one row per loot event for the whole log with no cap,
  and module.snapshot sends all of it as one line. The engine checks no size on send. A row is about
  80 to 130 characters of JSON, so the line passes 8,388,608 characters at roughly 65,000 to 100,000
  loot rows. Main: its line decoder throws frameTooLarge once a partial line passes 8 MiB; the
  transport closes; the client goes to state 'failed' and rejects every request from then on.
  Nothing reconnects: a client is only made on the supervisor's READY edge, and the supervisor's
  probes use their own connections and keep passing, so the engine is never restarted either.
  Renderer: Overview always asks for the whole loot module (useRecentDrops), so the request goes out
  the moment the read lands. After that every read is unserved, the combat snapshot comes back as
  the hydrating shape, and Overview and Combat return to "Reading log…". The next launch reads the
  same log and does the same thing, every time, until the log is trimmed. The same limit applies to
  the all-fights list the archive capture asks for (maxSegments 1,000,000; about 245 characters per
  fight, so about 34,000 fights) and to any other module whose state grows with the log.
- What the player sees: "Reading log…" on Overview and Combat, forever. With today's box, after 15
  s: "Waiting on The app cannot connect to its data engine.", "Engine running, connection failed,
  caught up", "Last error none". Before today's build: only "Reading log…".
- Fix (both, S): Smallest: (a) TypeScript, raise the app-side line limit for the engine client (one
  constant, the default of LineDecoder) and record the transport failure in logReadState so the box
  names it; (b) engine, in conn.rs refuse a reply whose encoded line is over the limit with an error
  reply for that request, so one panel is blank instead of the whole connection dying. Later: stop
  serving the whole loot ledger in one message, and reconnect a failed client. Experiment to
  confirm: fold a log with 110,000 loot lines and open Overview; expect 'a frame exceeded 8388608
  characters' in the console and the box text above.

### 4. Memory that grows with the log's length, and the engine running out of memory

- Verdict: **restart loop**. When: during the first read. Recovers by itself: no. How likely and how
  bad: rare-and-bad.
- What happens: Engine, bounded: read buffer 1 MiB; tail slice 256 KiB; progression columns capped
  (40,000 + 40,000 + 20,000 + 20,000 + 20,000 + 4,000 + 4,000, plus 1,024 slack each); event feed
  100; consider 50; proc windows 4,000; state spans 2,000; zone history 24. Not bounded: the fight
  history (Vec<Encounter>, one per fight, each keeping its whole aggregate including a per-skill
  per-second hit map); the loot ledger; leveling; met names; the kills map. One defect in the bound
  that does exist: the per-fight event ring is released with events.clear() for fights older than
  the newest 60, and clear() on a VecDeque keeps the allocation. A ring slot is about 176 bytes, so
  a 100-event fight keeps about 22 KB (capacity 128) for the life of the read: about 220 MB per
  10,000 fights from that alone (computed from the struct, not measured). Out of memory is an abort,
  not a panic, so catch_unwind does not see it: the process dies (or thrashes first and fails two
  health probes). Main: 'exited' or 'unhealthy', respawn after 1 s, attach, same growth, same death.
  Life is over 30 s so no fault card. Not settled by the code: how many MB a given log costs.
  Experiment: read the 170 MB log, note engined.exe private bytes at go-live and the fight count
  from combat.searchFights' corpus; repeat on the log doubled.
- What the player sees: "Reading log…"; banner and "Read so far" climb to about the same point and
  start again; box says "Still reading your log." Nothing names the engine dying.
- Fix (both, S): Engine: replace events.clear() with events = VecDeque::new() at lifecycle.rs:248
  (one line), then measure. TypeScript: count engine deaths during a read and say so in the box
  after the second one ("The data engine keeps stopping while reading your log"). Capping the fight
  history itself is a larger change.

### 5. One enormous line: megabytes or more with no newline (a corrupted or binary file named like a log)

- Verdict: **silent**. When: during the first read. Recovers by itself: no. How likely and how bad:
  rare-and-bad.
- What happens: Engine: an unfinished line is kept in memory until its newline arrives, with no cap,
  and every new buffer re-searches the whole kept line from its start. For a file of N bytes with no
  newline the scan searches N*N/(2 MiB) bytes: 5 GiB for 100 MB, 512 GiB for 1 GiB. The mark stays
  at 0, so the tail then starts at byte 0 and reads the whole file again in 256 KiB slices inside
  one poll (20 GiB searched for 100 MB, 2,048 GiB for 1 GiB), answering no asks until it finishes.
  Memory is the scan's copy plus the tail's copy plus reallocation headroom: 2 to 3 times the file.
  A multi-GB file ends as row 4 (abort, respawn, repeat). A file that does contain newlines but has
  one line of some MB (a run of zero bytes after a crash) is only one slow line. Main: health
  answers throughout with offset 0; the read lands 'live' with 0 events. Renderer: tabs empty.
- What the player sees: Under about 1 GB: "Reading log…" for seconds to minutes, then empty tabs and
  no reason. If the scan passes 60 s the box says "The data engine has stopped making progress." (it
  is progressing; the mark cannot move). Just after landing, while the tail re-reads: "The data
  engine is not answering."
- Fix (engine, S): In TailCore::consume cap a line (for example 1 MiB): past the cap, drop bytes
  until the next newline, move the mark past them, and search only the new bytes for the newline.
  Print one stderr line with the offset.

### 6. Bytes that are not clean text inside an otherwise normal log: a run of NULs, a byte-order mark, invalid UTF-8, mixed CRLF and LF, a file ending without a newline

- Verdict: **handled**. When: any. Recovers by itself: yes. How likely and how bad: rare-and-mild.
- What happens: Engine: lines are split on the LF byte; one trailing CR is stripped as a byte; empty
  lines are dropped; each line is decoded once with lossy UTF-8, so a bad byte becomes U+FFFD and
  nothing fails. A line whose first byte is not '[' is not an event: a NUL run swallows the one real
  line that follows it, and a BOM costs the file's first line. A last line with no newline is held
  back and the mark waits for it, however long. A lone CR inside a line makes that line no event.
  Main and renderer: nothing to do; the read lands. Side effect: a name containing a non-UTF-8 byte
  is shown with the replacement character, and two names that differ only in such a byte share a
  row.
- What the player sees: nothing: the app works; at most one line is missing per damaged spot

### 7. A UTF-16 log (for example saved from Notepad as Unicode)

- Verdict: **silent**. When: during the first read. Recovers by itself: no. How likely and how bad:
  rare-and-mild.
- What happens: Engine: every line begins with a 0x00 or BOM byte, so no line is an event. The read
  is fast, lands live with 0 events, and the tail follows the file the same way. Main: health says
  live, events 0, offset = file size; nothing compares the two. Renderer: every tab is empty.
- What the player sees: nothing: after a short "Reading log…" every tab is empty, with no reason
  given
- Fix (typescript, S): At go-live, when the engine has read more than a few KB and counted 0 events,
  show a notice in words ("The app read <size> of <file> and recognised no lines").

### 8. A log from another language client or another EverQuest ruleset

- Verdict: **silent**. When: during the first read. Recovers by itself: no. How likely and how bad:
  rare-and-mild.
- What happens: Engine: the timestamp grammar is English ('Wed Aug 19 16:21:47 2026'). If the stamp
  parses, every line is an event; text no classifier claims becomes kind 'unknown' after cheap
  prefilters, so it is not slow. The fold then builds nothing from it: live, a large event count,
  empty modules. If the stamp does not parse the event carries ts 0 (row 9). Separately, by design,
  the first event dated on or after 2026-07-28 00:00 local fires the launch epoch and every
  character-scoped module drops what it held, so history from before that date in any log is not
  shown. English lines from another ruleset are parsed with this game's spell data. Not settled by
  the code: how wrong those numbers are; experiment is to fold one such log through the parity tool.
  Main and renderer: same as row 7.
- What the player sees: nothing: empty or partly filled tabs, with no reason given
- Fix (both, S): Engine: count unknown-kind events and carry the count on session.health or
  perf.snapshot. TypeScript: when nearly all events are unknown at go-live, say so on screen.

### 9. Timestamps: broken or missing, going backwards (clock changed, daylight saving), years in the past or future, a year boundary

- Verdict: **wrong data**. When: any. Recovers by itself: yes. How likely and how bad:
  rare-and-mild.
- What happens: Engine: a line with no '[stamp]' is no event. A bracketed stamp that does not parse
  gives ts 0; the session and epoch code ignore ts 0 explicitly. The stamp carries its year, so a
  year boundary is ordinary. Nothing panics on a date: every numeric parse has a fallback and
  invalid dates return 0. Backwards time is not guarded in the fight lifecycle: eval_closure
  computes now - last_ts, a negative gap closes nothing, so after a backward jump the open fight
  stays open until the log's clock passes the old stamp plus 60 s, and that fight's active time
  takes a negative step. In the repeated hour when clocks go back, both passes resolve to the same
  instants, so for that hour live stamps sit 60 minutes behind the wall clock; live fights are
  closed by wall clock, so the meter cuts fights into pieces for that hour. A future-dated line pins
  the fold's last_ts (kept with max), which only moves the skew reading. A date before 2026-07-28 is
  dropped at the launch epoch (row 8). A resolved zone that disagrees with the machine by 30 minutes
  or more prints one stderr line ("fights, buffs and timers will be wrong"). Main: that line reaches
  the console only; the skew number is on the performance panel and bug reports. Not settled by the
  code I read: what routing.rs does with a backward stamp beyond eval_closure; experiment is a
  fixture with one hour repeated mid-fight.
- What the player sees: nothing: numbers for the affected fights are wrong (one long fight, or many
  short ones) with no notice
- Fix (both, S): TypeScript: show the engine's own skew reading on screen when it is 30 minutes or
  more (the number is already on perf.snapshot). Engine: clamp negative gaps to 0 where the
  lifecycle subtracts stamps.

### 10. A line that makes the parser or a fold module panic, during the first read

- Verdict: **told, but stuck**. When: during the first read. Recovers by itself: no. How likely and
  how bad: rare-and-bad.
- What happens: Engine: blast radius is the whole read. There is one catch_unwind, around the entire
  ingest thread; nothing per line or per module. On a panic the default hook prints the location and
  message to stderr, the engine prints "the ingest of <log> PANICKED; the world is idle and the
  epoch is untouched", status becomes idle, and the process stays up. Main: the next health poll
  (400 ms) sees idle; the wait ends; the error is recorded with the 4 newest stderr lines;
  attachedTo is cleared. Nothing retries. A later rebuild or the next launch reads from byte 0 and
  dies on the same line: stuck for days by construction. There is no quarantine, no skip, and the
  archive action is blocked while the read is not live. The only ways out are editing the log by
  hand or a new build. What I could check by search: the parser has no unwrap on line content
  (numbers fall back to 0), no fixed-offset string slicing in fold or engined, no date unwraps. Not
  settled: whether any real line panics in the 54,000 lines of fold code; experiment is a fuzz run
  of the parser and fold over mutated corpus lines.
- What the player sees: "Reading log…" then at once the box: "Waiting on The data engine stopped
  before the end of your log.", "Read so far <bytes> (<pct>%)", "Last error read: the engine reports
  idle after an accepted attach", then "Engine said" with the panic location and message.
- Fix (engine, S): Wrap the per-line work (parse_event plus sink.event) in catch_unwind in both
  loops; on a panic skip that line, print its byte offset once, count it, and give up only after
  many (for example 100). About 40 lines and a test.

### 11. (added) The same panic on a line the game writes after the app is live

- Verdict: **wrong message**. When: after live. Recovers by itself: no. How likely and how bad:
  rare-and-bad.
- What happens: Engine: the tail's parse and fold run under the same single catch_unwind, so the
  read ends, status goes idle and the ask door is removed. Main: nobody polls session.health after
  live, and the supervisor's 30 s probe reads only whether an answer came, not its status. Main
  still believes the engine is live on this log, so reads are sent and come back 'unavailable' (no
  log is attached). attachedTo is not cleared, so a rebuild does not attach again. Renderer: module
  tabs keep their last values and stop moving; the combat read falls back to the hydrating shape
  (not traced whether Combat then shows its last numbers or "Reading log…"). The next launch hits
  the line during the first read: row 10.
- What the player sees: Stale numbers with no notice. Where a hydrating panel is drawn, the box says
  "The data engine is not answering." with "Last error the engine refused". The engine is answering;
  its read has ended.
- Fix (typescript, S): Use the status the supervisor's probe already receives every 30 s: when it
  says idle while main holds a live log, record a 'fold' error, clear attachedTo and the live mark,
  and tell the windows. Row 10's fix removes most of the cause.

### 12. Duplicate content: the log is truncated or rewritten in place while the app is running

- Verdict: **wrong data**. When: after live. Recovers by itself: partly. How likely and how bad:
  rare-and-bad.
- What happens: Engine: the only trigger is size < bytes already read, tested once per 400 ms poll.
  The tail then restarts at byte 0 and emits every surviving line again, into the same fold, stamped
  live. Nothing de-duplicates (stated in tail.rs). Totals that add up (loot rows, kills, experience,
  fights) are counted twice. Because the lines are live, alert rules fire and con cards are raised
  for old lines. The whole re-read happens inside one poll, so asks go unanswered for its length
  (170 MB at 5 to 16 MB/s = 10 to 35 s). If the file grows back past the old offset between two
  polls, the tail reads from the middle instead. Deleting the log and letting the game recreate it
  is fine (the new file holds only new lines), and the app's own Archive action is that case. The
  app's own Restore action makes a short log long and relies on relaunching 1.5 s later; in that
  window the tail can read archived lines as live. Main: no notice of the restart. Renderer: doubled
  numbers. Not traced: how the alert audio queue plays a burst.
- What the player sees: nothing: totals jump, and alert sounds for old lines may play; no words on
  screen
- Fix (engine, M): Have the tail report a shrink without reading past it, and have the ingest answer
  a shrink by ending this fold and starting a clean one from byte 0 under a new epoch (history, not
  live), so nothing is counted twice and no alert fires.

### 13. A log archive that is corrupt, half-written or from an older format

- Verdict: **handled**. When: after live. Recovers by itself: yes. How likely and how bad:
  rare-and-mild.
- What happens: Engine: not involved; it never reads archives on the live path. Main: archives are
  only opened with the switch on (default off). Segment files are written through a temp-and-rename
  writer, so a half-written one is the old file or the new one. A file that does not parse, has a
  newer or unknown version, or a wrong id is skipped and reported; a state whose shape a merge rule
  does not accept is left out of that module (the rule returns null). An unreadable live log head
  means no history is shown this launch. A damaged .gz only matters to refresh and restore, which
  verify a SHA-256 and refuse. An interrupted rotation is finished at launch and never throws. So a
  bad archive loses history only; the live read is not stopped. Two gaps: a state damaged deeper
  than the rule's shape test can throw inside the snapshot projection, which is not wrapped, so that
  one module's read fails on every ask (not settled which rules can throw; experiment is a segment
  with kills.mobs[x].tiers removed); and a refold of an archive has a 10 minute limit, so an archive
  of a log larger than about 2.7 GB at 4.5 MB/s cannot be refreshed.
- What the player sees: History from that archive is missing from the tabs. The reason goes to the
  console and to the archive card's status (skipped list; the card's drawing was not checked).

### 14. (added) The archive as the cure for a log that is too large

- Verdict: **told, but stuck**. When: any. Recovers by itself: no. How likely and how bad:
  likely-and-mild.
- What happens: Main: the app's own answer to a big log is the archive: with the switch on, a log
  over 100 MB is moved aside automatically. It cannot help a log that is already too big, for four
  reasons in the code. The switch is off by default. The automatic check waits for the engine to be
  live (asked every 30 s) and the manual action is blocked until then. The capture asks the engine
  for every module whole and for every fight (maxSegments 1,000,000) over the same 8 MiB-limited
  connection as row 3, so on a large log the capture itself can end main's connection. And an
  interrupted archive is finished at launch before the app starts following any log, including
  compressing the moved file, with nothing on screen for that time (not traced what the panels show
  then). Engine: unaffected until asked.
- What the player sees: On the archive card: "The app is still reading your log. Try again when it
  has caught up." If the capture trips the limit: the tabs go back to "Reading log…" as in row 3.
- Fix (typescript, M): After row 3's fix the capture is safe. Then add a way to move an oversized
  log aside without the engine being live (rename and compress only, totals filled in later by the
  second engine).

## The engine process and the connection to it

### 1. Engine binary missing (deleted or quarantined, no file on disk)

- Verdict: **told, but stuck**. When: at start; also after live if the file vanishes and the engine
  then dies. Recovers by itself: no. How likely and how bad: rare-and-bad.
- What happens: Engine: never runs. Main: resolveEngineBinary finds none of its candidate paths, the
  supervisor goes to status 'absent', raises the no-binary fault once and arms NO retry timer and no
  error-store entry. If the file disappears mid-session the engine's death leads to a 1 s backoff, a
  re-probe, then the same 'absent'. Renderer: the main window draws the failure card at once;
  Overview and Combat show Reading log... and the report box at its first ask (5 s). Report sentence
  is the right one.
- What the player sees: Card: "EQ Companion cannot find its data engine" / "The program that reads
  your log file is missing from this installation. It was not at any of the places EQ Companion
  knows to look." / "Antivirus quarantine is the most common cause. Check your antivirus quarantine
  list and restore EQ Companion, add it to your exclusions, then reinstall if it is still missing."
  / "Until it starts, EQ Companion cannot read your log at all - every panel will stay empty. Your
  log file and your settings are untouched." Buttons: Try again, Report this, Where it looked. Box:
  "Waiting on The data engine program is missing." Overlays: no card, meters say only "Reading
  log…".
- Fix (typescript, S): In the absent branch arm a slow re-probe (for example every 30 s) so a file
  restored from quarantine is picked up without a click; the card and button stay as they are.

### 2. Engine cannot be started or exits at once, every time (spawn refused by Windows or antivirus, wrong architecture, missing DLL, loopback bind refused)

- Verdict: **handled**. When: at start. Recovers by itself: yes. How likely and how bad:
  rare-and-bad.
- What happens: Engine: either no process (spawn throws or emits 'error') or a process that exits in
  milliseconds (exit code 1 with one stderr line for a bind or token refusal; a Windows loader code
  and no stderr for a missing DLL). Main: every ending goes through endLaunch, counts a failure and
  schedules a relaunch at 1 s, 2 s, 5 s, 15 s, then 30 s forever. It never stops trying. The third
  failure in a row with a lifetime under 30 s collapses the trail: one EngineLaunchLoop entry in
  errors.log, later failures are not logged, and the fault edge puts the card up about 3 s after
  launch. The first launch that reaches READY takes the card down. Renderer: card in the main
  window; box under Reading log... says the engine keeps failing. The count on the card stays at 3.
  Report sentence is right.
- What the player sees: First ~3 s: only "Reading log…". Then card: "The data engine keeps shutting
  down" / "It starts and then exits immediately. It has tried 3 times." (spawn refused: "EQ
  Companion could not start its data engine" / "Windows refused to launch the program that reads
  your log file. It has tried 3 times." plus the antivirus sentence), then "Until it starts, EQ
  Companion cannot read your log at all - every panel will stay empty..." and "It last said:
  <engine's last stderr line>" when there was one. Box: "Waiting on The data engine keeps failing to
  start."

### 3. Engine starts but does not announce its port within 10 s (slow or starved machine, antivirus scanning the exe at launch)

- Verdict: **told, but stuck**. When: at start, and at every relaunch. Recovers by itself: partly.
  How likely and how bad: rare-and-bad.
- What happens: Engine: still starting; it may be perfectly healthy. Main: at 10 s the announce
  timer ends the launch as announce-timeout with alive=true, closes the child's stdin (the engine's
  shutdown signal) and kills it 2 s later if it has not exited. A late announce is ignored because
  the launch is already finished. So a healthy-but-slow engine IS killed. Relaunch after 1 s, then 2
  s; the third timeout (about 33 s after launch) raises the card; retries continue at 5, 15, then 30
  s forever, each with the same fixed 10 s. Renderer: card after ~33 s; before that only Reading
  log... and, from 15 s, the box saying Starting the data engine. A machine that calms down recovers
  on the next retry; a machine that always needs more than 10 s never gets an engine. Report
  sentence is right (engine failing).
- What the player sees: 0-33 s: "Reading log…", box from 15 s: "Waiting on Starting the data
  engine." Then card: "The data engine started but never answered" / "The program that reads your
  log file starts and then never reports itself ready. It has tried 3 times. A security product
  holding it at launch will do this." plus the antivirus sentence and the consequence sentence. Box:
  "The data engine keeps failing to start."
- Fix (typescript, S): Do not retire a child that is still alive at the deadline: keep the launch,
  keep listening for the announce, and only show the card (or lengthen the wait per attempt, for
  example 10/30/60 s). The exit event already covers a child that really died.

### 4a. Every loopback connect is refused or blocked (firewall or security product blocking 127.0.0.1)

- Verdict: **wrong message**. When: at start. Recovers by itself: yes. How likely and how bad:
  rare-and-bad.
- What happens: Engine: starts, binds port 0, announces, serves; it is fine. Main: the supervisor's
  first health probe cannot connect (instant refusal, or the 2 s connect timeout). 'connect' is a
  transient reason, so it asks once more on a fresh connection, fails again, and ends the launch as
  'unhealthy': the healthy engine is told to exit and killed. Relaunch at 1 s, 2 s; third failure
  raises the card; then a spawn-and-kill every 30 s forever. Recovers on the first retry after the
  block is lifted. Renderer: the card and the box both blame the engine. The words "The app cannot
  connect to its data engine." exist but are never reached because the fault is checked first. The
  real reason is only in the small "It last said" line.
- What the player sees: Card: "The data engine stopped responding" / "It starts, and then stops
  answering. It has tried 3 times." / consequence sentence / "It last said: connect ECONNREFUSED
  127.0.0.1:<port>" or "It last said: connecting to the engine on port <port> timed out". No advice
  line. Box: "Waiting on The data engine keeps failing to start."
- Fix (typescript, S): When a launch ends 'unhealthy' with every probe reason 'connect', give it its
  own words on the card and in the box (the app cannot reach its engine on 127.0.0.1; a firewall or
  security product blocking local connections does this) instead of the engine-stopped words.

### 4b. This PC cannot open a local socket at all (ephemeral ports exhausted: EADDRINUSE, EADDRNOTAVAIL, EMFILE, ENOBUFS) before the first probe ever succeeds

- Verdict: **wrong message**. When: at start. Recovers by itself: yes. How likely and how bad:
  rare-and-mild.
- What happens: Engine: running and serving. Main: the probe's connect fails on the app's own
  endpoint; the watchdog deliberately does not end the launch, retries at 2 s three times, writes
  one EngineLocalSocket entry to errors.log, then asks every 30 s. The launch never reaches READY,
  so status stays 'starting', no fault is raised, no client is built. Renderer: no card, no bar. The
  box (after 15 s) says the engine is starting, indefinitely. Recovers at the next probe once ports
  are free.
- What the player sees: "Reading log…" and, from 15 s, box: "Waiting on Starting the data engine." /
  "Engine starting" / "Last error none". Nothing else.
- Fix (typescript, S): Pass the local-socket edge to logReadState as a connect error and let the box
  say the app cannot open a local connection on this PC.

### 4c. The supervisor's probe passes but main's ONE client connect then fails (refused, or 2 s timeout)

- Verdict: **told, but stuck**. When: at start, and at each engine relaunch. Recovers by itself: no.
  How likely and how bad: rare-and-bad.
- What happens: Engine: READY and idle; nobody ever tells it which log to read. Main: openConnection
  catches the error, records it for the box and returns. There is no retry anywhere: the client
  object stays in state 'connecting' for the life of this engine launch. The supervisor's own probes
  keep passing on fresh connections, so the engine is never relaunched either. A later character
  switch queues requests on the dead client; each times out after 15 s. Renderer windows retry their
  own connections every 4 s, but all product reads go through main. Renderer: no card (no fault), no
  bar. Box after 15 s with the right sentence. BRANCH_NOTES's statement that the one connection is
  never retried is confirmed.
- What the player sees: "Reading log…" and, from 15 s, box: "Waiting on The app cannot connect to
  its data engine." / "Engine running, connecting" / "Last error connect: connect ECONNREFUSED
  127.0.0.1:<port>". Overlays: "Reading log…" only.
- Fix (typescript, S): Retry the connect with a short backoff for as long as this launch is still
  the live one, then run the same log-dir push and attach that a first connect runs.

### 5. Engine process dies in the middle of the whole-log read (killed by a security product, abort or out-of-memory on a big log, killed by the app's own watchdog)

- Verdict: **restart loop**. When: during the first read. Recovers by itself: no. How likely and how
  bad: rare-and-bad.
- What happens: Engine: a panic inside the read is caught (the process lives and reports idle); a
  process death is not. Main: the exit ends the launch; because this launch had reached READY (the
  first probe answers right after the announce, before any log is attached) the failure count and
  the quick-exit trail were already reset to zero, so this is always 'failure 1': relaunch after 1
  s, new engine, new connection, attach, and the read starts again at byte 0. If it dies at the same
  place every time this repeats without limit: the backoff never grows past 1 s, the trail never
  reaches 3, so NO card is ever raised. errors.log gets one EngineExited entry per death and one
  EngineServedCycling entry at the third. The box's state is wiped at each relaunch, so its Waiting
  time and Read so far start over and Last error says none. Renderer: bar restarts from 0%; panels
  stay on Reading log...
- What the player sees: Band: "Catching up on your log NN% X MB of Y MB N events" climbing,
  vanishing, starting again from 0%. Panels: "Reading log…". Box alternates "Waiting on Starting the
  data engine." (Engine: restarting) and "Waiting on Still reading your log." with "Last error
  none". No card, no words saying it keeps dying.
- Fix (typescript, M): Stop treating the first health answer as proof: reset the failure count and
  trail when the read goes live (or after some minutes of serving), and add a rule that N launches
  in a row that never went live raise the card and stretch the backoff. Also record each engine
  death in logReadState so the box can say the engine keeps stopping and starting over.

### 6. Engine dies after the read is live and it is serving

- Verdict: **restart loop**. When: after live. Recovers by itself: partly. How likely and how bad:
  rare-and-bad.
- What happens: BRANCH_NOTES is confirmed: relaunched forever with no card. Engine: gone. Main:
  exit, then the READY-null edge closes every renderer relay, hands alerts back (no app-side
  evaluator exists any more), closes main's client and tells windows the world changed. Relaunch
  after 1 s every time (the count was reset at READY), new engine, whole log re-read from byte 0,
  then live again. A death every ten minutes repeats this for ever; only errors.log shows it.
  Renderer while it is down and re-reading: main window shows the catch-up bar. Combat tab keeps its
  last numbers with a small badge. Overview keeps its last combat numbers with no badge. Tabs that
  read modules (loot, buffs, timers and so on) get null and fall back to their loading or empty
  state. Overlays: damage and heal meters freeze on the last numbers with no sign; module overlays
  (buffs, events, respawn, xp) go empty; no banner exists on overlays. No alert sounds until the
  re-read is live, and lines written during the re-read are read as history and never fire. The
  Reading log... box is NOT on screen for any surface that already had data, so today's report says
  nothing here.
- What the player sees: Main window band: "Catching up on your log NN% ...". Combat tab: last fight
  frozen plus badge "Updating…". Overview and overlay meters: frozen numbers, nothing: no words.
  Module tabs and overlays: empty or loading. A tab opened for the first time in this state:
  "Reading log…" then box "Still reading your log."
- Fix (typescript, M): Same change as row 5 (count served deaths toward a card and a longer
  backoff). Plus one line of words on the bar when the catch-up is a re-read after an engine
  restart, and a visible stale mark on the overlay meters.

### 7a. Engine process alive but answering nothing (frozen by a security product, or starved of CPU; the same verdict is reached when it is the app or the whole PC that is slow)

- Verdict: **restart loop**. When: during the first read and after live. Recovers by itself: partly.
  How likely and how bad: likely-and-bad.
- What happens: Engine: not answering new connections in time. Main: the supervisor's watchdog is
  the one that notices. It probes every 30 s on a fresh connection with a 5 s limit; a timeout buys
  exactly one more ask at once; a second failure ends the launch as 'unhealthy': stdin closed, kill
  after 2 s, relaunch after 1 s. Worst case about 40 s from freeze to verdict. The fold wait has its
  own limit (three polls unanswered at 15 s each, about 47 s) and normally loses the race. The
  relaunch re-reads the log from byte 0. During a read this is the loop of row 5: an engine that was
  only slow is killed, loses all its progress, and under sustained load can be killed again before
  it finishes, for ever, with no card (the launch had reached READY). After live it is row 6.
  Renderer: as rows 5 and 6. The box, where a panel is hydrating, says Starting the data engine or
  Still reading your log; neither names the kill.
- What the player sees: During the read: the "Catching up on your log" bar stops for up to ~40 s,
  disappears, starts again from 0%. After live: as row 6. No card and no words about the engine
  being restarted.
- Fix (typescript, S): While a read is in progress, take proof of life from the read itself before
  killing: if progress frames or a growing health offset arrived on main's connection inside the
  window, treat a missed probe as busy and ask again later. The larger cure is an engine checkpoint
  so a relaunch does not start at byte 0 (L, engine).

### 7b. The read itself is stuck (reader thread spinning or blocked on one place in the file) while the process still answers session.health

- Verdict: **told, but stuck**. When: during the first read. Recovers by itself: no. How likely and
  how bad: rare-and-bad.
- What happens: Engine: status stays 'folding', the offset stops moving, health keeps answering.
  Main: the supervisor sees a healthy engine and does nothing; the fold wait polls for ever by
  design (a folding engine is never given up on). After 60 s without the offset growing the report
  calls it stalled. Nothing restarts the engine, and a restart would re-read from byte 0 into the
  same place. Renderer: bar frozen at its last percentage; box with the right sentence, shown at
  once.
- What the player sees: Band: "Catching up on your log NN% ..." not moving. Box: "Waiting on The
  data engine has stopped making progress." / "Read so far X MB (NN%), N events" / "Engine running,
  connected, reading".
- Fix (both, M): None small that cures it: a restart repeats the stall. The S step is to add to the
  box which byte offset it stalled at and a line asking for that part of the log; the cure is in the
  engine (skip or bound the offending input).

### 7c. After live, the reader thread stops (stuck in a tail poll or a fold step) while the process still answers session.health

- Verdict: **silent**. When: after live. Recovers by itself: no. How likely and how bad:
  rare-and-bad.
- What happens: Engine: health says 'live'; every question to the fold waits 5 s and comes back
  'unavailable'. Main: the supervisor's probe passes, so no watchdog acts, ever. Every read times
  out at main's 2 s limit and is answered with the empty shape. Renderer: surfaces that had data
  keep it, frozen: Combat with its badge, Overview and overlay meters with nothing. Module tabs keep
  what they hold and stop updating. A panel with no data yet shows Reading log... and, after 15 s,
  the right sentence. Nothing restarts the engine.
- What the player sees: Combat: frozen numbers plus "Updating…" indefinitely. Overview, overlays:
  frozen numbers, nothing: no words. A freshly opened Combat or Overview: "Reading log…" then box
  "Waiting on The data engine is not answering." / "Last error the engine did not answer in time".
- Fix (typescript, S): In main, count reads that time out while health says live; after about 30 s
  of nothing but timeouts ask the supervisor to recycle the engine (a new 'recycle' verb beside
  restart()). A cleaner version has the engine report how long ago its reader last turned, which is
  a protocol change.

### 8a. Main's connection to the engine fails while the engine is fine (socket error, a single reply larger than the 8 MiB frame limit, an exception thrown inside any frame listener, the engine closing the connection)

- Verdict: **silent**. When: any; worst after live. Recovers by itself: no. How likely and how bad:
  rare-and-bad.
- What happens: BRANCH_NOTES is confirmed: never retried. Engine: unaffected; it keeps reading or
  following the log and answers the supervisor's probes. Main: the transport fails, the client goes
  to state 'failed', every pending request is rejected, and nothing listens for that state.
  Readiness is 'notConnected' until the engine is relaunched or the app restarts, so every read gets
  the empty shape. During a read the fold wait ends after three immediate refusals. An oversized
  frame is deterministic: the same reply breaks the connection again on the next launch. Renderer:
  surfaces with data freeze (Combat with its badge); module reads return null; a hydrating panel
  gets the right sentence after 15 s. A panel that already had data shows no box.
- What the player sees: With data on screen: Combat frozen plus "Updating…"; Overview and overlays
  frozen, nothing: no words. Hydrating panel: "Reading log…" then box "Waiting on The app cannot
  connect to its data engine." / "Engine running, connection failed, caught up".
- Fix (typescript, M): Listen for the client's 'failed' state in engineClientHost and reconnect with
  backoff while the launch is unchanged, then re-run the log-dir push and the attach-or-wait step
  (no re-attach is needed when the engine is still on the same log). Wrap the frame listeners in
  try/catch so one bad frame cannot take the connection down.

### 8b. The gen guard in openConnection throws away a good connection because a world rebuild (character resolved, character switch, EverQuest folder change) lands while the loopback connect is in flight

- Verdict: **told, but stuck**. When: at start or at an engine relaunch. Recovers by itself: no. How
  likely and how bad: rare-and-bad.
- What happens: BRANCH_NOTES is confirmed. Engine: READY, idle, never attached. Main: the connect
  succeeds, the turn counter has moved, so the channel is closed and the function returns; the
  client object is never given a transport and stays 'connecting' for the life of the launch. The
  rebuild's own attach attempt queues on that client: five define pushes and the attach each wait
  out the 15 s deadline (about 90 s), then an attach error is recorded. Nothing retries. At launch
  the window is narrow (the connect takes about a millisecond) but real: the character is resolved
  asynchronously after the supervisor has already started. Renderer: as 4c.
- What the player sees: "Reading log…" and, from 15 s, box: "Waiting on The app cannot connect to
  its data engine." / "Engine running, connecting"; after ~90 s "Last error open log: timeout: the
  engine did not answer session.attach in time".
- Fix (typescript, S): Use the connection guard here (live?.client === client) instead of the turn,
  attach the transport, and run attachAndProbe with the current turn.

### 8c. (added) The fold wait gives up after three unanswered health polls while the engine is fine and still reading (main's connection is busy behind a slow request, a short stall after wake)

- Verdict: **wrong message**. When: during the first read. Recovers by itself: no. How likely and
  how bad: rare-and-bad.
- What happens: Engine: keeps reading, lands, goes live and follows the file. Main: three
  session.health asks in a row are rejected (15 s deadline each), the wait returns and nothing ever
  asks again. The live edge is never observed, so readiness stays 'notLive' for the rest of the
  launch and no read is served. The banner is never told the read is over: the engine's last scan
  frame leaves it at 100% and later frames from the live tail are refused. The recorded error is
  never cleared. A manual re-pick of the same character starts a new wait and recovers. The
  supervisor does not act: its probes pass.
- What the player sees: Band stuck: "Catching up on your log 100% X of X N events". Panels: "Reading
  log…". Box: "Waiting on The data engine is not answering." although the engine is live and
  answering.
- Fix (typescript, S): After the third refusal do not return: keep asking at a slow cadence (for
  example every 5 s) for as long as the turn is current. Killing a silent engine is already the
  supervisor's job.

### 9. session.attach is refused

- Verdict: **wrong message**. When: at start, at a character switch, at an engine relaunch. Recovers
  by itself: no. How likely and how bad: rare-and-bad.
- What happens: Why it would be: the engine itself never refuses a well-formed attach (it answers
  accepted: true before it opens the file). A refusal can only be (a) the params failing the
  engine's schema (a half-updated install the version check missed), (b) main's own 15 s deadline on
  a slow or starved engine, or (c) the connection being dead. Main: the catch logs it, records an
  attach error and returns. No retry, and no health polling starts. In case (b) the engine may in
  fact have taken the attach and be reading: its progress frames are dropped because the banner was
  never put into the folding phase, and nobody will ever see it go live. The next world rebuild
  (re-picking the character) attaches again. Renderer: box at once. The sentence is right for (a)
  and wrong for (b); in (c) the not-connected sentence wins.
- What the player sees: "Reading log…" and box at the first ask: "Waiting on The data engine refused
  the log file." / "Last error open log: timeout: the engine did not answer session.attach in time"
  (or "badParams: ..."). No bar, no card.
- Fix (typescript, S): Retry the attach a few times with backoff, and split the words: a timeout is
  'the data engine did not answer', not a refusal. After a timeout still poll health once: if the
  engine reports this log as attaching, reading or live, adopt that and wait as usual.

### 10. The PC sleeps or hibernates during the read, or for hours while live, and wakes

- Verdict: **not settled by the code**. When: during the first read / after live. Recovers by
  itself: not-settled-by-the-code. How likely and how bad: likely-and-bad.
- What happens: What the code does: on Electron's suspend event the health watchdog stands down and
  ignores any probe in flight; on resume it waits 5 s and asks afresh with the two-strike rule. The
  engine holds its file handle and continues the read or the tail from where it was. What the code
  does NOT settle: (1) whether main's one long-lived loopback connection survives; there is no
  keepalive and no reconnect, so if it does not, the result is row 8a (stuck until restart). (2) the
  fold wait is not paused: an ask in flight across the sleep can be rejected on wake; three in a row
  is row 8c. (3) whether the suspend event fires at all on Modern Standby machines; without it the
  watchdog relies on its two strikes. (4) a slow wake (disk spin-up) failing two probes kills a
  healthy engine and costs a whole re-read (row 6). The box is on screen only if a panel is still
  hydrating.
- What the player sees: Not settled. If all goes well: nothing, the bar or the live data carries on.
  If the engine is wrongly killed: as row 6. If the connection is lost: as row 8a.
- Fix (typescript, M): Experiment first: start the app on a large log, sleep the PC mid-read
  (classic sleep and a Modern Standby laptop), wake it, and read the dev log for 'health probe
  failed', 'a serving engine died', 'session.health was refused'; repeat with a multi-hour hibernate
  while live and check that a new log line still reaches the Combat tab. The reconnect of row 8a and
  the keep-asking of row 8c would make the outcome safe whichever way the experiment goes.

### 11. Two copies of the app at once (installed build plus dev app, the upstream official build plus this community build, or the same build twice)

- Verdict: **handled**. When: any. Recovers by itself: yes. How likely and how bad: rare-and-mild.
- What happens: Same build twice: the second process fails the single-instance lock, quits, and the
  first window is raised; there is no second engine. Different channels: each has its own settings
  folder (this build 'everquest-companion-test', dev 'everquest-companion-dev', upstream
  'everquest-companion'), so each holds its own lock and runs its own engine. Engines cannot
  collide: each binds port 0 (the OS picks a free port), each has its own token on its own stdin,
  each writes its two state files into its own settings folder. Both engines open the same log
  read-only and read it independently; the cost is two whole-log reads. The dev app's staged engine
  copy lives under the dev settings folder only. Not traced: one copy's Summarize and archive log
  moving the log under the other copy's engine (another class's subject).
- What the player sees: Nothing unusual: both windows work. Launching the same build again just
  brings the first window forward.

### 12a. The player switches character in the middle of a read

- Verdict: **handled**. When: during the first read. Recovers by itself: yes. How likely and how
  bad: likely-and-mild.
- What happens: Main: the switch sends the one world-rebuilt signal; the client bumps its turn (the
  old wait ends silently), pushes the five define families and sends session.attach for the new log.
  Engine: the attach bumps the generation inside its lock; the old reader notices at its next 1 MiB
  boundary and stops without saying anything; a new reader starts on the new log at byte 0. Main:
  the banner is reset to a fresh fold, the box's clock and error are reset, a new wait polls health.
  Several quick picks: requests go down one connection in order, so the last attach wins. The
  abandoned read's work is thrown away. Renderer: windows are told first and briefly get nothing,
  then the bar for the new log.
- What the player sees: "Reading log…" and "Catching up on your log NN% ..." for the new character's
  log.

### 12b. (added) Switch A to B and back to A while B's attach is on the wire

- Verdict: **wrong data**. When: during a read or after live. Recovers by itself: no. How likely and
  how bad: rare-and-bad.
- What happens: Main: B's attach has been sent; before its reply is processed the turn moves on
  (back to A). The reply's continuation sees a stale turn and returns WITHOUT recording that the
  engine is now on B, so main still believes it is attached to A. The new turn for A compares A with
  A and sends no attach. Engine: reads B to the end and goes live on B. Main: the next health answer
  says live, main records 'live on A' and starts serving. The health answer's own mark names the log
  the engine is really on, and nothing compares it. Renderer: character A's name in the title bar
  over character B's fights, loot, timers. The window is one loopback round trip wide, longer when
  the engine is starved, so it takes an unlucky double pick or two automatic switches meeting.
- What the player sees: nothing: the app looks normal, with the other character's data under this
  character's name. No "Reading log…" panel, so no box.
- Fix (typescript, S): Record what the engine was told before the turn check (write l.attachedTo, or
  null it, as soon as the attach resolves), and refuse to go live when the health mark's log is not
  the log main thinks is attached.

### 12c. The player points the app at an EverQuest folder with no logs in the middle of a read

- Verdict: **wrong message**. When: during the first read. Recovers by itself: partly. How likely
  and how bad: rare-and-mild.
- What happens: Main: the folder change pushes the new directory to the engine, finds no character,
  sets the character to none and sends the rebuild with null. The client forgets its attach but, as
  the code says, there is no detach in the protocol. Engine: keeps reading the old log to the end
  and then follows it. Main: the fold wait for that read has ended and nothing calls the live edge,
  so the banner stays in its folding phase and stops on the final 100% frame. When a log later
  appears in the new folder the 2 s rescan attaches it and everything resets. (A folder change to
  one that has logs is row 12a.) Renderer: the no-character empty state under a catch-up bar for a
  log nobody is looking at.
- What the player sees: The no-logs empty state, with the band "Catching up on your log NN%" still
  running and then stuck at "100%". No Reading log... panel, so no box.
- Fix (typescript, S): When the rebuild carries no character, take the bar down (set the launch
  state out of 'folding'). A real detach that stops the engine reading is a protocol addition.

### 13. The app is closed in the middle of a read

- Verdict: **handled**. When: during the first read. Recovers by itself: yes. How likely and how
  bad: likely-and-mild.
- What happens: The window's X only hides the app to the tray: the engine keeps reading and the read
  finishes in the background. A real quit (tray menu, updater, logoff) runs the teardown: alerts
  handed back, main's client and the renderer relays closed, the engine's stdin closed. Engine: a
  dedicated thread sees end-of-file on stdin and exits 0 at once, mid-read; nothing is being written
  during a historical read, and the two state files are written by temp-file-and-rename. If the app
  is killed or crashes, Windows closes the pipe and the engine exits the same way, so no engine is
  left behind (the one exception is an engine frozen by another program; the 2 s kill timer does not
  hold the quit open). Next launch: a new engine with a new token and port, and the read starts
  again at byte 0; nothing is checkpointed. A log so large that it never finishes inside one sitting
  is therefore never finished by quitting and relaunching (the size question belongs to another
  class).
- What the player sees: Next launch: "Reading log…" and "Catching up on your log" from 0% again.

### 14. (added) Half-updated install: new app, old engined.exe (protocol version differs), or an engine that rejects the token

- Verdict: **wrong message**. When: at start. Recovers by itself: no. How likely and how bad:
  rare-and-mild.
- What happens: Engine: starts and announces; its announce line carries its protocol number, which
  the supervisor parses and never compares. Main: the first probe's hello fails with
  protocolMismatch or refused; these are not transient, so the launch ends 'unhealthy' on the first
  ask. Three launches raise the card; retries run every 30 s for ever and cannot succeed. Renderer:
  the card uses the engine-stopped-responding words; only the small detail line tells the truth, and
  no advice to reinstall is given. The words for a damaged install exist (bad-announce) but are not
  used here.
- What the player sees: Card: "The data engine stopped responding" / "It starts, and then stops
  answering. It has tried 3 times." / consequence sentence / "It last said: the engine speaks
  protocol N, this build speaks M". Box: "The data engine keeps failing to start."
- Fix (typescript, S): Map an unhealthy ending whose reason is protocolMismatch (or a mismatched
  announce) to the bad-announce words: not the engine this version expects, reinstalling replaces
  it.

### 15. (added) A launch that fails inside wire() before beginLaunch stores it (the child has no stdin, or the token write throws at once)

- Verdict: **not settled by the code**. When: at start. Recovers by itself: not-settled-by-the-code.
  How likely and how bad: rare-and-bad.
- What happens: Main: writeToken calls endLaunch synchronously from inside wire(); endLaunch
  schedules the relaunch; then beginLaunch assigns the already-finished launch to this.launch. When
  the relaunch timer fires it sees a launch in place and does nothing, so the supervisor would sit
  in 'backoff' for ever with no card (only one failure was counted). Whether Node can hand back a
  child with no stdin for the spawn options used here is not settled by this repo's code; with stdio
  'pipe' it normally cannot, so this may be unreachable.
- What the player sees: If reachable: "Reading log…" and box "Waiting on Starting the data engine."
  / "Engine restarting" indefinitely.
- Fix (typescript, S): Store the launch before wiring it (or clear a finished launch in the timer).
  Experiment: a unit test with a fake child whose stdin is null, asserting a second spawn happens.

## The report, and every place a player can still be left waiting

### Report wait = noCharacter. Input: getActiveCharacter() is null. Checked first, before every engine check.

- Verdict: **handled**. When: at start. Recovers by itself: yes. How likely and how bad:
  rare-and-mild.
- What happens: Engine: left idle, never attached (engineClientHost attachAndProbe returns on a null
  target). Main: composeLogReadReport returns noCharacter whatever the engine state is. Renderer:
  with no logs at all App draws NoLogsEmptyState and no panel mounts; with a list but no active
  character the panels mount and wait. The idle rescan (session.ts watchForFirstLog, every 2 s)
  attaches when a log appears.
- What the player sees: "Reading log…", then after about 17 s the box: "Waiting on No character log
  is selected." (never shown at once; only the renderer's 15 s mounted rule shows it)

### Report wait = engineMissing. Input: supervisor status 'absent' OR fault.kind 'no-binary' (engine program not on disk, for example quarantined by antivirus).

- Verdict: **told, but stuck**. When: at start. Recovers by itself: no. How likely and how bad:
  rare-and-bad.
- What happens: Engine: never spawned. Main: supervisor.beginLaunch sets 'absent', schedules no
  retry, raises the fault once. Renderer: failure card on every tab (MainColumn) with Try again /
  Report this / Where it looked; the box agrees and shows at the first ask (5 s after the panel
  mounts).
- What the player sees: Card: "EQ Companion cannot find its data engine" plus the antivirus remedy
  and "Until it starts, EQ Companion cannot read your log at all - every panel will stay empty."
  Box: "Waiting on The data engine program is missing."
- Fix (typescript, S): While 'absent', re-probe the disk on a slow timer (every 30 s) by calling the
  same path the Try again button uses, so a restored file is picked up without a click.

### Report wait = engineFailing. Input: a standing fault of any other kind, raised only when 3 launches in a row each end inside 30 s without reaching READY.

- Verdict: **handled**. When: at start. Recovers by itself: yes. How likely and how bad:
  rare-and-mild.
- What happens: Engine: exits, never announces, or fails its first health probe, three times. Main:
  fault raised at the collapse edge; the 30 s backoff keeps retrying underneath; a launch that
  reaches READY clears the fault. Renderer: card on every tab plus the box at once; both name the
  same thing.
- What the player sees: Card headline per kind (for example "The data engine keeps shutting down"),
  "It last said: <last stderr line>", Try again. Box: "Waiting on The data engine keeps failing to
  start."

### Report wait = engineStarting, and the loop it hides: an engine that reaches READY and then dies (abort, out of memory, killed by a security product), every time. Input: fault null and supervisor status is anything but 'ready'.

- Verdict: **restart loop**. When: any. Recovers by itself: no. How likely and how bad:
  rare-and-bad.
- What happens: Engine: starts, answers the first probe, dies during or after the read. Main: READY
  resets both the failure count and the quick-exit trail (supervisor.ts:605-608), so the streak
  never reaches 3 and no fault is ever raised; restart delay stays at 1 s; each respawn re-attaches
  and re-reads the whole log. The served-exit count goes to the error store only. Renderer: bar
  restarts from 0% each cycle; the box alternates between two reassuring sentences; its 'Waiting'
  time resets every cycle. A launch that fails after 30 s or more also resets the trail
  (engineProtocol.ts:549-551).
- What the player sees: "Catching up on your log" climbing and restarting; in the panels "Reading
  log…" with the box alternating "Starting the data engine." and "Still reading your log." No card,
  no count of deaths.
- Fix (typescript, M): Feed the served-death count (supervisor onServedExit already fires) into
  logReadState; add a wait 'engineCycling' shown at once: 'The data engine has stopped N times while
  reading your log.' Raise the failure card at 3 cycles and grow the backoff for served deaths. Do
  not reset 'Waiting' on a respawn.

### Report wait = notConnected. Input: supervisor 'ready' and main's client state is not 'ready' (no client, 'connecting', 'failed', 'closed'). Causes: the one connect attempt failed; a world rebuild landed during the connect and the turn guard closed a good channel; handshake refused or protocol mismatch.

- Verdict: **told, but stuck**. When: at start. Recovers by itself: no. How likely and how bad:
  rare-and-bad.
- What happens: Engine: healthy and idle (never attached). Main: openConnection tries once per
  launch; on failure records a 'connect' error and returns; on the turn-guard path it closes the
  channel and records nothing, leaving the client in 'connecting' forever (requests then wait out
  the 15 s deadline each). Nothing reconnects. The supervisor's health watch uses its own fresh
  sockets, so it keeps reporting 'ready' and never respawns. Renderer: box after 15 s; no card, no
  retry button.
- What the player sees: "Reading log…", then: "Waiting on The app cannot connect to its data
  engine." / "Engine running, connecting" (or "running, connection failed") / "Last error connect:
  <message>" or "none"
- Fix (typescript, S): Retry the connection with a fresh client on a short backoff while the
  supervisor is 'ready'; replace the turn guard at line 332 with the connection guard (live?.client
  === client) so a rebuild cannot discard a good channel.

### Report wait = attachRefused. Input: the recorded error's step is 'attach': session.attach was answered with an error, or got no answer inside the 15 s request deadline.

- Verdict: **told, but stuck**. When: at start. Recovers by itself: no. How likely and how bad:
  rare-and-bad.
- What happens: Engine: either refused, or (deadline case) may have accepted late and be reading
  normally. Main: sendAttach records the error and returns null; no wait loop starts; attachedTo
  stays null; nothing retries until the next turn (character switch or respawn). In the deadline
  case the engine goes live but main never observes it, so every read stays unserved. Renderer: box
  at once.
- What the player sees: "Waiting on The data engine refused the log file." / "Last error open log:
  <code: message>"
- Fix (typescript, S): Retry the attach a bounded number of times with a pause; after a deadline
  (not a refusal) start the health wait anyway so a late acceptance is still observed. Word the
  deadline case 'did not answer' rather than 'refused'.

### Report wait = logMissing. Input: (error step 'fold' OR last health 'idle') AND main's own open of the file fails with ENOENT at the moment the panel asks.

- Verdict: **told, but stuck**. When: during the first read. Recovers by itself: no. How likely and
  how bad: rare-and-bad.
- What happens: Engine: accepts the attach, File::open fails, prints "the ingest of <path> ended: …
  (os error 2)", reports idle. Main: foldWait sees idle, ends the wait, sets attachedTo = null,
  records the error with the 4 newest stderr lines. Nothing re-attaches. The launch state stays
  'folding' with no measurement, so no bar and no card. Renderer: box at the first ask on
  Overview/Combat; other tabs show their empty-state text.
- What the player sees: "Waiting on The log file is missing." / "Log eqlog_<name>_<server>.txt" /
  "Engine running, connected, not reading" / "Last error read: the engine reports idle after an
  accepted attach" / Engine said lines. After the file comes back the first line changes to "The
  data engine stopped before the end of your log." and nothing else changes.
- Fix (typescript, M): Store the probe result at the moment the read ended (so the sentence does not
  drift), and while the wait is logMissing / logUnreadable / readerStopped have main re-probe on a
  timer and re-attach when the probe result changes (file appears, lock released), with a backoff so
  a repeating panic is not hammered.

### Report wait = logUnreadable. Input: read ended as above AND main's open fails with any code other than ENOENT (file held with no sharing, access denied, also EMFILE and the like).

- Verdict: **told, but stuck**. When: during the first read. Recovers by itself: no. How likely and
  how bad: rare-and-bad.
- What happens: Engine: File::open or a later read fails (os error 32 or 5), prints the 'ended'
  line, idle. Main: same as the missing case; the probe opens the file itself with full sharing and
  classifies every non-ENOENT failure as 'unreadable'. Renderer: box at once. When the lock is
  released the probe succeeds and the sentence drifts to 'stopped before the end'; nothing
  re-attaches.
- What the player sees: "Waiting on Windows will not let the app read the log file." plus the Engine
  said line carrying the OS error. No word on what to close.
- Fix (typescript, S): Same re-probe and re-attach as the missing row; add the try line 'Close any
  program that has the log open (a parser, an editor, a backup or sync tool)'.

### Report wait = readerStopped, and the bar that contradicts it. Input: read ended and main can open the file. Causes: a panic in the read (caught), a read error part-way, a lock that has since gone, a thread that could not start.

- Verdict: **wrong message**. When: during the first read. Recovers by itself: no. How likely and
  how bad: likely-and-bad.
- What happens: Engine: prints 'PANICKED' or 'ended: <error>', reports idle, process stays up. Main:
  wait ends, error recorded, attachedTo cleared, no retry; a re-attach re-reads the whole log and a
  panic repeats at the same line on every launch. Nothing moves the launch state off 'folding' (only
  live, starting or a fault do), so the last progress measurement stays pushed. Renderer: box at
  once says stopped; the band above it on every tab still draws the frozen bar, possibly with a
  frozen 'about Nm left'.
- What the player sees: Box: "Waiting on The data engine stopped before the end of your log." /
  "Read so far 1.2 GB (43%), N events" / Engine said. Band, on every tab: "Catching up on your log
  43% …" frozen.
- Fix (typescript, M): On failed('ended') call a new launch-state note (phase 'readEnded') so the
  bar comes down and the band says 'EQ Companion stopped reading your log' on every tab with a Try
  again button that re-attaches (new IPC, bumps the turn).

### Report wait = stalled. Input: last health status is 'folding' AND 60 s since the offset last grew. The clock starts at the first health answer of the turn (offset 0 is present from 'starting').

- Verdict: **told, but stuck**. When: during the first read. Recovers by itself: partly. How likely
  and how bad: rare-and-mild.
- What happens: Engine: the offset in health is the end of the last complete line, updated at most
  every 250 ms at a 1 MB read boundary. Main: noteLogReadHealth moves movedAt only on growth. True
  stalls: the read blocked on storage (dead share, cloud placeholder). False alarms the code allows:
  (a) machine sleep, wall clock jumps, clears at the next 0.4 s poll; (b) a long run with no newline
  (for example a block of NUL bytes after a crash) holds the offset still while bytes are read and
  re-scanned; (c) the stretch after the last byte and before 'live' (ticking.beat, then
  report_fold_landed building every open view) has status 'folding' and a fixed offset: its length
  is not settled by the code. Nothing restarts a true stall: the supervisor's probe still passes.
- What the player sees: "Waiting on The data engine has stopped making progress." at the first ask,
  with "Read so far" frozen. It disappears by itself if the offset moves.
- Fix (both, S): TypeScript: when offset equals the stated log size say 'Finishing the read' instead
  of stalled; after a true stall of some minutes re-attach once. Engine (optional): put the read
  cursor beside the mark in session.health so 'bytes are still being read' is visible. Experiment
  for (c): time a multi-GB fold and log the gap between the last progress frame and 'live'.

### A read that hangs before the scan starts (status 'starting' or 'attaching': File::open blocked on a cloud-only or network file, spell data, state files). Lands in wait = reading.

- Verdict: **wrong message**. When: during the first read. Recovers by itself:
  not-settled-by-the-code. How likely and how bad: rare-and-bad.
- What happens: Engine: stuck before report_status(Folding); health keeps answering 'attaching' with
  offset 0. Main: foldWait polls forever by design; stalled() requires status 'folding', so it never
  fires; no error is recorded. Renderer: box after 15 s with the healthy sentence.
- What the player sees: "Waiting on Still reading your log." / "Engine running, connected, opening
  the log" / "Last error none", for as long as it hangs.
- Fix (typescript, S): Apply the 60 s no-growth rule to every non-live, non-idle status, with its
  own sentence: 'The data engine cannot open your log.'

### Report wait = notAnswering, case (b): the engine is live but the Overview/Combat combat read is never served. Input: readiness ok AND the last combat.snapshot from any window ended refused, timed out (main's 2 s deadline) or failed the 60 s clock test.

- Verdict: **wrong message**. When: after live. Recovers by itself: partly. How likely and how bad:
  likely-and-bad.
- What happens: Engine: live and answering health and module reads; the combat snapshot takes over 2
  s or is rejected by the projection. Main: readShim answers the empty shape with hydrating: true
  every poll; noteCombatRead stores the phrase. Renderer: a world with no real answer yet draws
  'Reading log…' (combatFeed only keeps a previous real answer); a new launch has none, so this
  survives restarts. Other tabs work. The box blames the engine.
- What the player sees: "Reading log…" on Overview and Combat indefinitely; box: "Waiting on The
  data engine is not answering." / "Engine running, connected, caught up" / "Last error the engine
  did not answer in time". Loot, Leveling and the rest show data.
- Fix (typescript, S): New wait 'panelSlow': 'Your log is read. This panel's numbers are taking too
  long to build.' with the read's last duration; give a world with no kept answer a longer deadline
  for its first combat read (up to the client's 15 s) instead of 2 s. Keep one lastCombatRead per
  window, not one slot for all.

### Report wait = notAnswering, case (a): three health polls in a row refused or unanswered (15 s each). Input: error step 'health'.

- Verdict: **told, but stuck**. When: during the first read. Recovers by itself: partly. How likely
  and how bad: rare-and-mild.
- What happens: Engine: wedged or its health answer blocked. Main: foldWait stops asking for this
  turn and records the error; it never asks again by itself. A hang that long also spans a
  supervisor probe (30 s interval, 5 s timeout, one confirm), which declares the launch unhealthy
  and respawns, starting a new turn. Renderer: box after the 15 s rule, then the respawn's bar.
- What the player sees: "Waiting on The data engine is not answering." / "Last error status check:
  timeout…", then usually "Starting the data engine." and a new "Catching up on your log".
- Fix (typescript, S): After 'unanswered', keep a slow health ask (every 15 s) for the same turn so
  an engine that comes back is picked up without waiting for a respawn.

### Report wait = reading (healthy case, including a very large log). Input: engine up and connected, no recorded error, health not idle, not stalled, readiness not ok.

- Verdict: **handled**. When: during the first read. Recovers by itself: yes. How likely and how
  bad: likely-and-mild.
- What happens: Engine: scanning; progress frame every 250 ms. Main: wait loop never gives up on a
  folding engine; narrates to the console. Renderer: bar on every tab with percent, bytes, events
  and an estimate; the box joins after 15 s with the same numbers.
- What the player sees: Band: "Catching up on your log 62% 148.8 MB of 238.4 MB … about 40s left".
  Box after 15 s: "Waiting on Still reading your log." / "Read so far 148.8 MB (62%), N events"

### Report wait = ok. Input: readiness ok AND the last combat read (from any window) was served or none exists. The panel is still on 'Reading log…'.

- Verdict: **not settled by the code**. When: after live. Recovers by itself:
  not-settled-by-the-code. How likely and how bad: rare-and-mild.
- What happens: Engine: live. Main: nothing wrong on record. Reachable when the served snapshot
  itself carries hydrating: true, or when an overlay's served read overwrote this panel's failed one
  in the single lastCombatRead slot. Whether either lasts beyond a moment is not settled by the
  code. Renderer: only the 15 s mounted rule shows the box.
- What the player sees: "Waiting on The data engine is answering; this panel has no reply yet."
- Fix (typescript, S): Record lastCombatRead per window and include whether the served snapshot said
  hydrating, so this state names its cause. Experiment: after go-live, log combat.snapshot.hydrating
  for 30 s on a large log.

### Every other tab while the read is not live or has ended (Loot, Leveling, Timers, Buffs, Skills, Gaps, Bazaar). They read module snapshots; an unserved one is null.

- Verdict: **wrong message**. When: any. Recovers by itself: partly. How likely and how bad:
  likely-and-bad.
- What happens: Engine: not live, idle or gone. Main: serveModuleSnapshot answers null. Renderer:
  each view coalesces null to its empty shape and prints its 'nothing in your log' text. The only
  reason available is the band, and it is absent for a read that ended before its first progress
  frame, for notConnected, attachRefused and notAnswering.
- What the player sees: Loot: "No loot parsed yet. Loot something in-game (or check your log path) -
  every --You have looted …-- line shows up here in real time, and the full history is read from
  your log on launch." Leveling: "No level-ups or AA gains found in this character's log yet.
  They'll appear here live as you play." Timers: "Nothing has died yet in this log." Buffs: "No
  active buffs." Skills: only "Skills appear here once the log shows them going up." Gaps: a bare
  spinner. Bazaar: an empty table.
- Fix (typescript, M): One shell band in MainColumn fed by the same LogReadReport (main pushes it on
  change while the read is not live): the report's sentence on every tab. Views keep their empty
  text only when the snapshot is non-null.

### Floating overlays while the read is not live, has ended, or the engine went away.

- Verdict: **silent**. When: any. Recovers by itself: partly. How likely and how bad:
  likely-and-mild.
- What happens: Meter overlays (fight, overall, heal, swing): poll combat.snapshot; with no real
  answer the header reads 'Reading log…' and nothing else; once a real answer is held a hydrating
  stand-in never replaces it and the 'updating' flag is dropped. Module overlays (buffs, XP,
  respawn, event log, gaps): draw the empty shape before live; on a null snapshot they keep whatever
  state they hold, including across a character switch until the new read is live. None has the box.
- What the player sees: Meters: "Reading log…" in the header, no reason; later, the last numbers
  with no mark. Module overlays: nothing: empty window, or the last rows (possibly the previous
  character's) as if current.
- Fix (typescript, S): On a null snapshot after a world-changed or character frame, reset to the
  empty shape; show a one-word 'not updating' mark in the overlay header when the feed says updating
  for more than a few seconds.

### After live: the log file is deleted, renamed or moved while the engine follows it.

- Verdict: **silent**. When: after live. Recovers by itself: yes. How likely and how bad:
  rare-and-bad.
- What happens: Engine: the tail's metadata call returns NotFound, treated as a normal 'missing'
  poll, no error, no stderr line; status stays live. Main: polls session.health only until live,
  never after, so nothing notices; reads are still served from the last state. Renderer: an hour
  later every tab and overlay shows the last numbers as current; the green dot stays lit. When the
  file reappears the tail reopens it; if it is smaller the tail restarts at byte 0 (next row).
- What the player sees: nothing: the last numbers, unchanged, with the green dot on.
- Fix (both, M): Engine: add the tail's condition to session.health (missing, last poll error, when
  bytes were last read). Main: keep a slow health poll after live (5 s) and push a band 'Your log
  file is gone; numbers are from HH:MM'.

### After live: the log is locked or unreadable for a while (another program holds it, a read error).

- Verdict: **silent**. When: after live. Recovers by itself: yes. How likely and how bad:
  rare-and-mild.
- What happens: Engine: each failed poll prints "a tail poll of <path> failed: <error>" (poll
  interval at most 400 ms), drops the handle, keeps the offset, stays live; when the lock goes the
  next poll reads from the same offset, so no line is lost. Main: the lines go to the console and
  the 8-line ring only; no error is recorded because no wait is running. Renderer: numbers stop,
  nothing says why.
- What the player sees: nothing: the last numbers, unchanged, until the lock is released.
- Fix (both, M): Same health field and slow poll as the previous row; band text 'Another program is
  holding your log file; numbers are from HH:MM'. Engine: print the failure once per streak, not per
  poll.

### After live: the log is rewritten shorter in place (a trim or rotate tool), added from the code.

- Verdict: **wrong data**. When: after live. Recovers by itself: no. How likely and how bad:
  rare-and-bad.
- What happens: Engine: the tail sees size below its cursor, resets to byte 0 and emits every
  surviving line again; the read loop folds them as live lines into the same state that already
  counted them, and live lines can fire alerts. Main and renderer: served as normal.
- What the player sees: nothing: totals jump (loot, kills, XP counted twice) and alert sounds may
  play for old lines.
- Fix (engine, M): On a restart at byte 0 the read loop should end this fold and start a fresh one
  (a new generation, history folded as not live) instead of feeding the lines to the standing state.

### After live: a panic in the follow loop (caught; the engine process stays up and reports idle).

- Verdict: **silent**. When: after live. Recovers by itself: no. How likely and how bad:
  rare-and-bad.
- What happens: Engine: prints PANICKED, status idle, the snapshot door closes (module and combat
  reads now answer an error). Main: the health wait ended at go-live and nothing polls again;
  engineLiveOn stays set so readiness still says ok; reads come back refused and the empty shape is
  served; no error recorded, no turn bump, no re-attach. Renderer: no cursor ever arrives, so module
  tabs and overlays keep the last state; Combat keeps its last numbers under a small badge; Overview
  keeps them with no badge.
- What the player sees: Combat: "Updating…" badge, indefinitely. Everywhere else: nothing: the last
  numbers as if current.
- Fix (typescript, M): Keep a slow session.health poll after live; on 'idle' record the error, clear
  engineLiveOn, push the world-changed frame, raise the band, and re-attach once.

### After live: the engine process dies once.

- Verdict: **handled**. When: after live. Recovers by itself: yes. How likely and how bad:
  rare-and-mild.
- What happens: Engine: gone. Main: supervisor ends the launch, tells the client (connection closed,
  turn bumped, world-changed frame pushed), backs off 1 s, respawns; the new launch attaches and
  re-reads the whole log. Renderer: module tabs re-ask, get null and print their empty-state text;
  Combat shows the badge; the bar appears with the first progress frame; at live everything
  re-hydrates.
- What the player sees: For a few seconds the empty-state texts (for example "No loot parsed yet…")
  and "Updating…", then "Catching up on your log N%", then data again. No sentence says the engine
  stopped.

### After live: main's own connection to the engine drops while the engine stays healthy.

- Verdict: **silent**. When: after live. Recovers by itself: no. How likely and how bad:
  rare-and-bad.
- What happens: Engine: fine, still following the file. Main: the client goes 'failed'; nothing
  reconnects; no world-changed frame is sent (only an engine-gone edge or a stop sends one);
  readiness says notConnected, every read is unserved. The supervisor probes on its own sockets and
  keeps the launch 'ready'. Renderer: module tabs keep their cached state (no cursor marks them
  stale); Combat badge; Overview and overlays stale. If the player relaunches a panel in a new world
  the box says 'cannot connect'.
- What the player sees: Combat: "Updating…" indefinitely. Everywhere else: nothing: the last numbers
  as if current.
- Fix (typescript, S): Listen to the client's state in main; on 'failed' build a fresh client on the
  same port and token, re-attach, and push the world-changed frame.

### Title bar and tray as a status signal.

- Verdict: **wrong message**. When: any. Recovers by itself: no. How likely and how bad:
  likely-and-mild.
- What happens: Main: pushes cursors and the world-changed frame on the same channel. Renderer: the
  green dot is set by any frame on that channel, including the one sent when the engine goes away,
  and is cleared only by a character switch. Tray: tooltip is the app name; menu is Open, Keep
  running in the tray, Quit.
- What the player sees: A green dot that stays on through every failure after the first log line;
  tray tooltip "EQ Legends Companion TEST"; no state in either.
- Fix (typescript, S): Ignore the world-changed frame for the dot; turn the dot off when the
  report's wait is not ok/reading or no cursor has arrived for N minutes while the game is writing;
  tooltip 'Last log line read HH:MM'.

### The launch card versus the new box: when each shows and where they disagree.

- Verdict: **wrong message**. When: any. Recovers by itself: no. How likely and how bad:
  likely-and-bad.
- What happens: Card: only for 'no binary' and for 3 fast launch failures; comes down on READY or on
  Try again. Bar: only while the launch state is 'folding' and a progress frame has arrived. Box:
  only inside the Overview/Combat hydrating panels. Disagreements: (1) a read that ended after some
  progress leaves the bar up while the box says stopped; (2) an engine failing slowly or after READY
  has no card while the box says 'Starting'; (3) connection, attach and read failures have a box
  sentence but no card and no retry button anywhere; (4) the card prints its detail line unscrubbed
  while the box scrubs the same text.
- What the player sees: Example of (1): band "Catching up on your log 43%" above a box that says
  "The data engine stopped before the end of your log."
- Fix (typescript, M): Make the band and the box one source: drive the band from LogReadReport.wait
  (the rows above), with Try again wired per wait (relaunch for engine waits, reconnect for
  notConnected, re-attach for the read waits).

### What the player is told to do. No sentence in LOG_READ_WORDS carries an action; the only instruction in the box is to post a screenshot.

- Verdict: **told, but stuck**. When: any. Recovers by itself: no. How likely and how bad:
  likely-and-mild.
- What happens: Engine: n/a. Main: n/a. Renderer: logReadLines prints seven rows and the closing
  line. The one manual way to start a fresh read without restarting is to pick a character: main
  re-attaches on any setCharacter, but the title-bar picker is an MUI Select, whose onChange is not
  expected to fire for the value already selected (library behaviour, not settled by this repo's
  code), so a one-character player has only a restart.
- What the player sees: "Stuck here? Post a screenshot of this box on your report."
- Fix (typescript, S): Add a 'Try' row from a LOG_READ_TRY table. noCharacter: 'Pick your character
  in the title bar.' engineMissing: 'Check your antivirus quarantine, then reinstall.'
  engineFailing: 'Press Try again above; if it keeps failing, reinstall.' engineStarting: 'Nothing
  yet. If this lasts over a minute, restart the app.' notConnected: 'Restart the app; a security
  program may be blocking it.' attachRefused: 'Restart the app.' logMissing: 'In game, type /log
  on.' logUnreadable: 'Close any program that has the log open.' readerStopped: 'Restart the app; if
  it stops at the same place, send this screenshot.' stalled: 'If Read so far does not move for a
  minute, restart the app.' notAnswering: 'Restart the app.' reading: 'Nothing to do. Large logs
  take a while.' Plus a Try again button (new IPC that bumps the turn and re-attaches).

### Privacy of the box: full path, Windows user name, token, character chat.

- Verdict: **not settled by the code**. When: any. Recovers by itself: not-settled-by-the-code. How
  likely and how bad: rare-and-bad.
- What happens: Confirmed from the code: the report carries the log's base name only; error detail,
  fault detail and each Engine said line pass scrubPaths (log path to base name, home directory and
  any <drive>:/Users/<name> to ~); the launch token is replaced at the supervisor door before any
  line is kept; the combat-read phrase is a fixed string. Gaps: (a) stderr lines are cut to 200
  characters before scrubbing, so a cut path no longer matches the log-path pattern: the user folder
  is still removed, but an install outside /Users/ prints its folders in full; (b) a user name with
  a space in a profile path that is not the current home loses only its first word; (c) there is no
  panic hook, so Rust prints the panic message to stderr and the 4 newest lines at the error are
  shown: a string-slice panic quotes the string being sliced, which in the read is log text. Which
  panics are reachable is not settled by the code; (d) the card above the box prints fault.detail
  unscrubbed, and a spawn failure's detail begins with the full program path; (e) the base name
  shows character and server name, by design.
- What the player sees: "Log eqlog_<name>_<server>.txt, 238.4 MB" and up to 4 "Engine said" lines
  such as "[…] the ingest of eqlog_<name>_<server>.txt ended: … (os error 32)"
- Fix (both, S): TypeScript: hand onEngineSaid the redacted line before the 200-character cut and
  cut after scrubbing; run the card's detail through scrubPaths. Engine: install a panic hook that
  prints file and line only, never the message. Experiment for (c): feed a log line with multi-byte
  characters at every slice point under a debug build and read stderr.

### The periodic ask itself (useLogReadReport) and stale values in what it returns.

- Verdict: **handled**. When: any. Recovers by itself: yes. How likely and how bad: rare-and-mild.
- What happens: Renderer: first ask 5 s after a hydrating panel mounts, then 3 s after each answer
  (chained, so asks never pile up); a healthy launch asks nothing. A rejected ask keeps the last
  answer and asks again. Main per ask: a few field reads, at most one open+stat+close of the log
  (only when the read ended or no size is known), a handful of regexes. Gaps: the probe has no
  timeout, so a hanging open (unreachable share) leaves the invoke pending and the chain never asks
  again; the 5 s delay restarts on every mount, so a dead read shows bare 'Reading log…' for 5 s on
  each visit; notes are read before the probe is awaited and the supervisor status after; the stderr
  ring survives a respawn, so an early error on a new launch can quote the previous process;
  'Waiting' counts from the last turn, not from when the player started waiting.
- What the player sees: "Reading log…" alone for the first 5 s of every visit; then the box,
  refreshed every 3 s.

## What the skeptic overturned

- 1c / 9b. The log is deleted or renamed away DURING the first read and the game recreates it before
  the read ends Claimed: The first read finishes on its open handle, goes live, and when the name
  comes back the tail restarts at byte 0, so the new lines fold on top of the history. Recovers:
  yes. Actually: True only for lines written after go-live. The first read does run to the end of
  the old (deleted) file. But the tail is then opened with TailStart::At(checkpoint), and
  FileTail::open clamps that start to the size of whatever file now has the name:
  `(TailStart::At(at), Some(size)) => at.min(size)`. The new file is smaller, so the cursor is set
  to the new file's current end, the shrink test (`size < read_offset`) never fires, and every line
  the game wrote into the new file between its creation and go-live is skipped for good. On a large
  log that window is minutes. The after-live half of the claim (stat NotFound, vanished, reopen,
  restart at 0) is confirmed, with the claim's own open question about delete-pending handles still
  open. Verdict now: wrong-data (mild, silent): lines written to the recreated file before go-live
  are never read. After live: as claimed.. Fix: Engine, S: in FileTail::open do not clamp
  TailStart::At to the current size (keep `at`); the first poll's shrink rule then restarts at byte
  0 and reads the whole new file. One test beside the existing truncation tests.
- 3c / 4c / 6b and the report row 'After live: the log is locked or unreadable for a while' (lock,
  permissions, network share or USB drive drops out and comes back) Claimed: The tail either waits
  silently (NotFound) or prints an error each poll, keeps its cursor, stays live and continues from
  the same byte when the cause goes away. Main does not ask health after live. Recovers: yes.
  Actually: Confirmed for errors that return quickly (sharing violation, access denied, a drive that
  is simply gone). Two corrections. (1) Health IS asked after live: the supervisor's watchdog sends
  session.health every 30 s for the whole launch; it only ignores the status. (2) Every
  session.health answer stats the log file on the connection thread (`log_mtime_ms:
  fold.log.as_deref().and_then(mtime_ms)`, a plain fs::metadata). If that stat blocks instead of
  failing (a dropped SMB share is the usual case), the watchdog's probe misses its 5 s limit, the
  confirmation misses it too, and the healthy engine is ended as 'unhealthy' and respawned. The new
  engine's health answers before attach (no log yet), reaches READY, attaches, and its File::open
  meets the same path: if it now fails fast the read ends idle and nothing retries when the share
  returns (box: 'The log file is missing.'); if it blocks, the loop repeats about every 40 s with no
  card, because each launch lives longer than 30 s and reached READY. How long Windows blocks a stat
  on a dropped share is not settled by the code. Experiment: put a log on a share, go live, disable
  the network adapter, watch the console for 'health probe failed (timeout)'. Verdict now:
  silent-stuck while it lasts and self-recovering for fast failures (as claimed). For a path whose
  calls hang: crash-loop, and it can end told-but-stuck after the cause is gone. Not settled by the
  code whether the hang is long enough.. Fix: Engine, S: take the mtime off the health path (have
  the ingest thread record it at each poll and health copy it), so health never touches the
  filesystem. TypeScript, S: let the watchdog's 30 s answer raise a note when status is not 'live'
  after go-live.
- 4b. Permission denied on the Logs folder (it cannot be listed) Claimed: Empty list either way; if
  the saved file can still be opened the engine reads it normally; the main screen shows the no-logs
  text. Recovers: yes. Actually: Two different cases. No character attached: confirmed, the 2 s
  rescan attaches when the folder becomes readable and pushes the folder config so the list is
  re-read. Saved file still opens: the engine reads and goes live, but the renderer's list is empty
  so every view is replaced by 'No EverQuest logs found yet ... type /log on' while the read is
  fine. That list is re-read only at mount, on a character push and on a folder-config push. With a
  character attached the rescan never runs and nothing pushes the config, so the screen stays wrong
  after the permission is restored, until a restart or a folder change in Preferences. Verdict now:
  wrong-message, and in the attached case it does not recover by itself. Fix: TypeScript, S: gate
  the empty state on 'no character AND empty list' (App.tsx), so an attached character always shows
  its views; optionally re-list on window focus.
- Report: the periodic ask itself (useLogReadReport) Claimed: Recovers: yes, with a listed gap that
  the probe has no timeout. Actually: The listed gap is a non-recovery, so the row is not 'yes'.
  buildLogReadReport awaits probeLog with no limit; the renderer arms its next ask only inside the
  `.then` of the previous one. One open that never returns leaves the invoke pending, the chain
  stops, and the box freezes on its last answer (or never appears) for as long as the panel stays
  mounted. Also not in the claim: while nothing has stated the log's size (engine starting, failing,
  not connected) or the read has ended, main opens and closes the log on every ask, every 3 s;
  tail.rs states that an open of this file triggers the antivirus on-access scan, so a stuck app
  with Overview or Combat open re-triggers that scan every 3 s. Verdict now: handled for ordinary
  files; silent-stuck (frozen box) when the open hangs. Fix: TypeScript, S: race probeLog against a
  2 s timer and report 'unreadable' on timeout; cache the probe result for the turn instead of
  reopening every 3 s.

## Situations the skeptic added

### A settings-file write fails while the character is being attached (disk full, config.json read-only, or held by antivirus, backup or cloud sync for more than 1 s)

- Verdict: **wrong message**. When: at start, on every launch while the cause lasts; also on a
  character switch. Recovers by itself: no. How likely and how bad: rare-and-bad.
- What happens: Main: tailCharacter sets `character = ref`, then runs attachCharacter inside
  batchStore. The batch flushes in a `finally`, conf's _write rethrows everything except EXDEV, so
  tailCharacter rejects BEFORE sendWorldRebuilt(ref). index.ts logs 'main:startTailing' and carries
  on. tsWorldPath is only ever set by the world-rebuilt observer, so it stays null. Engine: when it
  becomes ready, attachTarget() falls back to getActiveCharacter(), so the engine IS attached, reads
  the whole log and goes live. Main: engineServeReadiness needs tsWorldPath, answers notAttached for
  ever, so no read is ever served. Renderer: the bar runs to the end and goes away; every tab gets
  empty shapes. On a switch the same throw leaves the engine on the old log while main's character
  id is the new one, so per-character saves go under the wrong name.
- What the player sees: "Reading log…" for ever. After 15 s the box: "Waiting on Still reading your
  log." with "Engine running, connected, caught up" and "Last error none". The two rows contradict
  each other; that pair on a screenshot identifies this case.
- Fix (typescript, S): In tailCharacter, catch a throw from batchStore(attachCharacter), log it, and
  still call sendWorldRebuilt(ref): reading the log must not depend on saving a preference. In the
  report, give readiness 'notAttached' with health 'live' its own sentence.

### The engine's reader thread dies AFTER the read went live (a panic on a live line, a tick or a state-file step)

- Verdict: **told, but stuck**. When: after live. Recovers by itself: no. How likely and how bad:
  rare-and-bad.
- What happens: Engine: catch_unwind wraps the whole run, the tail loop included. It prints one
  'PANICKED' line, sets status idle and drops the ask door; the process stays up. Every
  module.snapshot is answered 'unavailable' at once. Main: nothing waits on status after live. The
  supervisor's 30 s probe still gets an answer, so the engine stays 'ready'. engineLiveOn and
  attachedTo keep their values, so readiness stays ok and every read is tried, refused and replaced
  by the empty shape. A world rebuild of the same log does not re-attach (attachedTo still equals
  the target); its wait sees idle, records 'ended' and only then clears attachedTo, so it takes a
  second rebuild to read again. Renderer: numbers stop; panels that ask again get empty shapes.
  Exact per-tab drawing was not traced.
- What the player sees: Numbers stop. Overview and Combat fall back to "Reading log…" with the box
  "Waiting on The data engine is not answering." Other tabs show their empty text with no reason.
- Fix (engine, S): Smallest: in the engine, a panic after the fold has landed exits the process, so
  the supervisor respawns and re-reads (the path that already works). Alternative in TypeScript:
  have the supervisor's 30 s health answer report a status that is not 'live' after go-live, clear
  attachedTo and attach once.

### While the app is live, the log is cut down to a non-empty remainder or replaced by a smaller non-empty file (a log-trimming tool that keeps the newest part, a restored backup)

- Verdict: **wrong data**. When: after live. Recovers by itself: no. How likely and how bad:
  rare-and-bad.
- What happens: Engine: the poll sees size below its cursor, restarts at byte 0 and emits every line
  still in the file again, on top of the state it already holds, and every one is stamped live
  (`live: LIVE`). So the kept window is counted twice, and each alert trigger in it fires as if it
  had just happened. Main: plays each fire frame. Renderer: totals jump. The tail module states this
  on purpose (rule 2: survivors are emitted again, no de-duplication).
- What the player sees: nothing in words: a burst of alert sounds and overlays for old lines, then
  totals for the kept window doubled until the app is restarted
- Fix (engine, M): On a restart where the file is not empty, end the tail and start the attach over
  as a fresh historical read (empty state, lines not live), so the numbers match the file and
  nothing fires.

### The log is on a path whose file calls hang at launch (unreachable network share, a cloud placeholder that must download first)

- Verdict: **restart loop**. When: at start / during the first read. Recovers by itself: partly. How
  likely and how bad: rare-and-bad.
- What happens: Engine: attach is accepted, the reader blocks in File::open or read with status
  attaching or folding. Each session.health answer also stats the log, so it blocks too. Main: the
  wait's asks pass their 15 s limit three times (about 48 s) and it stops with 'unanswered'. The
  supervisor's probe, 30 s after READY, times out twice and ends the launch; lifetime is over 30 s
  and the launch had reached READY, so no card is raised and the restart delay is 1 s. A new engine
  answers health before attach, reaches READY, attaches, and blocks again: a loop of about 40 s.
  Main's own probe for the box has no timeout, and main uses synchronous file calls on the Logs
  folder (existsSync, readdirSync, statSync), which can freeze the window. 'Stalled' never shows for
  status attaching or before the first offset. How long Windows blocks is not settled by the code.
  Experiment: point the app at a log on a share, block the server at the firewall, launch.
- What the player sees: "Reading log…"; the box, when it answers, moves between "Starting the data
  engine.", "Still reading your log." (Engine: opening the log) and "The data engine is not
  answering."; the window may stop responding
- Fix (both, M): Engine: health never touches the filesystem (S). TypeScript: time-limit the
  report's probe, and add a 'stuck opening the log' wait for status attaching past 60 s (S).

### The PC sleeps or hibernates during the read or after live

- Verdict: **handled**. When: any. Recovers by itself: yes. How likely and how bad: likely-and-mild.
- What happens: Engine: frozen with the machine, resumes where it was; the same handles and loopback
  sockets are still there. Main: the supervisor is told by powerMonitor; the watchdog stands down on
  suspend, drops any answer in flight, and asks again 5 s after resume, so a probe that straddled
  the sleep cannot end a healthy engine. The wait's own ask and its 15 s limit freeze together and
  at worst cost one refusal out of three. Renderer: unchanged. 'Waiting' and the time-left estimate
  jump by the length of the sleep.
- What the player sees: nothing new: the bar or the numbers continue after wake

### One reply from the engine is larger than 8 MiB (a module's whole state from a very large log), or any handler throws while a frame is being read

- Verdict: **told, but stuck**. When: after live. Recovers by itself: no. How likely and how bad:
  rare-and-bad.
- What happens: Engine: sends any size; the 8 MiB limit is applied only when receiving. Main: the
  line decoder throws frameTooLarge, the transport closes, the client goes to 'failed' and rejects
  everything. Main makes one connection per engine launch and never another. The supervisor's probes
  use fresh connections and keep passing, so the engine stays 'ready' and is not restarted. Every
  read is unserved from then on. If the size is the cause, a restart reads the log again and fails
  at the same reply. Whether any reply can reach 8 MiB is not settled by the code: module state is
  capped (progression states about 124k numbers at its caps), but no test measures reply sizes at
  the caps. Experiment: read the largest log available and record the byte length of each
  module.snapshot and combat.snapshot reply.
- What the player sees: All numbers stop; Overview and Combat show "Reading log…" and after 15 s
  "Waiting on The app cannot connect to its data engine." (Engine: running, connection failed). The
  words do not name the cause.
- Fix (typescript, M): When the client's state becomes failed or closed while the supervisor is
  ready, open a new connection and attach again, with a small backoff. The same change repairs the
  failed first connect and the connect lost to a world rebuild that BRANCH_NOTES lists. Put the
  transport's reason in the box's Last error.

### A folder named like a log (eqlog_Name_server.txt) is in the Logs folder and is the newest entry

- Verdict: **wrong message**. When: at start. Recovers by itself: no. How likely and how bad:
  rare-and-mild.
- What happens: Main: the first choice of a launch is always the local list (the engine is not
  connected yet), and the local list does not check that an entry is a file, so the folder can be
  picked and saved. Engine: its own list skips non-files, but it is attached by path; File::open on
  a folder fails, one stderr line, status idle. Main: the wait ends with 'ended'; the report's probe
  cannot open it either and calls it unreadable. Nothing retries. The picker, served by the engine
  later, does not list the entry the app is attached to.
- What the player sees: "Reading log…" and at the first check the box: "Waiting on Windows will not
  let the app read the log file."
- Fix (typescript, S): Filter non-files in characterLogFiles and resolveActiveCharacter, as the
  engine's scan does.

### Two copies on different channels (installed build and dev or upstream build) with Summarize and archive log in use: both use the same folder <Logs>/companion-archive and the same journal

- Verdict: **not settled by the code**. When: after live / at start. Recovers by itself:
  not-settled-by-the-code. How likely and how bad: rare-and-mild.
- What happens: Copy A archives: the other copy's engine handles allow the move, its tail restarts
  at 0 on the new empty file and keeps its in-memory history, so copy B looks unchanged until it
  restarts. If copy B is LAUNCHED while A is between the move and the end of compression, B's launch
  check reads A's journal in the shared folder and runs the same finishing steps at the same time
  (compress, write the record, delete the moved file). What two concurrent finishes do to the
  archive is not settled by the code read here. Experiment: start an archive of a large log in one
  build and launch the other during the compress step; compare the .gz hash with the record.
- What the player sees: nothing, or in the second copy's console "log archive: an interrupted
  archive could not be finished: ..."
- Fix (typescript, S): Write the owning process id and channel into the journal and have the launch
  check leave a journal whose owner is still running.

