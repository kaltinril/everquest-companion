# Reading log: failure handling, phase doc (2026-11-19)

Fork issue #9 ("My app is stuck at Reading log... for the past couple of days") and the owner's asks
of 2026-11-19: "if the log was missing, locked, or too large, would our code handle those and other
crazy potential failure situations", "what if they never turned logs on ... or they installed it
somewhere custom", and the point of it all: "The main point is we don't want to have our users
confused what is wrong." Rules first: `docs/community/RULES.md`, then `agent/INDEX.md`. What was
asked: `requirements/fix-combat-reading-log.md` (rule 19). The situations this plan settles are in
`audits/2026-11-19-log-loading-failures.md`.

## How this plan was made

- A first step was built the same day (the box under "Reading log..." that names what the app is
  waiting on, and a wait that ends when the read has died).
- Four investigators then traced 88 failure situations on the path (the file, its content and size,
  the engine process, the report itself) and a skeptic rechecked every "handled" claim: 19 handled,
  76 not.
- Measured on the owner's own 94.3 MB log, replayed offline: the largest whole-log replies are 1.19
  MB (the event feed), 0.99 MB (loot), 0.79 MB (the fight list, 3,437 fights) and 0.59 MB
  (progression), and they grow with the log. The app's line decoder closed the connection for good
  when one message passed 8 MiB, and nothing reconnected. At the owner's rate that is a log of about
  630 MB to 1 GB; loot-heavy logs get there sooner. A hard threshold that then fails at every
  launch: the best fit for the report.
- An architect turned the 76 into this design; a second model attacked it (22 problems, most
  confirmed in the code and folded in); this is the final version.

## The design

Seven phases, same outline as the first design, corrected where the attack was
right (20 of its 22 problems were confirmed in the code; 2 points are kept with the reason in that
phase's risks). The player ends up with ONE status, decided in one function
(src/shared/logReadReport.ts composeLogReadReport) and pushed by main to every window: a band under
the title bar on every tab, the same sentence in the Overview and Combat panels, one line in the
module tabs, a short label on the overlays. Each state carries a Try line and, where the app can
act, a Try again button. The failure card, the catch-up bar and the band are chosen by one pure
function, so they cannot disagree. R1 removes the cliff: the line decoder stops being fatal and
quadratic; main reads one engine message up to 64 MiB, shows a window one up to 32 MiB, and an
over-limit reply fails only its own request, by name; a slow read is joined, not asked again; main's
connection is reopened with a cap; the archive refuses to move a log it could not summarize whole.
R2 builds the status, the single-flight file probe and the Try again verbs. R3 makes tabs, overlays,
the dot and the no-logs screen follow the status. R4 lets the read recover on a changed fact, with
caps that go-live does not reset. R5 stops the blind kill and the blind relaunch loop. R6 is the
quiet-log case, cut down to what the code can stand behind (no automatic re-attach, no
eqclient.ini). R7 is the Rust phase, cut down to the health stat, the changed-file check and four
one-liners. Limit reasoning (read, not measured): the 8 MiB guard only bounds a peer that never
sends a newline; V8 holds 2^29-24 characters in one string, so 512 MiB is the hard ceiling; the Rust
side checks no size on send. Not measured: parse time and memory at 16 to 64 MiB, the
structured-clone size per window, and merged archive history over IPC (experiments 1 and 17).

## Rules the design keeps

- A player is never left guessing: a screen that is stuck, empty or stale says why in plain words
  and, where the app can know it, what to try. A silent wait and a wrong reason are both defects.
- One source of truth for what is said.
- Recovery never loops blindly: anything that retries has a cap or needs a changed fact.
- No full path, Windows user name, chat line or token reaches the screen.
- Every piece of logic gets a unit test.

## Phases at a glance

| Phase | What | Where | Size | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| R1 | The cliff: no reply size, slow reply or socket fault ends the connection for good | typescript | L | - | built 2026-11-19 |
| R2 | One status, pushed to every window, with a Try line and a Try again action | typescript | L | R1 | planned |
| R3 | Tabs, overlays, the title-bar dot and the no-logs screen follow the status | typescript | L | R2 | planned |
| R4 | The read recovers by itself when a fact changes | typescript | L | R1, R2 | planned |
| R5 | The engine process: no blind kill, no blind relaunch loop, right words for why it will not start | typescript | M | R2, R4 | planned |
| R6 | The log is there but nothing is being written, or the game runs from another folder | typescript | M | R2, R3, R4 | planned |
| R7 | The engine phase (Rust), built in its own worktree and target directory | both | M | R1, R4 | planned |

## As built

One block per finished phase: what differs from the phase text below in a way a later phase must
know. The rules each phase left in force are in `agent/BRANCH_NOTES.md` ("Reading log" sections).

### R1 (2026-11-19)

- Built as designed, reviewed by two readers with different lenses (five findings, all confirmed and
  corrected, each with a test that failed first), gated with the trunk merged in: 6,876 unit tests,
  the two known reds only. No Rust change. No run against a real reply over 8 MiB: the sizes in the
  tests are synthetic messages through the real decoder and transport.
- New leaves the plan did not name: `src/main/dataServer/engineLink.ts` (connect, adopt and lost, so
  the connection guard and the clean hang-up have tests; `engineClientHost.ts` imports Electron),
  `engineClientWiring.ts` (the listeners, once per client), `replySizes.ts`,
  `src/shared/dataServer/clientStreams.ts` and `listeners.ts`,
  `src/main/logArchive/captureReads.ts`.
- A "try" is a retry: the first connect of a launch is not one, so the worst case is 6 connects
  before the keeper gives up and the box says "gave up after 5 tries".
- `EngineClient.fail(error)` exists (added in the corrections): a clean hang-up fails the client, so
  `connection` reads `failed` and the box can say it is connecting.
- `LogReadFacts` has the required fields `link` (`LogReadLink`: tries, of, nextAt, gaveUp,
  lastReason, everConnected) and `tooLarge`, and `lastCombatRead.why` (the read shim's reason word).
  `LogReadWait` has `connecting` and `replyTooLarge`; `LOG_READ_WORDS` is a Record over it, so a
  table keyed the same way does not compile until both are covered.
- `reconnectEngineClient()` is exported from `engineClientHost.ts` (the keeper's `tryNow`) and is
  wired to nothing yet (R2). The keeper pushes nothing: R2's status push reads
  `engineClientFacts().link` on its own edges.
- `replyTooLarge` is decided from the meter's own read (`lastCombatRead.why === 'tooLarge'`), not
  from the op of the newest too-large reply: the archive asks `combat.snapshot` too.
- A blocked (too large) key stays blocked until the next turn. After an archive in the same run the
  engine still holds the old lines, so the reply stays too large until a restart; R2's Try line for
  `replyTooLarge` says to restart.
- A too-large MODULE reply is recorded and printed on the Last error row but changes no wait and no
  tab text (R3).
- Left for a later phase: `lastCombatRead` is not cleared by a new turn; a connection whose hello is
  never answered is not reported lost; the read shim's second readiness check compares servable or
  not, not the turn; `secondEngine.ts` still skips a failed module read during a refold (no history
  is lost: `refreshSegment` refuses, but not with the too-large sentence).
- Line budgets: `engineClientHost.ts` 390 of 440 code lines, `client.ts` 385,
  `tests/dataServerTransport.test.mts` 368. Source pins that break if the wiring moves:
  `tests/serveDeltaArm.test.mts` reads `engineClientWiring.ts` and `engineClientHost.ts`.

## Defaults taken on the questions that are the owner's

Each is the architect's recommendation, taken so the work could go on. Any of them can be changed:
say which.

- How large may one message from the engine be before the app refuses it? A refusal now fails one
  panel, by name, not the connection. Two limits: what main may read (the archive uses this) and
  what a window is shown. Options: Read up to 64 MiB, show up to 32 MiB: by reasoning safe for
  memory; at your density a window works to about 2.6 GB of log and the archive to about 5 GB; at an
  alt's loot density about 0.5 to 0.9 GB and 1.2 to 2 GB | Read and show up to 32 MiB: the most
  cautious; the archive then stops working at the same size the tabs do | Read and show up to 64
  MiB: twice the reach for the tabs, with the copy sent to each window unmeasured. Default taken:
  Read 64 MiB, show 32 MiB, revisited after experiment 1 measures real replies
- On 2026-11-19 the default was that nothing retries a failed read by itself. May the app now
  re-attach by itself in three capped cases: when the file becomes openable again (was missing or
  locked), once 2 s later when a read ended with the file openable, and once (not twice inside 30
  minutes) when the reader stops after it was live? Options: All three, with the caps in R4 (5
  file-back re-attaches per log per launch, 1 plain retry, 1 after-live re-read per 30 minutes) |
  Only when the file becomes openable again; never a plain retry | None: keep the default and rely
  on the Try again button. Default taken: All three, with the caps: a brief antivirus or backup lock
  is the likely case and today it costs the whole session
- When the engine has been restarted 3 times while reading the same log (it died, or the app's own
  watchdog ended it), should the app stop pointing new engines at that log and wait for Try again?
  Options: Stop after 3 and say so, with Try again | Keep relaunching and re-reading for ever, but
  say how many times it has happened | Stop after 3 before live, but keep re-reading after restarts
  that happen once live. Default taken: Stop after 3 and say so: a loop that re-reads a multi-GB log
  for ever helps nobody and hides the cause
- Should the app ever say 'no new log lines' on evidence that is not proof (the read is live, the
  game has been in front 10 minutes, nothing was written, no other log is growing)? Options: Yes:
  one quiet, conditional line on the band, once per log per session, with a Dismiss button, never a
  card or a sound | No: only the proven cases (game runs from another folder, file missing or held)
  | Yes, but only after 30 minutes. Default taken: Yes, the one quiet line: it is the only cover for
  'they never turned logs on again' until experiment 7 says whether the game records the setting
- The health answer's log time: may the engine report the stamp its reader last took (under a second
  old) instead of statting the file on every answer? Rulings 18 and 21 say 'fresh on every answer,
  never remembered'. Options: Yes: the reader's last look, under a second old; health never touches
  the disk | No: keep the stat on the health path but give it a 250 ms limit and report it absent
  when it does not answer | No change. Default taken: Yes: the reader's last look. A stat that hangs
  on a dead share is what gets a healthy engine killed
- The watchdog: may it leave an engine alone when two probes fail but the engine was heard on the
  app's own connection in the last 20 s? Options: Yes: with no cap while the log is still being read
  (each pass needs new evidence), and at most 6 times in a row (about 3 minutes) once live | Yes,
  with no cap at all | Yes, but at most 6 times in a row always, then end it as today | No change.
  Default taken: No cap during the read, 6 in a row once live: ending an engine that is answering
  costs the whole read, but once live an engine that cannot take a new connection is broken for the
  windows that connect to it directly

## R1: The cliff: no reply size, slow reply or socket fault ends the connection for good

- Where: typescript. Size L. Depends on: nothing.
- After this phase: A reply larger than the old 8 MiB limit loads. A reply too large to read or to
  show fails only its own request, the box names it, and it is not asked again until the log is
  re-read. A slow reply is waited for by everyone who asks, on one request. If main's connection
  fails or was never made, the app says it is connecting and reopens it by itself, up to a cap,
  without re-reading the log. The archive never moves a log aside with a module missing.

### Steps

1. src/shared/dataServer/ndjson.ts, class LineDecoder. Before: one string `buffer`, `buffer +=
   chunk`, then `indexOf(DELIMITER)` from offset 0 on every push (each chunk re-flattens and
   re-scans the whole partial line), and `push` throws frameTooLarge when the remainder passes
   maxLineChars. After: a chunk list `parts` plus a count `held`; only the new chunk is searched; a
   line is joined once, at its delimiter. Constructor gains an optional second argument `watch: {
   noticeChars: number; onLine(seen: { head: string; chars: number; refused: boolean }): void }`.
   With `watch`, a line that passes the limit (whether or not its delimiter is in the same chunk) is
   not thrown: the decoder keeps its first 256 characters as `head`, counts and drops the rest up to
   the next delimiter, calls onLine with refused true and carries on. A delivered line of
   noticeChars or more calls onLine with refused false before it is returned. Without `watch`
   (src/main/dataServer/supervisorChild.ts readLines) behaviour is exactly today's, throw included.
   `pending` joins `parts`; new getter `midFrame` is true while a skip is open, and the transport's
   close handler treats `midFrame` like a non-empty `pending` (truncated frame).
2. Same file. `MAX_LINE_CHARS` stays 8 MiB and stays the decoder's default. New `MAX_MESSAGE_CHARS =
   64 * 1024 * 1024` and `LARGE_MESSAGE_CHARS = 16 * 1024 * 1024`, with the reasons in the comment
   (the guard is about a missing delimiter; V8 string ceiling; one eighth of it; measured growth
   12.6 KB of largest reply per MB of log). `createNdjsonTransport` builds `new
   LineDecoder(MAX_MESSAGE_CHARS, watch)`, so all four engine-reading call sites get it
   (engineClientHost.ts, engineHealth.ts, logArchive/secondEngine.ts, renderer
   lib/engineProvider.tsx). New pure `messageIdOf(head)`: the top-level `id` only when it appears
   before any nested object or array in the head (the generated Rust structs serialize a reply as
   `{"id":N,"kind":"reply",...` and a reset as `{"epoch":E,"id":N,...`, read in
   engine/crates/protocol/src/generated.rs); otherwise null.
3. src/shared/dataServer/transport.ts: `Transport` gains optional `onOversize?(handler: (m: { id:
   number | null; size: number; refused: boolean }) => void)`, documented in message terms.
   ndjson.ts implements it; memoryTransport.ts does not.
4. src/shared/dataServer/client.ts (398 of 440 code lines) and new
   src/shared/dataServer/listeners.ts with `callEach(listeners, value, debug, what)`: every listener
   runs in its own try/catch with a debug note. Used by `setConnectionState`, `emit` (sub.listener),
   the progress fan-out in `onEpochMessage`, and broadcasts.ts `deliver`. There is NO try/catch
   around `receive()`: a throw in protocol code still fails the connection through ndjson's own
   catch, and the link keeper reconnects it. Before: a state listener that threw inside
   `onHelloReply` left the client 'ready' with its outbox unsent, and one that threw inside
   `failConnection` skipped `rejectAllPending`.
5. client.ts: `PendingRequest` gains `params`. In `attach()`, register `transport.onOversize?.(...)`
   calling new `onSized(s, m)`: refused and `s.pending` holds the id: `takePending` and reject with
   `new EngineError('internal', 'the reply to <op> was too large to read', id, new
   TransportError('frameTooLarge', ...))`; refused and `s.subs` holds the id: `emit(sub, {
   ...sub.view, loading: false, error })`; in every case fan `{ op, params, size, refused }` to new
   `EngineClient.onOversize(listener)` (through callEach). `failConnection` stores its error; new
   read-only `EngineClient.failure`, cleared by `attach`. If lint says over 440, move `onReset`,
   `onDiff` and `subscriptionFor` to a sibling src/shared/dataServer/clientStreams.ts.
6. src/shared/dataServer/ops.ts: two pure predicates. `isTooLarge(err)`: an EngineError whose cause
   is a TransportError with code frameTooLarge. `isLinkLost(err)`: an EngineError with code
   'unavailable' and no requestId (the shape `failConnection` and `attach` reject with; an engine
   error reply always carries its id).
7. New src/main/dataServer/linkKeeper.ts, a leaf with its dependencies handed in like foldWait.ts
   (connect, adopt, timer, now, note). Policy: delays 0.5, 1, 2, 5, 15 s; at most 5 tries in a row;
   a connection that stays ready 60 s clears the count; at most 20 reconnects per engine launch;
   `lost(error)` with a retry already pending schedules nothing; a loss whose error code is
   protocolMismatch or unauthorized is not retried at all (gave up at once, reason kept); `tryNow()`
   (a person asked) clears the count; `stop()` cancels. `facts(): { tries, of, nextAt, gaveUp,
   lastReason, everConnected }`.
8. New src/main/dataServer/engineClientWiring.ts: the five listener registrations now inside
   `openConnection` (onFire, onProgress, onConCard, onModuleChanged, onKnowledgeMiss) move here
   unchanged, registered once per client instead of once per connect, plus `client.onOversize`
   calling `noteReplySize` and `replySizes.note`. This is the room engineClientHost.ts needs (404 of
   440 code lines).
9. src/main/dataServer/engineClientHost.ts. `onEngineReady(info)`: create the client, wire it once,
   create the keeper, start it. `openConnection` becomes the keeper's two callbacks. connect:
   `connectToEngine(info.port, CONNECT_TIMEOUT_MS)`; a failure is recorded with
   `noteLogReadError('connect', ...)` and retried by the keeper (before: recorded, never retried).
   adopt(channel): `if (live !== l) { channel.close(); return }` replaces the turn guard `gen !==
   mine` (before: a world rebuild during the connect closed a good channel and left the client
   'connecting' for the life of the launch); then
   `client.attach(createNdjsonTransport(watchClose(channel, onPeerClose)))`; then, on a fresh turn
   from `bumpGen()`, `pushLogDirNow` and `attachAndProbe`. `l.attachedTo` is kept across a
   reconnect, so no second attach is sent when the engine is still on the log and serving resumes
   without a re-read. `client.onState`: on 'failed' for the live client, if it was serving do
   `bumpGen()` and `pushWorldChanged()` (before: windows kept stale snapshots with no frame), then
   `keeper.lost(client.failure)`. `sendAttach` catch: `if (isLinkLost(err)) return null` before
   `noteLogReadError('attach', ...)` (before: an attach in flight when the link dropped recorded
   'attach' and the box said the engine refused the log, at once). New exports
   `reconnectEngineClient()` (`keeper.tryNow()`) and `link` on `engineClientFacts()`. The READY-null
   edge and `stopEngineClient` stop the keeper.
10. src/main/dataServer/engineHealth.ts: export the existing `watchClose`, so engineClientHost sees
    a clean hang-up that `createNdjsonTransport` deliberately does not report.
11. New src/main/dataServer/replySizes.ts (pure factory `createReplySizes()` plus the app's one
    instance). `note(key, chars, refused, at)`, key being `<op> <stableKey(params)>`. Constant
    `MAX_FORWARD_CHARS = 32 * 1024 * 1024`: the largest engine reply main will hand to a window (the
    transport limit is what main itself may read; the two are separate because a forwarded reply is
    cloned into every window that holds it). `blocked(key)`: true for the rest of the turn once a
    reply for that key was refused or was over MAX_FORWARD_CHARS (the answer can only grow, so
    asking again is a blind retry). `delayFor(key, now)`: 5,000 ms minus the time since the last
    send for a key whose last reply was LARGE_MESSAGE_CHARS or more, else 0. `sent(key, at)`.
    `reset()` called from `bumpGen`.
12. src/main/dataServer/readShim.ts. (a) A second in-flight map `wires` keyed the same way holds the
    real client request until it settles (reply, error or the client's own 15 s deadline); `ask`
    races its OWN wait against `wires.share(key, start)`. Before: the shared promise was `ask`,
    which settled at the 2 s deadline, so the next poll sent a second identical request while the
    first was still running (up to 7 at once at 15 s). (b) `start` first waits
    `deps.sizeGate?.delayFor(key)` then sends. (c) New optional dep `timeoutFor?(op)`; the caller's
    wait is `timeoutFor(op) ?? timeoutMs`. (d) New FallbackReason 'tooLarge' ('the reply was too
    large to show'): returned without a wire request when `deps.sizeGate?.blocked(key)`, returned
    after a reply when the gate now says blocked, and returned from the catch when
    `isTooLarge(err)`. (e) `observe` is handed the reason as well as the phrase.
13. src/main/dataServer/serveShim.ts: pass `sizeGate: replySizes` and `timeoutFor: (op) => (op ===
    'module.snapshot' ? 10_000 : undefined)`. A module read is asked once per cursor and its null
    answer is not asked again, so it waits up to 10 s (under the client's 15 s); `combat.snapshot`
    is polled and joined, so it keeps 2 s per caller.
14. src/main/dataServer/logReadState.ts: new `noteReplySize({ op, module, chars, refused, shown },
    at)` keeping the newest reply that could not be shown (`tooLarge`) and the newest large one
    (`large`) per turn; both cleared in `noteLogReadTurn`; returned from `logReadFacts()`.
15. src/shared/logReadReport.ts: `LogReadFacts` gains `link` and `tooLarge`; `LogReadWait` gains
    'connecting' and 'replyTooLarge'. `engineWait`: supervisor ready and connection not ready is
    'connecting' while the keeper has not given up, 'notConnected' once it has. `readWait`: with
    readiness ok, a `tooLarge` whose op is combat.snapshot is 'replyTooLarge', checked before the
    unserved-read test. `SHOW_AT_ONCE` gains 'replyTooLarge' and 'notConnected'. `CONNECTION_WORDS`
    and `lastErrorText` print the try count, the link's reason and the refused size, all through
    `scrubPaths`.
16. src/main/logArchive/actions.ts `captureDeps`: `snapshot` returns null only for an EngineError
    with code 'notFound' (the engine's own answer for a module it does not carry, engined ops.rs);
    an echo mismatch and every other rejection are rethrown. `fights` the same. `learnEngineModules`
    catches per module and counts a failed read as served. src/main/logArchive/capture.ts:
    `snapshotAll` wraps a rejection as `CaptureReadError(moduleId, cause)`; `captureSegment` catches
    around `takeAll` and returns `{ ok: false, reason }`. Before: any failed read became null, the
    module was left out, `captureSegment` returned ok and the log was moved aside without it (today
    the 8 MiB fault kills main's client so `health()` rejects and the capture aborts; after this
    phase `health()` succeeds, so the guard is required here).
17. Words: the ndjson.ts header, the 8 MiB paragraph in src/main/dataServer/README.md, the
    readShim.ts header section 'ONE REQUEST PER QUESTION IN FLIGHT', the 'Reading log' section of
    docs/community/agent/BRANCH_NOTES.md (the 'never retried' and 'gen guard' follow-ups are done)
    and docs/community/requirements/fix-combat-reading-log.md.

### What the player reads

- Connecting to the data engine.
- The fight list is too large for the app to show.
- Engine row, new words: connecting (try 2 of 5)
- Last error row: connect: <reason> (try 2 of 5)
- Last error row: connect: <reason> (gave up after 5 tries)
- Last error row: read: the reply was 71.2 MB, over the 64.0 MB limit
- Last error row: read: the reply was 40.1 MB, over the 32.0 MB the app can show
- Archive card reply: Not archived: this log is too large to summarize in one piece. Nothing has
  changed.
- Archive card reply: Not archived: the data engine did not answer for <module>; try again in a
  minute. Nothing has changed.
- Backup card reply: Not backed up: this log is too large to summarize in one piece.

### Tests

- tests/dataServerTransport.test.mts: a 9 MiB line fed in 64 KiB chunks through
  createNdjsonTransport is delivered as one message. Proves the old limit no longer applies to
  engine messages.
- tests/dataServerTransport.test.mts: a 32 MiB line fed in 4 KiB chunks completes inside 2 s. Proves
  assembly no longer re-scans the partial line per chunk.
- tests/dataServerTransport.test.mts: with `watch` and a small limit, an over-limit line is skipped,
  onLine reports head, size and refused true, the next line is delivered and the transport is not
  closed; the same when the over-limit line and its delimiter arrive in one chunk. Proves size alone
  cannot end a connection.
- tests/dataServerTransport.test.mts: without `watch` the decoder still throws frameTooLarge
  (existing case kept). Proves the child's stdout and stderr keep their guard.
- tests/dataServerTransport.test.mts: a stream that ends inside a skipped line fails as a truncated
  frame; a line of noticeChars or more is reported with refused false and still delivered.
- tests/dataServerTransport.test.mts: messageIdOf on a reply head, a reset head, an error head
  (object before id) and a broadcast head. Proves an id is taken only from the top level.
- tests/dataServerClient.test.mts: a refused reply rejects only its own request with a frameTooLarge
  cause, the state stays 'ready', and a later request is answered.
- tests/dataServerClient.test.mts: a refused reset puts the error on that one subscription;
  onOversize reports op and params; `failure` holds the reason after a transport error and is
  cleared by attach.
- tests/dataServerClient.test.mts: a state listener that throws on 'ready' does not stop queued
  requests being sent or subscriptions being reopened; one that throws on 'failed' does not stop
  pending requests being rejected; a progress listener and a subscription listener that throw do not
  fail the connection. Proves a listener cannot strand the client.
- tests/dataServerOps.test.mts: isTooLarge for the transport cause and false for an ordinary
  internal error; isLinkLost for failConnection's rejection and for 'the connection was replaced',
  false for an engine error reply with code unavailable and for a timeout.
- tests/dataServerLinkKeeper.test.mts (new): a failed first connect is retried on the ladder; five
  failures give up; `tryNow` starts again; 60 s of ready clears the count; the per-launch total of
  20 holds; `lost` during a pending retry schedules nothing; protocolMismatch and unauthorized are
  never retried; `stop` cancels; `everConnected` is false until the first adopt.
- tests/dataServerReplySizes.test.mts (new): blocked after a refused reply and after one over
  MAX_FORWARD_CHARS, not after a 20 MiB one; delayFor is 0 under 16 MiB and the rest of 5 s at or
  over it; reset clears both.
- tests/dataServerShim.test.mts: a request that takes 6 s with a 2 s caller wait and three polls 2 s
  apart puts exactly one request on the wire and the third poll is served. Proves a timed-out read
  is joined, not re-sent.
- tests/dataServerShim.test.mts: module.snapshot waits 10 s by timeoutFor while combat.snapshot
  waits 2 s; a blocked key answers 'tooLarge' with no request sent; a frameTooLarge rejection is
  'tooLarge', another rejection stays 'refused'; a large key's next request is held for the floor
  and joiners share it.
- tests/logReadState.test.mts: noteReplySize keeps the newest unshowable and the newest large reply
  and both are cleared by a new turn.
- tests/logReadReport.test.mts: connection not ready with the keeper still trying is 'connecting'
  and does not show at once; gave up is 'notConnected' and shows at once; a tooLarge combat.snapshot
  with readiness ok is 'replyTooLarge' even when the last combat read was also unserved; the Last
  error text carries the try count and the sizes and is scrubbed.
- tests/logArchive.test.mts: with one module's read rejecting with a frameTooLarge cause,
  captureSegment returns ok false with the too-large reason and readPrefix is never called; a
  'notFound' rejection still leaves that module out and returns ok true; a rejected fights read
  returns ok false. Proves nothing is moved with a module missing.
- tests/copyNoEmDash.test.mts already covers the new strings; no change needed beyond the suite
  passing.

### Risks and limits

- 64 MiB (read) and 32 MiB (show) are reasoned, not measured: parse time and memory in main, the
  structured-clone size and the renderer heap are unknown until experiment 1. Both are one-line
  constants. The attack proposed shipping the read limit at 32 MiB; it is kept at 64 because
  main-only readers (the archive capture) then still work in the 32 to 64 MiB range where a window
  is refused, which is what lets the archive be the cure.
- The show limit counts the engine's reply only. A module merged with archived history in
  serveShim.ts projectModule can be larger than the reply and still crosses IPC unbounded, as it
  does today for archive users (deferred, experiment 17).
- Until R3, a module reply too large to show leaves its tab on the old empty text (for example 'No
  loot parsed yet'); only Overview and Combat name it.
- A blocked key stays blocked until the turn changes. After an archive in the same run the engine
  still holds the old lines (eligible.ts rule 4), so the reply stays too large until the app is
  restarted; the Try line in R2 says so.
- The reconnect takes a new turn, so every window re-asks its modules once per reconnect.
- messageIdOf depends on the engine writing `id` before the payload; if that ever changed, the
  request would end on its 15 s deadline instead (not fatal). R7 pins the order with a Rust test.
- A module read now holds its renderer invoke up to 10 s on a wedged engine instead of 2 s; the view
  draws its loading state either way.
- The decoder rewrite touches the one file every connection reads through; the existing
  adversarial-chunking tests in tests/dataServerTransport.test.mts must pass unchanged.

### Situations it settles

3. (added) The log's loot history outgrows the 8 MiB limit; One reply from the engine is larger than
8 MiB; 8a. Main's connection to the engine fails while the engine is fine; 4c. The supervisor's
probe passes but main's ONE client connect then fails; 8b. The gen guard in openConnection throws
away a good connection; Report wait = notConnected.; After live: main's own connection to the engine
drops

## R2: One status, pushed to every window, with a Try line and a Try again action

- Where: typescript. Size L. Depends on: R1.
- After this phase: On every tab the player sees one band that says what the app is waiting on, what
  to try, and a Try again button when the app can act. The failure card, the catch-up bar and the
  band are picked by one function and cannot disagree; the card still shows with no character
  selected. A read that stopped keeps showing where it stopped. A log on a drive that hangs is named
  as that, and cannot stall the rest of the app. The box appears as soon as there is something to
  say.

### Steps

1. New src/shared/logReadWords.ts (logReadReport.ts is at 221 code lines and would pass 440 with the
   tables): `LOG_READ_WORDS` moves here; new `LOG_READ_TRY: Record<LogReadWait, string | null>` and
   `LOG_READ_ACTION: Record<LogReadWait, 'relaunch' | 'reconnect' | 'reattach' | null>`, both
   exhaustive by type. Actions: engineMissing and engineFailing relaunch; notConnected and
   notAnswering reconnect; attachRefused, logMissing, logUnreadable, logHung, readerStopped,
   stalled, opening and mismatch reattach; every other wait null (replyTooLarge is null on purpose:
   no button can make the reply smaller).
2. src/shared/logReadReport.ts, the decision. `engineWait` order becomes engineMissing,
   engineFailing, noCharacter, engineStarting, connecting or notConnected (before: noCharacter
   first, which hid a missing engine behind 'No character log is selected'). New waits 'opening',
   'finishing', 'logHung', 'mismatch'. `readWait` order: attach error with code timeout is
   'notAnswering', any other attach error 'attachRefused'; fold error or idle is the ended waits;
   health error 'notAnswering'; a probe that has been pending 15 s or more is 'logHung'; status
   folding with no offset growth for 60 s is 'finishing' when the offset is within 64 KiB of the
   stated log size and the stillness is under 5 minutes, otherwise 'stalled'; status starting or
   attaching for 60 s is 'opening'; readiness notAttached with health live is 'mismatch'; then
   reading, then the combat-read branch (R1's replyTooLarge first; R3 owns the rest of that branch).
   `SHOW_AT_ONCE` gains 'logHung' and 'mismatch'; 'opening' and 'finishing' are not in it.
3. Same file, the report. `LogReadReport` gains `tryLine`, `action`, `notes: readonly LogReadNote[]`
   (`{ id, text, tryLine?, button? }`, empty until R3) and `waitingSince` (epoch ms; the renderer
   derives the Waiting row with its own clock; `waitedMs` goes). `LogReadFacts` gains `lastOffset`;
   `measured()` with no fold measurement uses `lastOffset` over `logSize`, and `logReadLines` labels
   that row 'Stopped at' when the wait is an ended wait and 'Read so far' otherwise. `logReadLines`
   adds a 'Try' row. Engine stderr lines are scrubbed first and cut to 200 characters second.
4. Same file, `scrubPaths`: the generic Users rule skips Public, Default and All Users
   (`(?!(?:Public|Default|All Users)(?:[///]|$))` after the Users separator). Before:
   C:/Users/Public/Daybreak Game Company/... printed as ~/Daybreak Game Company/..., which reads as
   the player's own home.
5. src/main/dataServer/logReadState.ts. New `onLogReadChange(cb)` and `noteLogReadTouched()`; every
   note function ends by calling the callback. `waitingSince` is no longer reset by a new launch or
   a rebuild of the same log; it resets when the attached path changes or the read goes live.
   `lastOffset` is returned from `logReadFacts()`. For a 'fold' error the engine's newest stderr
   lines are read when the report is composed, not when the error is recorded (the reason line
   travels on another pipe and can arrive after the idle answer). The stderr ring is cleared on a
   new launch after its lines are copied into any standing error.
6. src/main/dataServer/engineProtocol.ts `boundedDetail(value, max = ENGINE_DETAIL_MAX)` gains the
   second parameter. src/main/dataServer/supervisor.ts, the stderr reader: `onEngineSaid` is handed
   `boundedDetail(safe, 2048)` (control-free, cut at 2 KB) while `l.lastStderr` keeps the
   200-character cut. Before: the 200 cut came before the scrub, so a cut path no longer matched; an
   uncut line could be 8 MiB. src/main/dataServer/engineHost.ts `onFault`: the fault's detail goes
   through `scrubPaths` before `noteEngineFault` (before: the card's 'It last said' line was
   unscrubbed and a spawn failure's detail starts with the full program path).
7. src/main/dataServer/engineLaunchState.ts: new `noteEngineReadEnded()` setting phase 'starting'
   with no fold, called from `failed('ended')` in engineClientHost.ts and from
   `onWorldRebuilt(null)`; `set()` calls `noteLogReadTouched()`. Before: nothing moved the phase off
   'folding', so the bar stayed frozen over a box that said stopped, or ran to 100% over the no-logs
   screen. The offset is not lost: it is `lastOffset` in logReadState.
8. New src/main/logProbe.ts, a factory `createLogProbe({ open, now })` with no Electron import.
   `look(path)` starts an open only when none is in flight for that path and the kept answer is
   older than 5 s; `last(path)` returns `{ bytes, problem: 'missing' | 'unreadable' | null,
   pendingMs }` synchronously, `pendingMs` being how long the one in-flight open has been out. A
   settled open stores its answer and calls `onSettled`. Before: every ask opened the file again
   with no limit, so a hung share held one libuv pool thread per ask (4 in all) and then stalled
   every async file call in main.
9. src/main/logReadReport.ts: `buildLogReadReport()` becomes synchronous. It reads
   `logProbe.last(path)` and calls `logProbe.look(path)` only when the read has ended, or the status
   has been starting or attaching for 15 s. Before: awaited an open on every ask, and opened the log
   every 3 s whenever no size was known, a live launch after a rebuild included.
10. New src/main/logReadStatus.ts, the publisher. `poke()` (from `onLogReadChange`, the client's
    state listener, the link keeper, the supervisor's status edges in engineHost.ts and
    `logProbe.onSettled`) rebuilds the report and sends it with
    `sendToEveryWindow(IPC.onLogReadReport, report)` when `statusChanged(prev, next)`: wait, show,
    try line, action, notes, engine words or last error differ. Numbers alone (offset, percent,
    events) are pushed at most every 2 s and only while `report.show`. An unref'd 1 s timer runs
    only while `shouldTick(report)`: a wait whose verdict moves with the clock (engineStarting,
    connecting, reading, opening, finishing, stalled, logHung, and any wait whose `show` is still
    false). A separate unref'd 10 s timer always recomputes (a few field reads, no file call) as the
    net under a missed poke.
11. New src/main/logReadActions.ts `tryLogReadAgain()`: reads the last published wait and runs
    `LOG_READ_ACTION[wait]`: relaunch is `retryEngineSupervisor()`; reconnect is
    `reconnectEngineClient()` (R1); reattach is new `reattachEngineLog()` in engineClientHost.ts
    (new turn with `bumpGen()`, `l.attachedTo = null`, `attachAndProbe`; when the client is not
    ready it reconnects instead). A second press inside 2 s is ignored. src/main/ipc/engine.ts
    registers `IPC.logReadTryAgain`; src/shared/ipc.ts gains `onLogReadReport` and
    `logReadTryAgain`; src/preload/engine.ts (the engine bridge, not index.ts) and
    src/preload/overlay.ts with overlay.d.ts gain `onLogReadReport`, `logReadReport` and, main
    window only, `logReadTryAgain`.
12. src/renderer/src/lib/logReadReportHud.ts becomes one shared store (subscribe to the push first,
    then one mount-time `logReadReport()` read, the order lib/engineLaunchHud.ts uses), read with
    useSyncExternalStore. FIRST_ASK_MS and the 3 s polling go.
13. src/shared/engineLaunch.ts: new pure `bannerFor(report, say, hasReadout): 'card' | 'bar' |
    'band' | 'notes' | 'none'`. 'card' whenever `say.fault !== null` (whatever the log wait, so a
    fresh install with a quarantined engine and no character still gets it); 'bar' when the wait is
    reading or finishing and a readout exists; 'band' when `report.show`; 'notes' when the wait is
    ok and notes exist; else 'none'. New src/renderer/src/components/LogReadBand.tsx (sentence, Try
    line, Try again button disabled for the round trip, data-testid log-read-band);
    src/renderer/src/components/EngineLaunchBanner.tsx renders by `bannerFor`. Before: card from
    `say.fault`, bar from `say.phase === 'folding'`, box from a third source.
14. src/renderer/src/components/LogReadReport.tsx (the box in CombatView HydratingPanel and
    OverviewHydrating): reads the shared store, shows the Try row and the same button, keeps
    data-testid log-read-report and the rule that a panel mounted 15 s shows the box even for ok and
    noCharacter.
15. Words: BRANCH_NOTES 'Reading log' section (decision order, push instead of poll, the probe rule,
    e2e note 'at once with a failure') and requirements/fix-combat-reading-log.md.

### What the player reads

- Button: Try again
- Row label: Try
- Row label: Stopped at
- The data engine is taking a long time to open your log.
- Finishing the read.
- The drive holding your log is not answering.
- The app and its data engine disagree about which log is open.
- Try (noCharacter): Pick your character in the title bar.
- Try (engineMissing): Check your antivirus quarantine, then reinstall.
- Try (engineFailing): Press Try again. If it keeps failing, reinstall.
- Try (engineStarting): Nothing to do. This takes a few seconds.
- Try (connecting): Nothing to do. The app keeps trying.
- Try (notConnected): Press Try again. A security program may be blocking local connections.
- Try (attachRefused, notAnswering, mismatch): Press Try again.
- Try (logMissing): In game, type /log on.
- Try (logUnreadable): Close any program that has the log open.
- Try (logHung): Check that the drive or folder holding the log can be reached.
- Try (readerStopped): Press Try again. If it stops at the same place, send a screenshot of this
  box.
- Try (stalled): Wait a minute. If Read so far does not move, press Try again.
- Try (opening): Wait a minute. If it stays, press Try again.
- Try (finishing): Nothing to do. This can take a minute on a large log.
- Try (reading): Nothing to do. Large logs take a while.
- Try (replyTooLarge): Turn on Summarize and archive log in Preferences, then restart the app.
- Changed: a session.attach that got no answer now reads "The data engine is not answering." instead
  of "The data engine refused the log file."

### Tests

- tests/logReadReport.test.mts: LOG_READ_TRY and LOG_READ_ACTION cover every wait; every sentence
  and Try line is non-empty where set, has no em or en dash and is under 90 characters;
  LOG_READ_ACTION.replyTooLarge is null. Proves no state ships without words and the too-large state
  has no retry.
- tests/logReadReport.test.mts: a no-binary fault with no character is 'engineMissing', not
  'noCharacter'; no character with the engine merely starting is 'noCharacter'.
- tests/logReadReport.test.mts: status attaching for 60 s is 'opening' and is not shown at once;
  folding with the offset within 64 KiB of the size and still for 2 minutes is 'finishing'; the same
  held for 5 minutes is 'stalled'; folding far from the end and still for 60 s is 'stalled'; an
  attach timeout is 'notAnswering' while an attach badParams stays 'attachRefused'; notAttached with
  health live is 'mismatch'; a probe pending 15 s is 'logHung' and pending 3 s is not.
- tests/logReadReport.test.mts: an ended read with no fold measurement still reports the offset and
  the percentage, under the label 'Stopped at'.
- tests/logReadReport.test.mts: a 400-character stderr line with a user folder near the cut is
  scrubbed before it is cut; a fault detail with a full program path comes out with ~;
  C:/Users/Public/Daybreak Game Company/EverQuest is left as written while C:/Users/Jane/x becomes
  ~/x.
- tests/logReadState.test.mts: every exported note function calls the onLogReadChange callback once;
  waitingSince survives a new launch and a rebuild of the same log, resets on a path change and on
  live; a fold error picks up a stderr line that arrived after it was recorded; the ring is cleared
  on a new launch.
- tests/logProbe.test.mts (new): with an open that never resolves, any number of looks issues
  exactly one open and `last` reports a growing pendingMs; a settled answer is kept 5 s and then a
  new open is issued; ENOENT is 'missing', EACCES and EBUSY 'unreadable'; a second path has its own
  flight.
- tests/logReadStatus.test.mts (new, pure part): `statusChanged` ignores numbers alone and sees a
  wait, Try line, action, note or last-error change; `shouldTick` is false for ok, noCharacter and a
  shown terminal wait, true for reading, opening, finishing, stalled, connecting and any wait not
  yet shown.
- tests/logReadPokes.test.mts (new, reads source like copyNoEmDash): engineLaunchState.ts `set`
  calls noteLogReadTouched; engineClientHost.ts registers the client state listener that pokes.
  Proves the two pokes a unit cannot run are still wired.
- tests/logReadActions.test.mts (new): `tryLogReadAgain` with injected verbs calls relaunch,
  reconnect or reattach per wait, nothing for waits with no action, and ignores a second press
  inside 2 s.
- tests/engineLaunch.test.mts: `bannerFor`: no character plus a no-binary fault is 'card'; any fault
  is 'card'; 'bar' only for reading and finishing with a readout; a stopped read with a stale fold
  is 'band', never 'bar'; ok with notes is 'notes'; ok without is 'none'.
- tests/dataServerEngineProtocol.test.mts: boundedDetail with a max of 2048 cuts there and the
  default still cuts at 200.
- e2e, one thin step in the existing no-engine-binary run: the failure card is on a tab other than
  Overview, and the box inside overview-hydrating shows a Try row.

### Risks and limits

- 'mismatch' is kept although the attack asked to cut it: after R4 it should be unreachable, but if
  it is reached the alternative is 'Still reading your log.' beside 'caught up', the wrong-message
  pair the audit recorded. It costs one enum member, has its own action (reattach) and one test.
- The privacy row is closed only for the TypeScript gaps (cut before scrub, the card's detail, the
  Public folder). A Rust panic message can still quote log text; the panic hook is deferred.
- 'Try again' for a stalled or stopped read re-reads the log from byte 0 and may stop at the same
  place; the Try line says to send the screenshot then, and 'Stopped at' is on it.
- 7b stays incurable from here: the player is told, with the byte offset, and the cure is in the
  engine (deferred).
- 'logHung' needs the probe to be pending 15 s; a disk spinning up for 5 to 10 s does not trip it.
  How long Windows blocks an open on a dropped share is not known (experiment 10).
- The 10 s recompute timer runs for the life of the app; it does a handful of field reads and no
  file call, and pushes nothing unless the status changed.
- Overlay windows have their own preload (src/preload/overlay.ts); forgetting it there would leave
  overlays without the status. The source test in tests/logReadPokes.test.mts can also assert both
  preloads name the channel.

### Situations it settles

The launch card versus the new box; Report wait = readerStopped, and the bar that contradicts it;
What the player is told to do.; Privacy of the box: full path, Windows user name, token, character
chat.; The periodic ask itself (useLogReadReport); Report: the periodic ask itself
(useLogReadReport); A read that hangs before the scan starts; Report wait = stalled.; 12c. The
player points the app at an EverQuest folder with no logs in the middle of a read; 7b. The read
itself is stuck

## R3: Tabs, overlays, the title-bar dot and the no-logs screen follow the status

- Where: typescript. Size L. Depends on: R2.
- After this phase: No tab says "nothing yet, go play" while the log has not been read or a reply
  was not served: it prints the status line. Overlays show a short reason instead of a bare "Reading
  log…", also over numbers that have stopped updating. A slow panel is called slow, not a dead
  engine. The no-logs screen says which folder it looked in and why it found nothing, and never
  covers an attached character.

### Steps

1. src/shared/logReadWords.ts: new `LOG_READ_SHORT: Record<LogReadWait, string>` (22 characters at
   most, empty for ok). New pure `emptyOrWaiting(snapshotIsNull, report): { kind: 'empty' } | {
   kind: 'waiting'; text: string; tryLine: string | null }`: a null snapshot gives the status
   sentence (or, when the wait is ok, the note for that module, else the ok sentence); a served
   snapshot gives the tab's own empty text.
2. New src/renderer/src/components/LogReadInline.tsx: one line from the shared store through
   `emptyOrWaiting`. The tabs draw their empty text only when the raw snapshot is non-null, the rule
   SkillsView.tsx already follows. Sites: loot (features/loot/useLootHistory.ts returns the raw null
   beside the list; LootChrome.tsx 'No loot parsed yet'), leveling (LevelingView.tsx, the `??
   EMPTY_LEVELING` read and the 'No level-ups' text), timers (features/timers/useRespawn.ts and
   TimersView.tsx 'Nothing has died yet in this log.'), buffs (BuffsView.tsx 'No active buffs.'),
   gaps (GapsView.tsx bare spinner), bazaar (BazaarView.tsx).
3. Overlays. src/renderer/src/overlay/OverlayMeter.tsx and HealMeter.tsx print
   `LOG_READ_SHORT[wait]` (with the percentage for reading) where they print "Reading log…" today,
   and beside the segment name whenever the wait is not ok while numbers are held.
   src/renderer/src/overlay/useOverlayModule.ts: a null snapshot after a world-changed or character
   frame resets to the empty shape (before: the previous character's rows stayed up) and the header
   shows the short label. No separate 'Not updating' mark: the short label says the cause.
4. Title-bar dot. New hook src/renderer/src/lib/useLiveDot.ts used by App.tsx in place of the inline
   `onModuleChanged(() => setLive(true))`: the world-changed frame (MODULE_WORLD_CHANGED) no longer
   lights the dot, and the dot is off whenever the status wait is not ok.
5. src/main/dataServer/logReadState.ts: `noteCombatRead` keeps the newest outcome per request key
   (up to 8 keys, 10 s window) with its reason and duration, instead of one slot that an overlay's
   served read could overwrite. serveShim.ts `observe` passes the key and the reason.
6. src/shared/logReadReport.ts, the combat-read branch of `readWait`, owned here and nowhere else.
   With readiness ok, in this order: any key 'tooLarge' is 'replyTooLarge'; any key timed out, or
   refused with a timeout code, is new wait 'panelSlow'; any key refused otherwise is
   'notAnswering'; a guess or nothing is 'ok'.
7. Notes on the band while the wait is ok (`LogReadReport.notes`, composed in logReadReport.ts from
   logReadState facts): R1's `large` fact (a reply of 16 MiB or more) adds the getting-large note;
   R1's `tooLarge` fact for a module adds the too-large note and `emptyOrWaiting` prints the tab
   sentence for that module; in engineClientHost.ts `sawHealth`, at the go-live edge, `events` 0
   with an offset over 64 KiB records `noteNothingRecognised(bytes)`, which adds the
   recognised-no-lines note.
8. src/renderer/src/components/NoLogsEmptyState.tsx: reads the folder config main already builds
   (readable, readError, logsDir), prints the folder through `scrubPaths` and the same three
   verdicts features/preferences/EqFolderSetting.tsx prints. App.tsx: the gate uses new
   `showsNoLogs(characters, character)` in src/renderer/src/lib/noLogs.ts (true only with no
   character AND an empty list), and the list is re-read on window focus. Before: an empty list hid
   every view even while a character was attached and being read, and stayed wrong until restart.
9. src/main/log/config.ts `characterLogFiles` and `resolveActiveCharacter`: list with
   `readdirSync(dir, { withFileTypes: true })` and keep files only, as the engine's lister does
   (engined logs.rs). Before: a folder named like a log could be picked at launch and the read ended
   at once.
10. src/main/log/config.ts `discoverOnce` (with the pure half in the module
    tests/eqDiscoveryCache.test.mts covers): a failed re-check no longer replaces a root that was
    good earlier in this run with a remembered null. The last good root is kept, re-checked by the
    existing 5 s cycle (one readdir), and the full sweep (synchronous, 6 s ceiling) is run at most
    once per 60 s while it stays bad. Before: a drive that dropped out for a moment left the app on
    the default path, with the no-logs screen over a working session, until restart.
11. src/renderer/src/lib/engineProvider.tsx: the flat 4 s retry for ever becomes new pure
    `retryPlan(tries, statusChanged)` in src/shared/dataServer/retryPlan.ts: 4, 8, 16, 30 s for at
    most 5 tries, then no timer; the next try is started by a change of the pushed status's engine
    words. Before: an uncapped loop, the one retry in this path that R1's keeper did not cover.
12. Words: BRANCH_NOTES and requirements/fix-combat-reading-log.md.

### What the player reads

- Your log is read. This panel is taking too long to build.
- Try (panelSlow): Wait a moment. If it stays, turn on Summarize and archive log in Preferences.
- Tab line when its reply is too large: This tab's history is too large for the app to show.
- Note: Part of your log's history is too large for the app to show.
- Note Try: Turn on Summarize and archive log in Preferences, then restart the app.
- Note: Your log is getting large. Turn on Summarize and archive log in Preferences.
- Note: The app read 238.4 MB of eqlog_Name_server.txt and recognised no lines.
- Overlay labels: Reading log 43% / Starting engine / Engine missing / Engine not starting /
  Connecting / Not connected / Log refused / Log file missing / Log file locked / Drive not
  answering / Log read stopped / Log read stalled / Opening log / Finishing read / Engine not
  answering / Wrong log open / No character / Log too large / Slow to load
- No-logs screen, new line: Looked in <folder>.
- No-logs screen now also prints the three existing Preferences verdicts unchanged (folder does not
  exist; folder could not be read; no character logs in this folder)

### Tests

- tests/logReadReport.test.mts: LOG_READ_SHORT covers every wait, each at most 22 characters, no
  dash, empty only for ok.
- tests/logReadReport.test.mts, the combat branch: tooLarge beats a timed-out and a refused key and
  its action is null; a timed-out key with readiness ok is 'panelSlow'; a refusal with a timeout
  code is 'panelSlow'; another refusal is 'notAnswering'; a served read of another key does not hide
  a failed one; a guess is 'ok'. Proves one place decides and a too-large reply can never lead to a
  restart.
- tests/logReadState.test.mts: per-key combat reads, pruned to 8, older than 10 s ignored; the
  large, too-large and nothing-recognised notes are per turn.
- tests/moduleEmpty.test.mts (new): `emptyOrWaiting` gives the status sentence for a null snapshot,
  the module's too-large sentence when that module was refused, and 'empty' for a served empty
  snapshot.
- tests/noLogs.test.mts (new): `showsNoLogs` is false whenever a character is attached, true only
  with none and an empty list; the verdict picked for a missing folder, an unreadable folder and an
  empty folder.
- tests/logConfig.test.mts (new, over a temp directory): a directory named eqlog_A_server.txt is not
  listed and not chosen as the launch character.
- tests/eqDiscoveryCache.test.mts: a root that fails one re-check is kept and is found again on the
  next cycle; the sweep is not run twice inside 60 s; a sweep that finds a different root replaces
  the kept one.
- tests/dataServerRetryPlan.test.mts (new): 4, 8, 16, 30 s; no timer after 5 tries; a status change
  starts again.
- e2e, one thin step in the run that holds a fold: the Loot tab shows the status line, not "No loot
  parsed yet".

### Risks and limits

- Six views are touched; each change is two or three lines but each view has its own layout. Tabs
  not in the list (Mobs, Maps, Gear and others that mix wiki data with log data) rely on the band
  alone.
- The readPatience ladder of the first design is cut: R1's joined request plus the 10 s module wait
  replaces it. A combat panel that needs more than 15 s to build is still never served; it is now
  named 'panelSlow' and the cure (paging) is deferred.
- The tray tooltip part of the title-bar row is not done (deferred, small).
- Whether a served combat snapshot can keep hydrating true after live is still unknown (experiment
  12); 'ok' with the 15 s rule still covers it.
- Keeping a last good root means a folder that was truly removed is listed as empty until a sweep
  finds another; the no-logs screen then names that folder and says it does not exist.
- The synchronous sweep and the other synchronous file calls on main are not removed here
  (deferred); the 60 s floor only stops the sweep repeating.

### Situations it settles

Every other tab while the read is not live or has ended; Floating overlays while the read is not
live, has ended, or the engine went away.; Title bar and tray as a status signal.; Report wait =
notAnswering, case (b); Report wait = ok.; 4b. Permission denied on the Logs folder (it cannot be
listed); 5. The Logs folder is missing, or the EverQuest folder the app remembers no longer exists;
7. A UTF-16 log; 6c. The automatically found EverQuest folder is on a drive that drops out and comes
back; 7a. The path is a directory; A folder named like a log (eqlog_Name_server.txt) is in the Logs
folder

## R4: The read recovers by itself when a fact changes

- Where: typescript. Size L. Depends on: R1, R2.
- After this phase: If the log was missing, locked or briefly unreadable, the app starts reading by
  itself once it can open the file. A read that ended for no lasting reason is tried once more. A
  slow attach is adopted instead of called a refusal. A wait that went unanswered keeps asking. If
  the engine stops reading after it was live, the app notices within about 30 s, says so and reads
  again once, and not a second time inside 30 minutes. The app never shows one character's data
  under another's name.

### Steps

1. New src/main/dataServer/readRetry.ts (pure policy, clock handed in). `afterEnded({ probe,
   autoTries })`: probe missing, unreadable or pending answers 'watchFile'; probe clean and
   autoTries 0 answers 'retryIn 2000'; otherwise 'stop'. `onProbeChange(was, now, fileBackTries)`:
   from a problem to clean answers 'reattach', at most 5 times per log per engine launch.
   `afterLiveEnded(endsAt: number[], now)`: 'reattach' when no earlier after-live end lies inside
   the last 30 minutes, else 'stop'. Go-live clears `autoTries` and `fileBackTries` only; the
   after-live window is cleared by nothing but time and the player's Try again. Before (first
   design): every counter reset on go-live, so a reader that died after live was re-read for ever.
2. New src/main/dataServer/attachTurn.ts, a leaf with its dependencies handed in like foldWait.ts
   (request, mine, target, getAttached, setAttached, stateDir, clock, wait, note, noteError,
   folding). It takes over `attachAndProbe`'s decision, `sendAttach` and the go-live check from
   engineClientHost.ts (which also brings that file back under its ceiling). Rules: (1) an accepted
   attach records `setAttached(logPath)` even when the turn is stale (before: switch A, B, A left
   main believing A while the engine read B); (2) an attach rejected with `isLinkLost` records
   nothing; (3) an attach that timed out does not stop: it goes on to the health wait, and a mark
   naming this log with status attaching, folding or live adopts it (`setAttached`, `folding()`); an
   idle answer with no mark re-sends up to 2 times, 2 s and 5 s apart, then records the attach
   error; (4) on a live answer, `markAgrees(mark, target)` compares `health.mark.log` with the
   TURN'S TARGET (not with what main believes is attached), case and slash insensitive; on a
   difference live is not recorded, `setAttached(null)`, and the attach is sent once more in this
   turn; a second difference records the error and leaves the 'mismatch' wait.
3. src/main/dataServer/foldWait.ts: `FoldHealth.mark` is retyped to the wire's real field `log` (it
   says `logPath` today and nothing reads it). `waitForFold`: after FOLD_REFUSAL_LIMIT refusals it
   calls `failed('unanswered')` once and keeps asking every 5 s for as long as the turn is current
   (before: returned null and nothing asked again, so an engine that then went live was never seen).
   An answered poll clears a standing 'health' error (`noteLogReadHealth`).
4. After live. src/main/dataServer/supervisor.ts `beginHealth`: `onHealthy: (health, first) => {
   this.deps.onHealth?.(health); if (first) ... }` (one new optional dep; the watchdog already asks
   session.health every 30 s on a fresh connection and throws the status away). engineHost.ts passes
   `onHealth: noteSupervisorHealth`. New src/main/dataServer/afterLive.ts (pure):
   `afterLiveVerdict({ liveOn, probeStatus })` is 'confirm' when main holds a live log and the
   probe's status is not live, else 'fine'. engineClientHost.ts `noteSupervisorHealth`: on 'confirm'
   it asks session.health once on main's own connection; a second not-live answer in the same turn
   is the end: new turn, `pushWorldChanged()`, `engineLiveOn` cleared, `setAttached(null)`, fold
   error 'the engine stopped reading after it was live', then `afterLiveEnded`. Before: nothing
   looked at status after live, so a reader that died left stale numbers and refused reads with no
   reason. No new poller on main's connection (a health ask there waits behind large replies).
5. New src/main/logReadRecovery.ts (the binding). On `failed('ended')` it runs `afterEnded`:
   'watchFile' starts an unref'd 5 s timer calling `logProbe.look(path)` (single-flight, R2) and on
   `onProbeChange` 'reattach' calls `reattachEngineLog()`; 'retryIn' arms the one delayed retry;
   'stop' records the stopped-twice line. The timer stops on go-live, on a new turn and on 'stop'.
   Before (BRANCH_NOTES, owner default 2026-11-19): nothing retried by itself.
6. src/main/session.ts `tailCharacter`: `batchStore(() => attachCharacter(ref))` is wrapped in
   try/catch that logs and still calls `sendWorldRebuilt(ref)`. Before: a settings write that threw
   (disk full, read-only config) rejected before the signal, the engine attached and went live
   through the fallback in `attachTarget()`, and no read was ever served.
7. src/shared/logReadWords.ts: the Try lines for logMissing and logUnreadable gain the sentence that
   the app will try by itself.
8. Words: BRANCH_NOTES (the 2026-11-19 default is replaced once the owner answers question 2; the
   caps; the after-live path) and requirements/fix-combat-reading-log.md.

### What the player reads

- Try (logMissing), changed: In game, type /log on. The app will pick the file up by itself.
- Try (logUnreadable), changed: Close any program that has the log open. The app will try again by
  itself.
- Last error row, new: read: the engine stopped reading after it was live
- Last error row, new: read: stopped twice; not trying again by itself
- Last error row, new: read: stopped twice after going live; not trying again by itself
- Last error row, new: open log: the engine is reading another log

### Tests

- tests/dataServerReadRetry.test.mts (new): afterEnded for missing, unreadable, pending, clean with
  0 tries, clean with 1 try; onProbeChange only on problem to clean and capped at 5; go-live clears
  autoTries and fileBackTries.
- tests/dataServerReadRetry.test.mts: live, ended, re-attach, live, ended inside 30 minutes: the
  second end answers 'stop'; the same 31 minutes apart answers 'reattach'; a manual try clears the
  window. Proves go-live cannot reset the after-live cap.
- tests/dataServerAttachTurn.test.mts (new, fake client): the sequence A, B, A with B's attach reply
  arriving after turn A2 has started sends a second attach for A and never records live on B; the
  same sequence with B's reply arriving before any of A2's define replies also ends on A. Proves 12b
  is closed in both orders.
- tests/dataServerAttachTurn.test.mts: a live answer whose mark names another log is not recorded as
  live and one more attach is sent; a second difference records the error and sends nothing more.
- tests/dataServerAttachTurn.test.mts: an attach timeout followed by a folding mark for this log
  adopts it and calls `folding`; a timeout followed by idle re-sends twice and then records the
  error; an attach rejected by a lost link records no attach error; a badParams refusal records one
  and stops.
- tests/dataServerFoldWait.test.mts: three refusals call failed('unanswered') once and the loop
  keeps asking at the slow cadence; a later 'live' answer is returned (replaces the pinned case that
  three refusals end the turn); idle still ends the wait; a superseded turn still ends it silently.
- tests/dataServerAfterLive.test.mts (new): 'confirm' only when a live log is held and the probe
  says idle, attaching or folding; 'fine' when nothing is live or the probe says live.
- tests/dataServerSupervisor.test.mts: every healthy answer reaches `onHealth`, the first one
  included, and the READY edge still fires once.
- tests/logReadState.test.mts: an answered poll clears a 'health' error and leaves a 'fold' error.
- tests/sessionTail.test.mts (new, with batchStore and sendWorldRebuilt injected through a small
  seam): a throwing store write still sends the world-rebuilt signal.

### Risks and limits

- This overturns the owner default of 2026-11-19 (nothing retries by itself); it needs his word
  (owner question 2).
- The one automatic retry of a read that ended on a panic re-reads up to the same line once more
  before stopping; on a multi-GB log that is minutes.
- On 12b the attack said the stale-turn record alone cannot close it. By reading, B's reply does
  arrive before turn A2 decides (replies come back in request order on one connection and A2 awaits
  five define round trips first), so it closes the ordinary case; the mark check against the turn's
  target is added anyway because it holds whatever the order, and the sequence test drives both
  orders.
- After-live detection rides the supervisor's 30 s probe, so a dead reader is noticed in up to about
  30 s plus one confirm; it also works while main's own link is reconnecting, which the first
  design's poller did not.
- attachTurn.ts takes real logic out of engineClientHost.ts; the existing e2e engine-shim run is the
  check that the launch path still attaches once and only once per log.
- Sleep and hibernate are closed by reasoning (reconnect from R1, keep asking from here); experiment
  3 still has to be run.
- sessionTail.test.mts needs a seam in session.ts, which imports Electron; if that is not clean, the
  try/catch is pinned by a source test instead.

### Situations it settles

2b. The engine is told to attach a path that is missing at that moment; 3a / 3b. Another program
holds the file open without sharing; 3d / 6a. A read fails part way through the first whole-log
read; 4a. Permission denied on the log file itself; Report wait = logMissing.; Report wait =
logUnreadable.; 9. session.attach is refused; Report wait = attachRefused.; 8c. (added) The fold
wait gives up after three unanswered health polls; Report wait = notAnswering, case (a); 11. (added)
The same panic on a line the game writes after the app is live; After live: a panic in the follow
loop; The engine's reader thread dies AFTER the read went live; 12b. (added) Switch A to B and back
to A while B's attach is on the wire; A settings-file write fails while the character is being
attached; 10. The PC sleeps or hibernates during the read, or for hours while live, and wakes

## R5: The engine process: no blind kill, no blind relaunch loop, right words for why it will not start

- Where: typescript. Size M. Depends on: R2, R4.
- After this phase: A busy engine that is still talking on the app's own connection is not killed in
  the middle of a read. An engine that keeps being restarted while reading the same log stops being
  re-pointed at it after 3 times and the app says so, with Try again. A restored engine file is
  found without a click. A slow start is given longer and the app remembers it. A blocked local
  connection and a half-updated install get their own words.

### Steps

1. Proof of life. src/main/dataServer/logReadState.ts: `noteEngineHeard(at)` and `engineHeardAt()`,
   stamped from the progress and module-changed listeners (engineClientWiring.ts), from `sawHealth`,
   and from R4's `onHealth`. src/main/dataServer/supervisorHealth.ts: `HealthWatchDeps` gains
   optional `engineHeardAt()`, `now()` and `engineIsLive()`; in `failed()`, before `onUnhealthy`,
   when every reason is transient, the launch has been ready once, the engine was heard inside the
   last 20 s and that stamp is newer than the one used for the previous forgiveness, the watch logs
   it, counts nothing and schedules the next ordinary probe. While the read is not live there is no
   cap (each pass needs fresh evidence); once live, at most 6 forgivenesses in a row, then the kill
   as today. Before: two failed probes about 14 s apart ended a launch that was answering main four
   times a second, and the whole log was read again. engineHost.ts passes the three functions;
   supervisor.ts is not touched for this.
2. Death cap. src/main/dataServer/supervisor.ts `noteServedExit`:
   `this.deps.onServedExit?.(cause.failure)` (it already skips a deliberate stop). New
   src/main/dataServer/engineDeaths.ts (pure): `death({ attached, wasLive, failure }, at)`,
   `mayAttach(now)` false at 3 deaths before live, or 3 deaths after live inside 30 minutes; go-live
   clears the before-live count; `clear()` on the player's Try again; `count()`. engineClientHost.ts
   `onEngineReady(null)` remembers `{ attached, wasLive }` for the ending launch and new export
   `noteServedExit(failure)` (called from engineHost.ts `onServedExit`, the same call stack) feeds
   `death`. attachTurn.ts asks `mayAttach` before any attach: when false it sends none, records a
   fold error and the new wait 'engineCycling'; the engine stays up, idle and healthy; Try again
   (action reattach) clears the counts and attaches. Before: READY reset the failure count, so the
   relaunch came after 1 s every time, the log was re-read from byte 0 for ever and no card was
   raised.
3. While deaths are 1 or 2 and the app is still reading, the wait stays 'reading' (the bar keeps its
   numbers) and the report carries a note with the count; the bar draws that one line under itself,
   and the Engine row says it too.
4. src/main/dataServer/supervisor.ts (396 of 440 code lines; about 16 added by this phase and R4).
   `beginLaunch` absent branch: arm `cancelRestart` with a 30 s timer that runs `beginLaunch` again
   (before: no timer, only the button). `beginLaunch` after `wire`: `this.launch = l.finished ? null
   : l`, and the restart timer clears a finished launch before its check (before: a launch that
   failed inside `wire` left the supervisor in backoff for ever). `wire`: the announce timer uses
   new `engineAnnounceTimeoutMs(this.failures, this.lastAnnounceMs)` from engineProtocol.ts: 10 s,
   then 30 s, then 60 s by failure count, and never less than twice the last announce time that
   worked, capped at 60 s; `onStdoutLine` records `lastAnnounceMs` (before: a fixed 10 s at every
   launch, so a PC that needs 15 s lost a launch each time). `fold` passes the probe reasons on the
   fault. `localSocket` also calls a new optional dep `onLocalSocket(detail)`, which engineHost.ts
   turns into a logReadState note.
5. src/shared/engineLaunch.ts: `EngineFaultSay` gains optional `reasons`. `failureWords`: kind
   'unhealthy' where every reason is 'connect' gets the new local-connection words; where a reason
   is 'protocolMismatch' it gets the existing 'bad-announce' words (reinstall). Before: both read
   'The data engine stopped responding' with no advice.
6. src/shared/logReadReport.ts and logReadWords.ts: waits 'engineCycling' (shown at once) and
   'localSocket' (supervisor still starting with the local-socket note; shown at once) with words,
   Try lines and short labels 'Engine keeps stopping' and 'No local connection'; the engineMissing
   Try line says the app looks again by itself.
7. Words: BRANCH_NOTES ('relaunched forever with no card' is done; the forgiveness rule; the cap)
   and requirements/fix-combat-reading-log.md.

### What the player reads

- The data engine has been restarted 3 times while reading your log.
- Try (engineCycling): Press Try again. If it keeps happening, send a screenshot of this box.
- Note under the bar: The data engine has been restarted 2 times while reading your log.
- Engine row, new words: restarted 2 times
- This PC cannot open a local connection right now.
- Try (localSocket): Close programs that hold many network connections, or restart the PC.
- Card headline: EQ Companion cannot reach its data engine
- Card body: The engine started, but this PC refused the local connection to it. It has tried 3
  times.
- Card remedy: A firewall or security program blocking local connections (127.0.0.1) does this.
  Allow EQ Companion in it, then press Try again.
- Try (engineMissing), changed: Check your antivirus quarantine, then reinstall. The app looks again
  every 30 seconds.
- A protocol mismatch now shows the existing card "The data engine is not the one this version
  expects" with "Reinstalling EQ Companion replaces it."

### Tests

- tests/dataServerSupervisorHealth.test.mts: two transient failures with the engine heard 5 s ago do
  not call onUnhealthy and the next probe is scheduled; the same with a stamp 40 s old does; the
  same stamp is not accepted twice; a non-transient reason (refused, protocolMismatch) is never
  forgiven; a launch that never reached ready is never forgiven; once live, the seventh forgiveness
  in a row is refused; while not live there is no cap.
- tests/dataServerEngineDeaths.test.mts (new): mayAttach is false at 3 deaths before live and at 3
  after live inside 30 minutes; true again after clear(); live clears the before-live count and not
  the after-live one; a death with nothing attached is not counted.
- tests/dataServerSupervisorCycling.test.mts: onServedExit carries the failure kind for an exit and
  for an unhealthy kill, and is not called on a deliberate stop.
- tests/dataServerSupervisor.test.mts: an absent binary is probed again after 30 s and a file that
  appears is launched; restart() still probes at once; a fake child with no stdin leads to a second
  spawn (settles the not-settled row); the announce wait is 10, 30, 60 s by failure count; after a
  launch that announced at 15 s the next wait is 30 s even with the count back at 0.
- tests/dataServerEngineProtocol.test.mts: engineAnnounceTimeoutMs at 0, 1, 2 and many failures,
  with and without a last good time, capped at 60 s.
- tests/engineLaunch.test.mts: failureWords for unhealthy with connect-only reasons, with
  protocolMismatch, and with timeout (unchanged words).
- tests/logReadReport.test.mts: 'engineCycling' when the cap is reached, with the count in the
  sentence and action reattach; deaths of 2 while reading stays 'reading' with the note;
  'localSocket' while the supervisor is starting with that note.

### Risks and limits

- The watchdog forgiveness is kept although the attack filed it with the cut 'recycle' verb: it is
  what closes 7a, one of the seven likely-and-bad rows. It needs fresh evidence at every probe, so
  it is not a blind loop; after live it is capped at 6 in a row because an engine that cannot accept
  a new connection breaks the renderer relays (owner question 6).
- The recycle verb and 'notAnswering restarts the engine' are cut, as the attack asked: 7c (the
  reader stuck after live while health says live) stays told, as 'panelSlow' or 'notAnswering', and
  not cured (deferred).
- The count includes the app's own watchdog kills, on purpose: a kill loop is the same loop to the
  player, and the sentence says 'restarted', which is true of both. It does not include a deliberate
  stop.
- After the cap the app shows no data until the player presses Try again; that is the price of not
  looping (owner question 3).
- The memory row is closed only in the sense that the player is told and the loop stops; the engine
  still runs out of memory on such a log (R7 has the one-line release, the real bound is deferred).
- supervisor.ts ends near 412 of 440 code lines; anything further there needs a split.

### Situations it settles

2. A healthy long read mistaken for a hung engine by the supervisor's health watch; 7a. Engine
process alive but answering nothing; 5. Engine process dies in the middle of the whole-log read; 6.
Engine dies after the read is live and it is serving; Report wait = engineStarting, and the loop it
hides; 4. Memory that grows with the log's length, and the engine running out of memory; 1. Engine
binary missing (deleted or quarantined, no file on disk); Report wait = engineMissing.; 3. Engine
starts but does not announce its port within 10 s; 4a. Every loopback connect is refused or blocked;
4b. This PC cannot open a local socket at all; 14. (added) Half-updated install; 15. (added) A
launch that fails inside wire() before beginLaunch stores it

## R6: The log is there but nothing is being written, or the game runs from another folder

- Where: typescript. Size M. Depends on: R2, R3, R4.
- After this phase: When the read is live and the attached log has gone quiet, the app says only
  what it can stand behind: the game is running from another folder (with a button to read that
  folder), the log file is gone, or another program is holding it. For a player with the game in
  front for 10 minutes and nothing written, it shows one quiet, conditional line once per log per
  session. For a player who is simply idle or alt-tabbed it says nothing. The no-logs screen offers
  the same folder button.

### Steps

1. New src/main/log/quietLog.ts beside quietSwitch.ts, the same shape: no fs, no Electron, no clock.
   `QuietLogWatcher.observe(o)` takes every fact as an argument: now, engineLive (main holds a live
   log and readiness is ok), lastLineAt, the attached log's size at this poll, main's probe answer
   for it, whether a sibling is growing, presence (observed, eqRunning, eqFocused), the game's
   folder or null, and the app's EverQuest root. Outcomes in priority order: 'live' (a line arrived
   since the last poll: everything clears), 'logGone', 'logLocked', 'otherFolder', 'maybeOff',
   'none'.
2. The rules, each a line of that file. Nothing at all while engineLive is false (before, in the
   first design: growth during a long first read looked like 'the app is not reading' and restarted
   the read from byte 0; that outcome and its automatic re-attach are cut entirely). Nothing before
   60 s of silence. 'logGone' and 'logLocked' need the probe to say missing or unreadable.
   'otherFolder' needs presence observed, the game running, and a known game folder that differs
   from the app's root (compared without case or trailing slash). 'maybeOff' needs the EverQuest
   window in front for an accumulated 10 minutes since the last line, the file's size unchanged for
   all of it, and no sibling growing (the switch card owns that case); it is spent at fire time per
   log path for the session, the QuietSwitchWatcher rule. No outcome ever re-attaches or switches by
   itself (owner ruling 2026-08-21).
3. src/main/presence.ts: beside `lastForeground`, remember the exe path of the last foreground
   record whose side was 'eq' and whose path is non-empty, and export `eqGameFolder()` (its
   directory). presenceProtocol.ts `isEqWindow` already classifies a second install's client as 'eq'
   by image name and the record already carries the path, so no new watcher work.
4. New src/main/quietLogHint.ts (the binding), called from `poll()` in src/main/switchNudge.ts with
   the samples that poll already took (still bought only by silence). The probe is
   `logProbe.look/last` (R2, single-flight, async). It turns the outcome into `LogReadReport.notes`
   through logReadState. 'otherFolder' is offered only after an async, single-flight `readdir` of
   `<game folder>/Logs` has found a character log, and carries the button. No eqclient.ini read:
   nothing here adds a synchronous file call to main.
5. New IPC `engine:logReadNoteAction` with a payload from a closed set, validated in main:
   'useGameFolder' (main holds the folder and runs the same two calls the Preferences picker makes:
   set the install folder, then `applyEqDirChange()`; no path crosses to the screen) and
   'dismiss:<note id>' (spends that note for the session). src/preload/engine.ts gains the call;
   LogReadBand.tsx draws the note's button and a Dismiss button for the two dismissible notes.
6. src/renderer/src/components/NoLogsEmptyState.tsx: when main reports a known game folder that
   differs from the folder it looked in and holds character logs (one new field on the folder config
   main already pushes), it prints the other-folder line and the same button.
7. Words: BRANCH_NOTES (what the hint may and may not say, the live gate, once per log per session)
   and requirements/fix-combat-reading-log.md.

### What the player reads

- Note: EverQuest is running from another folder than the one this app reads.
- Button: Read logs from there
- Note: No new log lines for 10 minutes while EverQuest is in front.
- Note Try: If you are playing, type /log on in game, or check the EverQuest folder in Preferences.
- Note: Your log file is missing. In game, type /log on.
- Note: Another program is holding your log file. The app carries on when it lets go.
- Button: Dismiss

### Tests

- tests/quietLog.test.mts (new), the whole decision with no fs: with engineLive false, growth,
  silence and a missing file all give 'none' (the first-read case); a line arriving clears
  everything; nothing before 60 s; 'logGone' and 'logLocked' follow the probe; 'otherFolder' only
  with presence observed, the game running and a differing folder, compared without case or trailing
  slash.
- tests/quietLog.test.mts, the idle cases: game running but not in front, 60 minutes: never fires;
  presence unobserved: never fires; game in front 10 minutes, no growth anywhere: 'maybeOff' once; a
  second 10 minutes on the same log: silent; a sibling growing: silent; the attached file growing:
  silent.
- tests/presence.test.mts: an 'eq' foreground record with a path sets the game folder; one with an
  empty path (elevated) leaves it; a non-eq record does not change it.
- tests/logReadActions.test.mts: the note action accepts only the closed set; 'useGameFolder' with
  no folder held does nothing; 'dismiss' spends only the named note.

### Risks and limits

- The attack asked to cut 'maybeOff' and the folder button until experiments 7 and 8. Both are kept
  in reduced form, because neither needs those experiments: 'maybeOff' rests on presence and file
  size only, and the game's exe path is already carried on the foreground record and used by
  isEqWindow. What IS cut until experiment 7: reading eqclient.ini ('Logging is off' as a stated
  fact), deferred. The owner's two cases (logs never turned on again, game somewhere else) would
  otherwise have no words at all.
- A game run as administrator gives an empty path, so 'otherFolder' then never fires and the
  conditional line is the only hint (experiment 8).
- 'maybeOff' can show once to a player who stands in a silent zone with the game in front for 10
  minutes. It is conditional in its wording, shown once per log per session, dismissible, and never
  a card or a sound (owner question 4).
- The quiet clock is fed by module cursors, so log growth that moves no module (lines the parser
  does not claim) reads as quiet; the file-size-unchanged rule is what stops 'maybeOff' firing then.
- The after-live rows are closed from the TypeScript side (the player is told, from main's own look
  at the file); the tail's own state on session.health is deferred.
- switchNudge.ts's own poll still uses synchronous stat and read calls (existing code, deferred with
  the other synchronous file calls).

### Situations it settles

11b. The game is being played from a different EverQuest folder than the one the app reads; 3c / 4c
/ 6b. After live, the tail cannot stat, open or read the file; After live: the log file is deleted,
renamed or moved while the engine follows it; After live: the log is locked or unreadable for a
while

## R7: The engine phase (Rust), built in its own worktree and target directory

- Where: both. Size M. Depends on: R1, R4.
- After this phase: The health answer cannot hang on a dead drive, so a healthy engine is not killed
  for it. A log that was replaced or cut during the first read is read again whole instead of losing
  lines. Four one-line leaks and mismatches are fixed, and the field order R1 relies on is pinned.

### Steps

1. engine/crates/engined/src/world.rs `health()`: `log_mtime_ms` is copied from the fold state
   instead of `fold.log.as_deref().and_then(mtime_ms)`. New `World::report_log_mtime(generation,
   Option<i64>)`, called by the ingest thread: after the open (from `file.metadata()` on the
   handle), with a progress frame at most once a second, and after each tail poll from the stat that
   poll already makes (engine/crates/eqlog/src/tail.rs `PollStats` gains `modified_ms`, filled from
   the same `metadata` call; no extra call). No filesystem call remains on a connection thread.
   Before: every health answer ran `fs::metadata`, so a stat that blocks on a dropped share made two
   probes miss 5 s and a healthy engine was retired. The schema's shape is unchanged; the
   description of logMtimeMs in protocol/schema/messages.schema.json is reworded from 're-stated
   fresh on every health answer' to 'as of the reader's last look, under a second old' and the
   generated files are regenerated (owner question 5).
2. engine/crates/engined/src/ingest.rs, end of the scan loop, before the landing is reported: stat
   the path; if it is missing or shorter than the scan's checkpoint, end the read with the error
   line `the log changed while it was being read`. Status goes idle before live, and R4's one
   automatic re-attach reads the new file whole. engine/crates/eqlog/src/tail.rs `FileTail::open`:
   `TailStart::At(at)` keeps `at` instead of `at.min(size)`, so a cut in the moment between that
   check and the first poll is caught by the poll's own shrink rule. Before: lines the game wrote
   into a recreated or shortened file before go-live were never read.
3. ingest.rs: `drop(file)` after the scan loop, so the first-read handle no longer pins a deleted or
   archived log until exit. engine/crates/fold/src/combat/lifecycle.rs: `st.history[drop_idx].events
   = VecDeque::new()` in place of `.events.clear()`, so an old fight's ring gives its memory back.
   ingest.rs `character_of`: split at the first underscore (`find` in place of `rfind`), as main and
   the engine's lister do.
4. engine/crates/protocol/tests/transport.rs: pin that a `Reply` serializes with `id` then `kind`
   before `result`, and a `ResetMessage` with `epoch`, `id`, `kind` before `rows`, because R1's
   `messageIdOf` reads the id from the head of an over-limit line.
5. Words: BRANCH_NOTES (health never touches the disk; the changed-file line) and, if the owner
   agrees, the wording of rulings 18 and 21 where they say 'fresh on every answer'.

### What the player reads

- No new sentence.
- Engine stderr line that can appear under "Engine said": the log changed while it was being read

### Tests

- engine/crates/engined/src/world.rs unit test: health returns the recorded stamp and returns
  promptly when the attached path does not exist; the stamp is absent before any report and after a
  new attach until the reader reports.
- engine/crates/eqlog/src/tail.rs test: a poll's stats carry the file's modified time; opening at an
  offset past the file's end keeps the offset and the first poll restarts at byte 0.
- engine/crates/engined/tests/ingest.rs: a log replaced by a shorter file during the scan ends the
  read idle with the changed-file line and never reports live; a log that only grew during the scan
  lands as before.
- engine/crates/fold lifecycle test: after the 61st fight the oldest ring's capacity is 0.
- engine/crates/engined ingest test: character_of for eqlog_Name_server_2026-11.txt is Name; for
  eqlog_Name_server.txt still Name.
- engine/crates/protocol/tests/transport.rs: field order of Reply and ResetMessage.
- tests/dataServerTransport.test.mts: messageIdOf over the head of a real encoded Reply fixture and
  a real ResetMessage fixture from protocol/fixtures. Proves both sides agree on the bytes.

### Risks and limits

- The attack's uncovered point that World::attach reads the spell table under the world lock is
  wrong by reading: ClientSpells::beside_log (engined spells.rs) is two path joins and two empty
  OnceLock cells; the 38 MB read happens later on the asking connection's thread. Nothing is changed
  for it.
- The engine-side reply limit and its 'reply too large' string contract are cut, as the attack
  asked: R1 names the case on the app side and stops asking again. The engine still builds and sends
  a reply the app will discard, once per turn (deferred with paging).
- Un-clamping the tail start by itself would re-read a log that was cut in place as live lines on
  top of what was already counted; the check before landing is what makes it safe, and the remaining
  window is the moment between that check and the first poll. The same double count already exists
  after live and is deferred.
- The health stamp is up to a second old instead of fresh per answer; that touches the wording of
  rulings 18 and 21.
- A hung open or read still blocks the reader thread itself; health then keeps answering 'attaching'
  and R2's 'opening' and 'logHung' say so. Only the kill is removed here.
- The engine's build cache is shared with other work today: this phase runs in its own worktree with
  its own CARGO_TARGET_DIR and lands after the TypeScript phases.

### Situations it settles

1c / 9b. The log is deleted or renamed away DURING the first read; 8c. The file is cut shorter while
the first whole-log read is running; 3c / 4c / 6b and the report row 'After live: the log is locked
or unreadable for a while'; The log is on a path whose file calls hang at launch; 1c / 9b. The file
is deleted or renamed away while it is being read or followed; 10b. A log name with more than one
underscore after the character name

## Deferred, with the reason

- A read checkpoint, so a relaunch or a reconnect after an engine death does not start at byte 0 Why
  not now: Large and in the engine: fold state would have to be saved and restored by (log identity,
  byte offset), with a format and an invalidation rule for every module. R5 only stops the loop; it
  does not make a re-read cheap. Would settle: The cost behind process rows 5, 6 and 13 and content
  row 4 (every death or quit re-reads the whole log)
- Paging the loot ledger and the fight list instead of one whole-state reply, and an engine-side
  refusal of a reply the app cannot read Why not now: A protocol change with generated code and
  fixtures on both sides, and every reader of loot and fights (Overview, Loot, Gaps, the archive
  capture) has to move to windows. R1 moves the limit, names the failure and stops asking again;
  this removes the growth and the wasted send. Would settle: The root of content row 3 (added), the
  15 s ceiling behind 'panelSlow', and the 16 to 64 MiB range
- A bound on what one module merged with archived history may carry across IPC Why not now: The show
  limit in R1 counts the engine's reply only; serveShim.ts projectModule then adds archived rows,
  and the size of the result is unknown without serializing it. Needs the archive feature to record
  each kept module's size when a segment is loaded, and experiment 17 first. Would settle: The
  attack's IPC point for archive users; the part of 14. (added) where the cure itself grows large
- A way to move an oversized log aside without the engine being live on it and without a
  whole-module capture (rename and compress only, totals filled in later) Why not now: Medium, in
  the archive feature, and it changes what an archive promises (totals captured before the move).
  Needed because above 64 MiB the capture is refused, now with words. Would settle: 14. (added) The
  archive as the cure for a log that is too large
- Take the synchronous file calls off main's thread: config.ts discovery and listing (existsSync,
  readdirSync, statSync, the 6 s sweep), switchNudge.ts sampleLogs (statSync, openSync, readSync)
  Why not now: Wide: listing and discovery are synchronous by design and have many callers (the
  picker, spell icons, output files, the quiet-switch poll). On a dropped share or USB drive they
  can freeze the window, where no screen can say why. R3 only stops the sweep repeating; R2 and R6
  add no new synchronous call. Needs experiment 10 to size it. Would settle: The attack's first
  uncovered item (window 'Not Responding' on a dropped share); the main-thread half of 'The log is
  on a path whose file calls hang at launch'
- Non-ASCII and very long paths Why not now: Not settled by the code and nothing in this pass
  changes it; needs experiment 11 before any fix can be named. Would settle: 10a. Non-ASCII
  characters in the Windows user name or path; a very long path
- Say 'Logging is off in EverQuest' as a fact, from the game's own eqclient.ini in the folder the
  game runs from, read asynchronously and only while the log is quiet Why not now: Whether this
  client writes a Log key, and when (the attack notes it may be written only at camp or exit, so a
  stale TRUE must never veto), is unknown until experiment 7. Until then R6's conditional line is
  the only logging hint. Would settle: The stated-fact half of the owner's 'they never turned logs
  on' case
- Recycle an engine whose reader is stuck after live while health still says live Why not now: Cut
  from R5 with its restart-on-button action: the evidence (reads timing out for 30 s) cannot be told
  from a reply that is merely too slow, and a restart re-reads the whole log. Better done with the
  engine reporting how long ago its reader last turned (a schema change). Would settle: 7c. After
  live, the reader thread stops
- Skip a line that panics instead of ending the read (catch per line), with a count and a give-up
  Why not now: Uncertain: a panic in the middle of folding one event can leave a module half
  updated, so skipping the line may trade a stopped read for wrong numbers. Needs the fuzz run
  (experiment 14) and a decision between skipping the line and quarantining the module. Would
  settle: 10. A line that makes the parser or a fold module panic, during the first read (until
  then: told, one retry, Try again)
- A cap on one line's length in TailCore (drop bytes to the next newline past 1 MiB) Why not now:
  Touches the mark (the end of the last complete line), which the tail oracle tests are built on;
  small in lines, not small in consequences. Would settle: 5. One enormous line: megabytes or more
  with no newline; the cure for 7b. The read itself is stuck
- A shrink or a replaced file after live starts a fresh historical read instead of folding the
  survivors again as live lines; detect a same-size replacement by reopening when a read returns
  nothing while the stat says longer Why not now: Medium in the engine and the app's own archive
  relies on today's cut-to-zero behaviour; needs its own design and oracle cases. Would settle: 8b.
  The file is cut to a shorter, non-empty length; 9c. The file at the path is replaced by a
  different file; 12. Duplicate content; After live: the log is rewritten shorter in place; While
  the app is live, the log is cut down to a non-empty remainder
- The tail's own condition on session.health (missing since, last poll error, when bytes were last
  read) Why not now: A schema change. R6 tells the player from main's own look at the file, which is
  enough to stop the silence. Would settle: The fuller version of the two after-live report rows
  (deleted, locked)
- A panic hook in the engine that prints file and line only Why not now: Engine change with a
  privacy purpose; which panics can quote log text is unknown until the fuzz run. Would settle:
  Privacy of the box, gap (c)
- Count unknown-kind events and carry it on health or perf.snapshot; show the engine's clock-skew
  reading on screen at 30 minutes or more; clamp negative gaps in the fight lifecycle Why not now:
  Both sides, rare and mild, and the first is a schema change. Would settle: 8. A log from another
  language client or another EverQuest ruleset; 9. Timestamps
- Bound the fight history's memory itself Why not now: Larger than the one-line release in R7 and it
  changes what old fights can show; needs the memory measurement first (experiment 13). Would
  settle: The engine half of 4. Memory that grows with the log's length
- Owner process id and channel in the archive journal, so a second copy leaves a running copy's
  journal alone Why not now: Not settled by the code what two concurrent finishes do; rare; belongs
  to the archive feature. Would settle: Two copies on different channels (installed build and dev or
  upstream build) with Summarize and archive log in use
- Find a growing log in another EverQuest folder when the game's exe path is unknown (elevated game)
  Why not now: Needs the discovery sweep, which is synchronous on main; depends on the
  synchronous-file-calls entry above and on experiment 8. Would settle: The remainder of 11b when
  presence gives no path
- A real session.detach, the tray tooltip with the last line's time, and a try/catch around
  liveHistory.mergeHistory in projectModule Why not now: Small leftovers outside this pass: the
  first is a protocol addition, the other two are polish on handled rows. Would settle: The fuller
  version of 12c; the tray half of the title-bar row; the hardening note on 13. A log archive that
  is corrupt

## Experiments only a real machine settles

1. Size, time and memory of large replies. Build a log with 110,000 loot lines (and one with
   300,000). On today's build open Overview and confirm the console line 'a frame exceeded 8388608
   characters' and the box 'The app cannot connect to its data engine.' After R1, open Overview and
   Loot with two overlays open and record, per module.snapshot and combat.snapshot reply: characters
   on the wire, milliseconds from request to served, main's heap before and after
   (process.memoryUsage), the number of windows the reply is sent to, the time main is blocked per
   send (structured clone) and each renderer's heap. Decide from that whether 64 MiB (read), 32 MiB
   (show), the 16 MiB note and the 5 s floor stay.
2. In the packaged app's main process print require('buffer').constants.MAX_STRING_LENGTH and
   require('v8').getHeapStatistics().heap_size_limit, on a 16 GB and an 8 GB PC, and the same in a
   renderer. Confirms the ceilings the limits were reasoned from.
3. Sleep. Start the app on a large log, sleep the PC mid-read (classic sleep, and a Modern Standby
   laptop), wake it, and read the dev log for 'health probe failed', 'a serving engine died' and
   'session.health was refused'. Repeat with a multi-hour hibernate while live and check that a new
   log line reaches the Combat tab and that the band shows nothing or 'Connecting to the data
   engine.'
4. Hold the log open with no sharing during launch (a small script with FileShare.None). Read the
   box, release the lock, and time how long until the read starts by itself (R4). Note whether the
   engine's os error 32 line is under 'Engine said'.
5. With the app live, delete the log, type in game, and check that the file comes back (whether a
   delete-pending handle stops the game recreating it). Repeat after R7's drop(file).
6. Put a folder named eqlog_Test_server.txt in a test Logs folder as the newest entry and launch:
   before R3 read the box; after R3 confirm it is not listed.
7. eqclient.ini. On the owner's install: type /log off, look for a Log key in eqclient.ini at once,
   after zoning and after camping; type /log on and repeat. Settles whether the deferred 'Logging is
   off' fact can ever be stated and how stale the file can be.
8. Game folder. With the game in front, log what presence carries as the foreground exe path: run
   normally, run as administrator, and from a second install on another drive. Settles when R6's
   'otherFolder' can fire.
9. Starved read. Read a 2 GB log with every core saturated by another process at normal priority;
   count 'health probe failed (timeout)' lines and engine restarts before and after R5.
10. Dropped share. Put a log on a network share, go live, disable the network adapter; watch for
    'health probe failed (timeout)', for the band 'The drive holding your log is not answering.',
    and whether the window stops responding (main's synchronous existsSync, readdir and statSync on
    the Logs folder). Time how long one open blocks. Repeat at launch with the share already
    unreachable. Repeat after R7.
11. Paths. An e2e run with the Logs folder under a non-ASCII folder name, and one under a path
    longer than 260 characters.
12. On a multi-GB read, log the gap between the last progress frame and the 'live' health answer
    (for 'Finishing the read.', its 64 KiB and 5 minute rules, and the 60 s stalled rule), and log
    combat.snapshot.hydrating for 30 s after go-live.
13. Engine memory. Read the 170 MB log and note engined.exe private bytes at go-live and the fight
    count; repeat on the log doubled; repeat after R7's ring release.
14. Fuzz the parser and the fold over mutated corpus lines (multi-byte characters at every slice
    point, a debug build) and read stderr for panics and for whether a message quotes the line.
15. Idle test for R6. Stand a character in an empty zone with all channels off for 15 minutes with
    the game in front: expect the conditional line once and never again that session. Repeat
    alt-tabbed away: expect nothing. Repeat during a long first read with the game writing lines:
    expect nothing. Repeat with logging really off while playing: expect the conditional line at 10
    minutes.
16. Archive a large log in one build and launch the other channel's build during the compress step;
    compare the .gz hash with the record (the deferred two-copies row).
17. Archived history over IPC. Archive the 110,000-loot-line log, restart, open Loot: record the
    size of the merged loot state main sends, the time per send and the renderer heap. Settles the
    deferred bound on merged history and whether 'Turn on Summarize and archive log' is a full cure.
18. Slow panel. With a debug engine (or a starved one) make combat.snapshot take 3 to 10 s: confirm
    one request on the wire per options key (dev log), that Overview is served, and what the box
    says while it waits. Then one that takes over 15 s: expect 'Your log is read. This panel is
    taking too long to build.'

## What the second model's attack changed

The plan is right to put the 8 MiB cliff first, and phases R1 to R5 are the right outline. But six
problems would make players worse off or leave them stuck, so it should not be built as written.

1. R1 turns today's dead connection into silent data loss in the archive: the capture leaves out an
over-limit module and still moves the log aside.
2. R1 also lets a request storm freeze main on a healthy large log. A timed-out read is never
cancelled and is asked again every second, and the copies sent to each window over Electron IPC were
never counted.
3. R2's banner hides the engine-missing card whenever no character is selected.
4. R2's probe timeout can use up main's file threadpool when a share hangs.
5. R4 resets its retry caps on go-live, so a reader that dies after live is re-read in an endless
loop.
6. R6's 'notReading' fires during every long first read and restarts it from byte 0.

Smaller defects: untrue 'opening' and 'finishing' sentences, a false 'refused' during a reconnect,
the 12b fix whose tests pass with the bug still there, and the death count that counts the app's own
kills.

All seven likely-and-bad audit rows have a phase. After the corrections above, ship R1 (with the
archive guard and the in-flight fix), R2, R3, R4 and R5's death cap. Cut R6 down to its config.ts
fixes and cut R7 down to the health stat, drop(file) and the field-order pin.

- R1 (blocks): R1 turns a dead connection into silent data loss in the log archive. Once an
  over-limit module reply fails only its own request, the archive capture leaves that module out and
  still moves the log aside. The plan's risk note says capture 'fails that one read'. In the code,
  nothing makes the capture fail. Correction: Add this to R1, not later: the capture fails when any
  CAPTURED_MODULES read or the fights read is rejected. Keep 'module not served by design' apart
  from 'request failed', for example by letting snapshot return {error} rather than null. Add a test
  in the log-archive suite where one module's request rejects with a frameTooLarge cause:
  captureSegment must return ok:false and nothing is moved.
- R1 (serious): 'No worse than today' is wrong for replies between roughly 2 s to serve and 64 MiB.
  A timed-out read is not cancelled. The next 1 s poll, or the next moduleChanged, sends a fresh
  request. Several 20 to 64 MiB replies can be in flight at once, and each is JSON.parsed on main's
  thread and cloned to windows. Today the connection dies. After R1 a healthy large log freezes main
  again and again: a false 'broken' that comes from the fix itself. Correction: In R1, make
  serveShared join the real engine request until it settles, keyed by op and params, and race only
  each caller's own wait. Add a refetch floor that depends on size: a module whose last reply was
  LARGE_MESSAGE_CHARS or more is asked again at most every N s, and never while one is in flight.
  Add a test where a slow request plus three polls puts exactly one request on the wire. Until
  experiment 1 is in, consider shipping R1 at 32 MiB.
- R1 (serious): The 64 MiB reasoning counts two processes and leaves out the IPC path. A served
  module is cloned into every window that holds it. The largest measured reply, messageOverlay, is
  read by overlay windows. Loot is merged with archived history in projectModule, so what crosses
  IPC can be bigger than the engine reply. Chromium caps the size of one IPC message, roughly 128 to
  256 MB. A structured clone over that cap, or a renderer out of heap, kills a window with no words.
  That is worse than the named failure it replaces. Correction: Experiment 1 must also record the
  structured-clone size and the number of windows holding each large module. serveShim should refuse
  to forward a projected result above a bound and name it through noteReplySize, rather than pass it
  to IPC. Treat the bound for what crosses IPC as separate from the transport limit.
- R1 (serious): Wrapping all of receive() in try/catch hides failures in protocol state, not only
  listener throws. If a state listener throws during the hello reply, the client is left 'ready'
  with its outbox never flushed and subscriptions never reopened. No failure is raised, so the link
  keeper never reconnects. This creates a new silent-stuck case. Correction: Isolate each listener
  call: stateListeners, broadcasts deliver, sub.listener in emit and progressListeners each get
  their own try/catch plus a debug note. Keep a throw in the protocol code fatal; the keeper now
  reconnects it. Add a test where a throwing onState listener does not leave queued requests unsent.
- R1 (serious): A reconnect shows a false 'refused' message. If the link drops while session.attach
  is in flight, the rejection ('unavailable') is recorded as an attach error. 'attachRefused' is in
  SHOW_AT_ONCE, so 'The data engine refused the log file.' appears during an ordinary reconnect.
  Correction: Record an attach error only for an engine error reply (code other than 'unavailable'
  or 'timeout'). A rejection for a lost link goes to keeper.lost. Add a test where an attach
  rejected by failConnection records no attach error.
- R2 (serious): The banner chooser drops the engine failure card whenever no character is selected.
  engineWait answers 'noCharacter' before it checks engineMissing or engineFailing. On a fresh
  install with the engine quarantined and no logs yet, the player sees no card at all. Today the
  card shows from say.fault regardless of character. Correction: bannerFor shows the card whenever
  say.fault !== null, whatever the log wait. Alternatively, put the engine-fault checks above
  noCharacter. Add a bannerFor test: no character plus a no-binary fault shows the card.
- R2 (serious): The 2 s timeout on probeLog does not free the open. On a hung share each
  fs.promises.open holds a libuv threadpool thread (4 by default). With a 5 s cache and a 1 s
  publisher tick, a new probe starts while the old one is still hung. After about four of these,
  every async fs call in main stalls: store writes, archive, log reads. The whole app degrades, not
  just the box. Correction: Run one probe per path at a time. While an open is still pending, answer
  'unreadable' (not answering) without starting another, and start a new probe only after the old
  open settles. Add a unit test with an open that never resolves: exactly one open is ever issued.
- R2 (serious): 'opening' states a failure the app cannot stand behind. After 60 s in starting or
  attaching, the player reads 'The data engine cannot open your log.' The engine may only be slow,
  and main's own probe may open the file without trouble. Correction: Word it as slow, for example
  'The data engine is taking a long time to open your log.' Switch to logMissing or logUnreadable
  only when main's probe fails. Do not add it to SHOW_AT_ONCE.
- R2 (serious): 'finishing' is 'never stalled', so a real hang at the end of the scan (the landing
  step, a state write, the 7b class at end of file) reads 'Finishing the read.' forever, which is a
  silent wait under new words. The condition 'offset equal to the stated log size' is also brittle.
  The log grows during a read, and the mark is the end of the last complete line, so a file whose
  last line has no newline never matches. Correction: Call it 'finishing' when offset is within some
  KB of size. Cap it, for example after 5 minutes it becomes stalled. Add a test with offset == size
  held for the cap that ends as stalled.
- R2 (serious): noteEngineReadEnded sets fold to null. That removes 'Read so far' exactly when R2's
  own risk tells the player to send a screenshot showing where the read stopped. Correction: Expose
  lastOffset (and the last log size) in LogReadNotes. When the read has ended, measured() shows it
  as 'Stopped at'. Add a test where an ended read still reports the offset.
- R4 (serious): Resetting the automatic-retry counters on go-live makes an endless loop for failures
  that only happen after live. The read finishes and goes live, which resets the counters. The
  reader dies, watchLive reports ended and one automatic re-attach runs. The read goes live again,
  the counters reset again, and so on. Each round re-reads the whole log. The 'stopped twice; not
  trying again by itself' line can never be reached for this case. Correction: Count ends after live
  in a 30-minute window that go-live does not clear, the way liveDeaths does. Go-live clears only
  the counters for before live. Add a test for live, ended, retry, live, ended: the second end does
  not retry.
- R4 (serious): The 12b fix (A to B and back to A) does not close 12b. Turn A2 decides whether to
  skip its attach (`l.attachedTo !== target`) before B's in-flight reply lands. With attachedTo now
  recorded on stale turns, it ends as B, the engine is on B, and markAgrees(mark B, attachedTo B)
  agrees. Readiness stays notAttached because tsWorldPath is A. The proposed unit tests of
  attachOutcome and markAgrees pass with the bug still there. Correction: In sawHealth, compare
  health.mark.log with the turn's target (attachTarget()), not attachedTo, and re-attach once on a
  difference. Alternatively, serialize attaches by awaiting any attach in flight before
  attachAndProbe decides. Add a sequence test with a fake client for A, B, A and replies out of
  order.
- R5 (serious): Counting deaths in onEngineReady(null) also counts ends the app caused itself: the
  watchdog's unhealthy kill, R5's own recycle() (the Try again path) and supervisor stop or restart.
  'The data engine has stopped 3 times while reading your log' can then count the app's own kills.
  The supervisor already has a counter for served deaths. Correction: Count from the supervisor's
  cause through onServedExit, or a new cause-carrying dep. Exclude 'recycled on request' and stop.
  Reuse engineServedCycleStep rather than a second counter in engineClientHost.
- R6 (blocks): 'notReading' fires during the first whole-log read and restarts it, so a large log
  never finishes. Main's quiet clock is fed only by engine cursors, and cursors are dropped until
  the engine is live. With the player in game during a 10-minute read, the log grows with no cursor.
  After 60 s plus two polls, 'notReading' calls reattachEngineLog(), which re-reads from byte 0, and
  the cycle repeats. It also fires on growth that moves no module (another language client, unparsed
  lines). Correction: Gate every R6 outcome on health being live. Base 'is the app reading' on the
  engine's health mark offset against the file size, not on cursors. Never re-attach automatically
  from this heuristic; offer Try again only. Add a quietLog test: growth while the read is not live
  gives 'none'.
- R6 (serious): The logging check reads the wrong file in the case it matters for. readEqClientIni
  reads from the app's EverQuest root, not the folder the game runs from. The game writes
  eqclient.ini when the player camps or exits, so a stale Log=TRUE ('never fires') hides a /log off
  made during play. The read is also a readFileSync on main's thread. Correction: When
  eqGameFolder() is known, read the ini from that folder. Treat the ini as a hint, not a veto. Read
  it asynchronously and only while the log is quiet.

