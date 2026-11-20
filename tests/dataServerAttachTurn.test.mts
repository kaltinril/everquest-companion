// ONE TURN OF POINTING THE ENGINE AT A LOG (fork #9, phase R4): `src/main/dataServer/attachTurn.ts`.
//
// The turn used to live in `engineClientHost.ts`, which imports Electron, so nothing here had a
// test. What the move must keep exactly is section 1. What is new is the rest: an attach nobody
// answered is adopted instead of called a refusal, an answer about another log is never recorded
// as live, and everything that sends an attach again has a cap that is driven past here.
//
// The switch A, B, A in both reply orders is next door (dataServerAttachTurnOrder.test.mts).
// NOTHING HERE SLEEPS: `rest` resolves at once and records what it was asked to wait.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EngineError } from '../src/shared/dataServer/client'
import { ATTACH_RESEND_PAUSES_MS, ELSEWHERE_CODE, ELSEWHERE_DETAIL, markAgrees } from '../src/main/dataServer/attachTurn'
import { LOG_A, LOG_B, held, rig, settle, timedOut, type AttachAnswer } from './dataServerAttachTurnRig.mts'

// ---- 1. what the move out of the host must keep ---------------------------------------------------

test('THE DEFINES GO FIRST, THE HANDOVER BEFORE THE REQUEST, and the bar is told once the attach is accepted', async () => {
  const r = rig()
  await r.turn(LOG_A)
  assert.deepEqual(r.order, ['defines', 'stateDir', 'attaching', `attach ${LOG_A}`, 'folding', 'taken'])
  assert.deepEqual(r.attaches, [{ logPath: LOG_A, stateDir: 'C:\\Users\\tester\\AppData\\Roaming\\app' }])
  assert.equal(r.attached, LOG_A)
  assert.deepEqual(r.liveOn, [LOG_A])
  assert.deepEqual(r.errors, [])
  assert.ok(r.notes.some((line) => line.includes(`data-server engine attached: ${LOG_A} (epoch 1, accepted true)`)))
})

test('with no state directory the attach carries none', async () => {
  const r = rig()
  r.stateDir = undefined
  await r.turn(LOG_A)
  assert.deepEqual(r.attaches, [{ logPath: LOG_A }])
})

test('A REBUILD OF THE SAME LOG IS NOT A RE-ATTACH: the defines go again, the attach does not', async () => {
  const r = rig()
  await r.turn(LOG_A)
  await r.turn(LOG_A)
  await r.turn(LOG_A)
  assert.equal(r.attaches.length, 1, 'a second attach reads the whole log again for nothing')
  assert.equal(r.order.filter((step) => step === 'defines').length, 3)
  assert.equal(r.order.filter((step) => step === 'stateDir').length, 1)
  // Each turn still waits and still hears the engine say live.
  assert.deepEqual(r.liveOn, [LOG_A, LOG_A, LOG_A])
})

test('another log is a new attach', async () => {
  const r = rig()
  await r.turn(LOG_A)
  await r.turn(LOG_B)
  assert.deepEqual(r.attaches.map((a) => a.logPath), [LOG_A, LOG_B])
  assert.equal(r.attached, LOG_B)
  assert.deepEqual(r.liveOn, [LOG_A, LOG_B])
})

test('AN ATTACH THAT LOST TO A LATER ONE does not claim the bar', async () => {
  const r = rig()
  r.attachScripts.push({ lost: true })
  await r.turn(LOG_A)
  assert.ok(!r.order.includes('folding'), 'the winner-s own attach tells the bar')
  assert.ok(!r.order.includes('taken'), 'and the archive')
  assert.ok(r.notes.some((line) => line.includes('accepted false')))
})

test('a turn replaced while the defines were out sends no attach and asks nothing', async () => {
  const r = rig()
  const gate = held<undefined>()
  r.definesGate = gate
  const first = r.turn(LOG_A)
  const second = r.turn(LOG_B)
  gate.resolve(undefined)
  await Promise.all([first, second])
  assert.deepEqual(r.attaches.map((a) => a.logPath), [LOG_B])
})

test('a read that ended, and polls that went unanswered, reach the host as they did', async () => {
  const r = rig()
  r.healthScripts.push({ status: 'folding', epoch: 1, mark: { log: LOG_A, offset: 10 } })
  r.healthScripts.push({ status: 'idle', epoch: 1, mark: { log: LOG_A, offset: 10 } })
  await r.turn(LOG_A)
  assert.deepEqual(r.failed, [['ended', 'the engine reports idle after an accepted attach']])
  assert.equal(r.saw.length, 2, 'the idle answer is about this log and is passed on')
  assert.deepEqual(r.liveOn, [])
  assert.equal(r.attaches.length, 1, 'a read that ended is not sent again by the turn')
})

// ---- 2. the mark is compared with the turn's target ------------------------------------------------

test('markAgrees: the path the app handed over, in any letter case and either slash', () => {
  assert.equal(markAgrees({ log: LOG_A, offset: 0 }, LOG_A), true)
  assert.equal(markAgrees({ log: LOG_A.toUpperCase() }, LOG_A.toLowerCase()), true)
  assert.equal(markAgrees({ log: LOG_A.replace(/\\/g, '/') }, LOG_A), true)
  assert.equal(markAgrees({ log: LOG_B }, LOG_A), false)
  // A mark with no log (an engine that has attached nothing, or a fake) cannot disagree.
  assert.equal(markAgrees(undefined, LOG_A), true)
  assert.equal(markAgrees({ offset: 4 }, LOG_A), true)
})

test('A LIVE ANSWER WHOSE MARK NAMES ANOTHER LOG IS NOT RECORDED AS LIVE, and one more attach is sent', async () => {
  const r = rig()
  // Main believes the engine is on A (as after the switch A, B, A); the engine is live on B.
  r.attached = LOG_A
  r.engineLog = LOG_B
  r.engineStatus = 'live'
  await r.turn(LOG_A)
  assert.deepEqual(r.attaches.map((a) => a.logPath), [LOG_A], 'the one more attach, for the turn-s own log')
  assert.deepEqual(r.liveOn, [LOG_A], 'live was recorded once, on A, after the engine was put on A')
  assert.ok(r.saw.every((health) => health.mark?.log === LOG_A), 'no answer about B reached the host')
  assert.deepEqual(r.errors, [])
  assert.equal(r.attached, LOG_A)
})

test('an answer about another log ends the wait before the engine has read that log to the end', async () => {
  const r = rig()
  r.attached = LOG_A
  r.engineLog = LOG_B
  r.engineStatus = 'folding'
  await r.turn(LOG_A)
  assert.equal(r.healthAsks, 2, 'one answer about B, one about A after the attach')
  assert.deepEqual(r.attaches.map((a) => a.logPath), [LOG_A])
  assert.deepEqual(r.liveOn, [LOG_A])
  assert.deepEqual(r.failed, [], 'B being read is not this log-s read ending')
})

test('A SECOND DIFFERENCE RECORDS THE ERROR AND SENDS NOTHING MORE', async () => {
  const r = rig()
  r.attached = LOG_A
  const onB = { status: 'live', epoch: 9, mark: { log: LOG_B, offset: 77 } }
  // Whatever main sends, the engine keeps answering about B. Scripted far past the cap.
  for (let i = 0; i < 20; i += 1) r.healthScripts.push(onB)
  await r.turn(LOG_A)
  assert.equal(r.attaches.length, 1, 'exactly one more attach in the turn')
  assert.equal(r.healthAsks, 2, 'the turn stopped asking at the second difference')
  assert.deepEqual(r.errors, [{ detail: ELSEWHERE_DETAIL, code: ELSEWHERE_CODE }])
  assert.equal(ELSEWHERE_DETAIL, 'the engine is reading another log')
  assert.deepEqual(r.liveOn, [], 'live on another log is never recorded')
  assert.deepEqual(r.saw, [])
  assert.equal(r.attached, null, 'so the next turn or Try again sends an attach')
})

// ---- 3. an attach nobody answered ------------------------------------------------------------------

test('AN ATTACH THAT TIMED OUT, THEN A FOLDING MARK FOR THIS LOG: adopted, the bar is told, no error', async () => {
  const r = rig()
  r.attachScripts.push({ fail: timedOut('session.attach'), taken: true })
  r.healthScripts.push({ status: 'folding', epoch: 1, events: 5, mark: { log: LOG_A, offset: 512 } })
  await r.turn(LOG_A)
  assert.equal(r.attaches.length, 1, 'an attach the engine took is not sent again')
  assert.equal(r.attached, LOG_A)
  assert.deepEqual(r.order, ['defines', 'stateDir', 'attaching', `attach ${LOG_A}`, 'folding', 'taken'])
  assert.deepEqual(r.errors, [], 'a slow attach is not a refusal')
  assert.equal(r.saw[0]?.status, 'folding')
  assert.deepEqual(r.liveOn, [LOG_A])
})

test('adopted on attaching and on live too, and on a read that ended at once', async () => {
  for (const status of ['starting', 'attaching', 'live']) {
    const r = rig()
    r.attachScripts.push({ fail: timedOut('session.attach'), taken: true })
    r.healthScripts.push({ status, epoch: 1, mark: { log: LOG_A, offset: 0 } })
    await r.turn(LOG_A)
    assert.equal(r.attached, LOG_A, status)
    assert.ok(r.order.includes('folding') && r.order.includes('taken'), status)
    assert.deepEqual(r.errors, [], status)
  }
  // The engine took it and its read ended: that is `ended`, with the attach on record as sent.
  const r = rig()
  r.attachScripts.push({ fail: timedOut('session.attach'), taken: true })
  r.healthScripts.push({ status: 'idle', epoch: 1, mark: { log: LOG_A, offset: 0 } })
  await r.turn(LOG_A)
  assert.deepEqual(r.failed, [['ended', 'the engine reports idle after an accepted attach']])
  assert.equal(r.attaches.length, 1)
  assert.deepEqual(r.errors, [])
})

test('A TIMEOUT FOLLOWED BY IDLE WITH NO MARK RE-SENDS TWICE, 2 s AND 5 S APART, then records the error', async () => {
  const r = rig()
  // An engine that never takes the attach and never answers it. Scripted far past the cap.
  for (let i = 0; i < 20; i += 1) r.attachScripts.push({ fail: timedOut('session.attach'), taken: false })
  await r.turn(LOG_A)
  assert.equal(r.attaches.length, 3, 'the first send and two re-sends, never a fourth')
  assert.deepEqual(r.rests, [2_000, 5_000])
  assert.deepEqual(ATTACH_RESEND_PAUSES_MS, [2_000, 5_000])
  assert.deepEqual(r.errors, [
    { detail: 'timeout: the engine did not answer session.attach in time', code: 'timeout' }
  ])
  assert.deepEqual(r.failed, [], 'an idle engine that never took the attach has no read that ended')
  assert.deepEqual(r.saw, [], 'and its answers are not about this log')
  assert.equal(r.attached, null)
  assert.ok(!r.order.includes('taken') && !r.order.includes('folding'))
})

test('a re-send the engine takes ends the matter: no error, one read', async () => {
  const r = rig()
  r.attachScripts.push({ fail: timedOut('session.attach'), taken: false })
  await r.turn(LOG_A)
  assert.equal(r.attaches.length, 2)
  assert.deepEqual(r.rests, [2_000])
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.liveOn, [LOG_A])
})

test('an engine busy on another log did not take the attach either', async () => {
  const r = rig()
  r.engineLog = LOG_B
  r.engineStatus = 'folding'
  r.attachScripts.push({ fail: timedOut('session.attach'), taken: false })
  await r.turn(LOG_A)
  assert.deepEqual(r.attaches.map((a) => a.logPath), [LOG_A, LOG_A])
  assert.deepEqual(r.liveOn, [LOG_A])
  assert.deepEqual(r.errors, [])
})

test('AN ATTACH REJECTED BY A LOST LINK RECORDS NO ERROR and is not sent again by this turn', async () => {
  const r = rig()
  // `unavailable` with no request id is the client speaking: the connection went away.
  r.attachScripts.push({ fail: new EngineError('unavailable', 'the connection was lost'), taken: false })
  await r.turn(LOG_A)
  assert.deepEqual(r.errors, [])
  assert.equal(r.attached, null, 'the reconnect-s own turn sends it')
  assert.equal(r.attaches.length, 1)
  assert.equal(r.healthAsks, 0)
})

test('A badParams REFUSAL RECORDS ONE ERROR AND STOPS', async () => {
  const r = rig()
  r.attachScripts.push({ fail: new EngineError('badParams', 'logPath is not a string', 3), taken: false })
  await r.turn(LOG_A)
  assert.deepEqual(r.errors, [{ detail: 'badParams: logPath is not a string', code: 'badParams' }])
  assert.equal(r.attaches.length, 1)
  assert.equal(r.healthAsks, 0, 'a refused attach has no read to wait for')
  assert.deepEqual(r.rests, [])
})

test('a refusal that is not an engine error is recorded with no code', async () => {
  const r = rig()
  r.attachScripts.push({ fail: new Error('socket hang up'), taken: false })
  await r.turn(LOG_A)
  assert.deepEqual(r.errors, [{ detail: 'socket hang up', code: null }])
})

test('a turn replaced while its attach was unanswered says nothing and records nothing', async () => {
  const r = rig()
  const reply = held<AttachAnswer>()
  r.attachScripts.push({ reply })
  const first = r.turn(LOG_A)
  await settle()
  // The world is replaced, then the old attach is rejected.
  const second = r.turn(LOG_B)
  reply.reject(timedOut('session.attach'))
  await Promise.all([first, second])
  assert.deepEqual(r.errors, [])
  assert.equal(r.attached, LOG_B)
  assert.deepEqual(r.liveOn, [LOG_B])
})
