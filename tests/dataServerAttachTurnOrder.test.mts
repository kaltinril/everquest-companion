// THE SWITCH A, B, A WHILE B'S ATTACH IS ON THE WIRE (fork #9, audit row 12b), in both orders its
// reply can arrive in: `src/main/dataServer/attachTurn.ts`.
//
// WHAT WENT WRONG. B's attach had been sent when the turn went back to A. Its reply found a stale
// turn and was dropped without recording that the engine was now on B. Main went on believing A,
// compared A with A, sent no attach, heard the engine say live (on B), and served character B's
// fights, loot and timers under character A's name. Nothing on screen said so.
//
// TWO RULES CLOSE IT, and each order below needs a different one:
//   * what the engine was told is recorded even when the turn is stale (the reply arrives before
//     the new turn decides);
//   * a health answer is taken as this turn's only when its mark names this turn's log (the reply
//     arrives after the new turn decided, or never).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { FoldHealth } from '../src/main/dataServer/foldWait'
import { LOG_A, LOG_B, held, rig, settle, type AttachAnswer } from './dataServerAttachTurnRig.mts'

test('A, B, A WITH B-S REPLY ARRIVING AFTER TURN A2 DECIDED: a second attach for A, and live is never recorded on B', async () => {
  const r = rig()
  await r.turn(LOG_A)
  assert.deepEqual(r.liveOn, [LOG_A])

  // The pick of B: its attach is on the wire, the reply is not back yet.
  const replyB = held<AttachAnswer>()
  r.attachScripts.push({ reply: replyB })
  const turnB = r.turn(LOG_B)
  await settle()
  assert.equal(r.engineLog, LOG_B, 'the engine took B')
  assert.equal(r.attached, LOG_A, 'main has not heard so yet')

  // Back to A. Main believes A, so this turn sends no attach and waits. Its first health answer
  // is held until B's reply has come in late.
  const firstHealth = held<FoldHealth>()
  r.healthScripts.push(firstHealth)
  const turnA2 = r.turn(LOG_A)
  await settle()
  assert.deepEqual(r.attaches.map((a) => a.logPath), [LOG_A, LOG_B], 'A2 compared A with A and sent nothing')

  replyB.resolve({ epoch: 2, accepted: true })
  await settle()
  // The engine has read B to the end and says so.
  firstHealth.resolve({ status: 'live', epoch: 2, mark: { log: LOG_B, offset: 9_000 } })
  await Promise.all([turnB, turnA2])

  assert.deepEqual(r.attaches.map((a) => a.logPath), [LOG_A, LOG_B, LOG_A], 'the second attach for A')
  assert.deepEqual(r.liveOn, [LOG_A, LOG_A], 'live was never recorded on B')
  assert.ok(r.saw.every((health) => health.mark?.log !== LOG_B), 'no answer about B reached the host')
  assert.equal(r.attached, LOG_A)
  assert.equal(r.engineLog, LOG_A)
  assert.deepEqual(r.errors, [])
})

test('THE SAME WITH B-S REPLY ARRIVING BEFORE ANY OF A2-S DEFINE REPLIES: it also ends on A', async () => {
  const r = rig()
  await r.turn(LOG_A)

  const replyB = held<AttachAnswer>()
  r.attachScripts.push({ reply: replyB })
  const turnB = r.turn(LOG_B)
  await settle()

  // Back to A, with the define round trips still out.
  const defines = held<undefined>()
  r.definesGate = defines
  const turnA2 = r.turn(LOG_A)
  await settle()

  // B's reply lands on a stale turn. It is recorded all the same.
  replyB.resolve({ epoch: 2, accepted: true })
  await settle()
  assert.equal(r.attached, LOG_B, 'what the engine was told is on record, stale turn or not')
  assert.ok(!r.notes.some((line) => line.includes(`engine attached: ${LOG_B}`)), 'a stale turn says nothing')

  defines.resolve(undefined)
  await Promise.all([turnB, turnA2])

  assert.deepEqual(r.attaches.map((a) => a.logPath), [LOG_A, LOG_B, LOG_A], 'A2 saw B and attached A')
  assert.deepEqual(r.liveOn, [LOG_A, LOG_A])
  assert.equal(r.attached, LOG_A)
  assert.equal(r.engineLog, LOG_A)
  assert.deepEqual(r.errors, [])
  // The stale turn did not claim the bar for B: only the two attaches for A did. The archive is
  // told of every attach the engine accepted, B's included: that is true whoever is asking.
  assert.equal(r.order.filter((step) => step === 'folding').length, 2)
  assert.equal(r.order.filter((step) => step === 'taken').length, 3)
})

test('B-S REPLY NEVER ARRIVING AT ALL is closed by the mark alone', async () => {
  const r = rig()
  await r.turn(LOG_A)
  r.attachScripts.push({ reply: held<AttachAnswer>() })
  void r.turn(LOG_B)
  await settle()
  await r.turn(LOG_A)
  assert.deepEqual(r.attaches.map((a) => a.logPath), [LOG_A, LOG_B, LOG_A])
  assert.deepEqual(r.liveOn, [LOG_A, LOG_A])
  assert.equal(r.attached, LOG_A)
})

test('A REBUILD OF THE SAME LOG WHILE ITS ATTACH IS OUT: no second attach, and the bar is still told, once', async () => {
  // The ordinary launch can do this: the engine becomes ready and is attached, and the app's own
  // world lands on the same log before the reply is back. The old code dropped the reply, sent a
  // second attach and read the log twice. Now the first attach stands, so somebody has to tell
  // the catch-up bar and the archive that a fold began: the new turn sends nothing.
  const r = rig()
  const reply = held<AttachAnswer>()
  r.attachScripts.push({ reply })
  const first = r.turn(LOG_A)
  await settle()
  const defines = held<undefined>()
  r.definesGate = defines
  const second = r.turn(LOG_A)
  await settle()
  reply.resolve({ epoch: 1, accepted: true })
  await settle()
  assert.equal(r.order.filter((step) => step === 'folding').length, 1, 'the bar was never told the fold began')
  defines.resolve(undefined)
  await Promise.all([first, second])
  assert.equal(r.attaches.length, 1, 'the log is read once')
  assert.equal(r.order.filter((step) => step === 'folding').length, 1)
  assert.equal(r.order.filter((step) => step === 'taken').length, 1)
  assert.deepEqual(r.liveOn, [LOG_A])
})

test('a replaced turn-s attach for a log the app has left tells the archive and not the bar', async () => {
  const r = rig()
  const reply = held<AttachAnswer>()
  r.attachScripts.push({ reply })
  const first = r.turn(LOG_A)
  await settle()
  const defines = held<undefined>()
  r.definesGate = defines
  const second = r.turn(LOG_B)
  await settle()
  reply.resolve({ epoch: 1, accepted: true })
  await settle()
  assert.deepEqual(r.order.filter((step) => step === 'folding' || step === 'taken'), ['taken'])
  defines.resolve(undefined)
  await Promise.all([first, second])
  assert.deepEqual(r.attaches.map((a) => a.logPath), [LOG_A, LOG_B])
  assert.deepEqual(r.order.filter((step) => step === 'folding' || step === 'taken'), ['taken', 'folding', 'taken'])
})

test('a stale reply that lost to a later attach records nothing: the winner-s own reply does', async () => {
  const r = rig()
  const replyA = held<AttachAnswer>()
  r.attachScripts.push({ reply: replyA })
  const turnA = r.turn(LOG_A)
  await settle()
  const turnB = r.turn(LOG_B)
  await settle()
  assert.equal(r.attached, LOG_B)
  // A's attach was preempted by B's before it began.
  replyA.resolve({ epoch: 2, accepted: false })
  await Promise.all([turnA, turnB])
  assert.equal(r.attached, LOG_B, 'a lost attach must not make main believe A')
  assert.deepEqual(r.liveOn, [LOG_B])
})
