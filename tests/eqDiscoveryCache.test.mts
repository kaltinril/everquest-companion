// EQ INSTALL-DISCOVERY: PERSIST + GUARD (JOS-112).
//
// Onboarding's auto-detection re-ran on every launch and could HANG on certain directory configs
// (a huge Uninstall hive, an offline mapped network drive whose readdir blocks on the SMB timeout).
// The fix is persist-and-guard, and both halves are pure functions over injected dependencies —
// no store, no disk — so this file pins the exact rules config.ts binds to electron-store + the
// real sweep. The end-to-end path is `tests/e2e/eq-folder.e2e.mts`; the sibling `eqDiscovery.test.mts`
// covers the ordered sweep + the manual-override normalization.
//
//   1. resolveDiscoveredRoot — the CROSS-LAUNCH cache: a valid persisted root skips the sweep, a
//      dead one self-heals, and a null "not found" is NEVER remembered.
//   2. discoverEqRoot's wall-clock CEILING — a bounded miss beats an unbounded hang, and the drive
//      filter keeps offline shares out of the candidate list to begin with.
// Run: `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  NO_DISCOVERY,
  SWEEP_AGAIN_MS,
  discoverEqRoot,
  keptRootIsGood,
  recheckDiscoveredRoot,
  resolveDiscoveredRoot,
  type CachedRootDeps,
  type DiscoveryMemo
} from '../src/main/log/discovery'

const lc = (s: string): string => s.replace(/[\\/]+$/, '').toLowerCase()

// --- PERSIST ACROSS LAUNCHES: resolveDiscoveredRoot -------------------------
//
// A positive discovery is remembered so the NEXT launch skips the eight-tree registry read +
// drive walk entirely; a remembered root that no longer holds self-heals; a null is never cached
// (a fresh user who has not run `/log on` keeps getting the cheap idle rescan, not a sticky no).

/** A deps builder with spies: records whether the (expensive) sweep ran and what got persisted. */
function cachedDeps(
  over: Partial<CachedRootDeps> & { sweepResult?: string | null }
): { deps: CachedRootDeps; log: { swept: number; persisted: string[]; dropped: number } } {
  const log = { swept: 0, persisted: [] as string[], dropped: 0 }
  const deps: CachedRootDeps = {
    persisted: over.persisted ?? null,
    hasLogs: over.hasLogs ?? ((): boolean => true),
    sweep:
      over.sweep ??
      ((): string | null => {
        log.swept++
        return over.sweepResult ?? null
      }),
    persist: over.persist ?? ((r): void => void log.persisted.push(r)),
    dropPersisted: over.dropPersisted ?? ((): void => void log.dropped++)
  }
  return { deps, log }
}

test('resolveDiscoveredRoot: a valid persisted root skips the sweep entirely', () => {
  const root = 'D:\\Games\\EverQuest Legends'
  const { deps, log } = cachedDeps({ persisted: root, hasLogs: () => true })
  assert.equal(resolveDiscoveredRoot(deps), root)
  assert.equal(log.swept, 0, 'the expensive sweep must NOT run when the cache is valid')
  assert.equal(log.persisted.length, 0, 'a re-served cache hit is not re-persisted')
  assert.equal(log.dropped, 0)
})

test('resolveDiscoveredRoot: a persisted root that fails revalidation self-heals via the sweep', () => {
  const stale = 'D:\\Games\\EverQuest Legends'
  const fresh = 'E:\\EQ'
  // hasLogs=false ⇒ the readdir revalidation fails (install moved / uninstalled).
  const { deps, log } = cachedDeps({ persisted: stale, hasLogs: () => false, sweepResult: fresh })
  assert.equal(resolveDiscoveredRoot(deps), fresh)
  assert.equal(log.dropped, 1, 'the dead persisted root is dropped')
  assert.equal(log.swept, 1, 'and re-discovered')
  assert.deepEqual(log.persisted, [fresh], 'the fresh positive hit is persisted')
})

test('resolveDiscoveredRoot: no persisted root ⇒ sweep, and a positive hit is persisted', () => {
  const found = 'C:\\Users\\Public\\Daybreak Game Company\\Installed Games\\EverQuest Legends'
  const { deps, log } = cachedDeps({ persisted: null, sweepResult: found })
  assert.equal(resolveDiscoveredRoot(deps), found)
  assert.equal(log.swept, 1)
  assert.deepEqual(log.persisted, [found])
  assert.equal(log.dropped, 0)
})

test('resolveDiscoveredRoot: a NULL (not found) is NEVER persisted', () => {
  // The fresh-user case: nothing found yet ⇒ no sticky negative, so the idle rescan stays cheap.
  const { deps, log } = cachedDeps({ persisted: null, sweepResult: null })
  assert.equal(resolveDiscoveredRoot(deps), null)
  assert.equal(log.swept, 1)
  assert.equal(log.persisted.length, 0, 'a null result must not be cached')
})

// --- GUARD THE SWEEP: the wall-clock ceiling --------------------------------
//
// A slow/offline drive makes a `readdir` block on the SMB timeout for tens of seconds. A
// synchronous probe cannot be aborted mid-flight, so the guarantee is "no FURTHER probes after
// the deadline" — one unavoidable stall, then null (fall back to the manual picker) rather than
// probing the rest of the machine behind it. The injected clock advances deterministically.

test('discoverEqRoot: the ceiling stops probing once the budget is spent, and returns null', () => {
  let clock = 1_000
  const probed: string[] = []
  const root = discoverEqRoot({
    hasLogs: (c): boolean => {
      probed.push(c)
      clock += 40 // each probe "costs" 40 ms of wall clock
      return false
    },
    extraCandidates: () => ['A', 'B', 'C', 'D'],
    fixedDrives: () => [],
    budgetMs: 100,
    now: () => clock
  })
  assert.equal(root, null, 'a bounded miss, not an unbounded hang')
  // deadline = 1000 + 100. Probes at clock 1000, 1040, 1080 run; at 1120 we are over budget.
  assert.deepEqual(probed, ['A', 'B', 'C'], 'the 4th candidate is never probed')
})

test('discoverEqRoot: a candidate found BEFORE the deadline is still returned', () => {
  let clock = 0
  const target = 'D:\\EQ'
  const root = discoverEqRoot({
    hasLogs: (c): boolean => {
      clock += 10
      return c === target
    },
    extraCandidates: () => ['slow', target, 'never'],
    fixedDrives: () => [],
    budgetMs: 100,
    now: () => clock
  })
  assert.equal(root, target, 'the ceiling never denies a hit that lands within budget')
})

test('discoverEqRoot: a single blocking (offline-share) probe caps the whole call', () => {
  // The reported hang, in miniature: the FIRST candidate is an offline mapped drive whose readdir
  // blocks past the entire budget. The real install sits behind it — and must NOT be waited for.
  let clock = 0
  const probed: string[] = []
  const realInstall = 'C:\\Users\\Public\\Daybreak Game Company\\Installed Games\\EverQuest Legends'
  const root = discoverEqRoot({
    hasLogs: (c): boolean => {
      probed.push(c)
      if (c === 'Z:\\offline') {
        clock += 30_000 // the SMB timeout
        return false
      }
      return c === realInstall
    },
    extraCandidates: () => ['Z:\\offline', realInstall],
    fixedDrives: () => [],
    budgetMs: 6_000,
    now: () => clock
  })
  assert.equal(root, null, 'the one blocking probe exhausts the budget; we do not hang on the rest')
  assert.deepEqual(probed, ['Z:\\offline'], 'the real install behind it is never reached')
})

test('discoverEqRoot: a filtered (non-fixed) drive is never probed at all', () => {
  // The OTHER half of the guard: `fixedDrives` skips network/removable drives by TYPE, so an
  // offline share is not even a candidate and the blocking probe above never happens. Here the
  // injected fixedDrives has already removed Z:, so only C: paths are ever asked about.
  const probed: string[] = []
  const target = 'C:\\Users\\Public\\Daybreak Game Company\\Installed Games\\EverQuest Legends'
  const root = discoverEqRoot({
    hasLogs: (c): boolean => {
      probed.push(c)
      return lc(c) === lc(target)
    },
    extraCandidates: () => [],
    fixedDrives: () => ['C:'] // Z: was filtered out by drive type before we got here
  })
  assert.equal(root, target)
  assert.ok(!probed.some((p) => /^z:/i.test(p)), 'no Z: candidate is ever probed')
})

// --- WITHIN ONE RUN: a root that was good is kept across a failed re-check (fork #9) ------------
//
// The in-process memo used to replace a root that failed ONE re-check with whatever the sweep
// found, and a sweep that found nothing was remembered as null for the rest of the run: a drive
// that dropped out for a moment left the app on the default path, with the no-logs screen over a
// working session, until restart. `recheckDiscoveredRoot` is that memo's rule, with its clock and
// probes injected.

/** A run of re-checks over one mutable world: which roots have logs now, and what a sweep finds. */
function run(start: { good: string[]; sweepFinds?: string | null; persisted?: string | null }): {
  world: { good: string[]; sweepFinds: string | null; clock: number }
  /** `looked`: how many times a root's Logs folder was read (one synchronous readdir each). */
  log: { swept: number; persisted: string[]; dropped: number; looked: number }
  memo(): DiscoveryMemo
  check(): string | null
} {
  const world = { good: start.good, sweepFinds: start.sweepFinds ?? null, clock: 1_000_000 }
  const log = { swept: 0, persisted: [] as string[], dropped: 0, looked: 0 }
  let memo: DiscoveryMemo = NO_DISCOVERY
  return {
    world,
    log,
    memo: () => memo,
    check: () => {
      memo = recheckDiscoveredRoot(memo, {
        persisted: start.persisted ?? null,
        hasLogs: (root) => {
          log.looked++
          return world.good.includes(root)
        },
        sweep: () => {
          log.swept++
          return world.sweepFinds
        },
        persist: (root) => void log.persisted.push(root),
        dropPersisted: () => void log.dropped++,
        now: () => world.clock
      })
      return memo.root ?? null
    }
  }
}

const D_ROOT = 'D:\\Games\\EverQuest Legends'
const E_ROOT = 'E:\\EQ'

test('recheckDiscoveredRoot: the first look of a run is the cross-launch cache, then the sweep', () => {
  const cached = run({ good: [D_ROOT], persisted: D_ROOT })
  assert.equal(cached.check(), D_ROOT)
  assert.equal(cached.log.swept, 0)
  const fresh = run({ good: [E_ROOT], sweepFinds: E_ROOT })
  assert.equal(fresh.check(), E_ROOT)
  assert.deepEqual(fresh.log.persisted, [E_ROOT])
  // A good root costs one re-check per cycle and never a sweep.
  fresh.check()
  fresh.check()
  assert.equal(fresh.log.swept, 1)
})

test('recheckDiscoveredRoot: A ROOT THAT FAILS ONE RE-CHECK IS KEPT, and is found again on the next cycle', () => {
  const r = run({ good: [D_ROOT], persisted: D_ROOT })
  assert.equal(r.check(), D_ROOT)
  // The drive drops out: the re-check fails and the sweep finds nothing.
  r.world.good = []
  assert.equal(r.check(), D_ROOT, 'a drive that dropped out for a moment sent the app to the default path')
  assert.equal(r.log.swept, 1, 'the machine is still swept once, in case the install moved')
  assert.equal(r.log.dropped, 0, 'the remembered root was thrown away over one failed look')
  // It comes back: the kept root is the answer on the next cycle, with no sweep.
  r.world.good = [D_ROOT]
  r.world.clock += 5_000
  assert.equal(r.check(), D_ROOT)
  assert.equal(r.log.swept, 1)
})

test('recheckDiscoveredRoot: A ROOT KNOWN BAD IS READ ONCE A MINUTE, not on every 5 s cycle', () => {
  // The install is on a share that went offline: each read of it can block main for the SMB
  // timeout. Before the root was kept it became null and was never read again; kept, it was read
  // on every cycle for the rest of the run.
  const r = run({ good: [D_ROOT], persisted: D_ROOT })
  r.check()
  r.world.good = []
  r.check()
  const after = r.log.looked
  for (let i = 0; i < 11; i += 1) {
    r.world.clock += 5_000
    assert.equal(r.check(), D_ROOT)
  }
  assert.equal(r.log.looked, after, 'a dead root was read again inside the minute')
  assert.equal(r.log.swept, 1)
  // The minute is up: one read, and (still bad) one sweep.
  r.world.clock += 5_000
  assert.equal(r.check(), D_ROOT)
  assert.equal(r.log.looked, after + 1)
  assert.equal(r.log.swept, 2)
  // Back: the next look after the minute clears the mark with one read and no sweep, and a good
  // root is then read every cycle again.
  r.world.good = [D_ROOT]
  r.world.clock += SWEEP_AGAIN_MS
  assert.equal(r.check(), D_ROOT)
  assert.equal(r.memo().sweptAt, null)
  assert.equal(r.log.swept, 2)
  r.world.clock += 5_000
  r.check()
  assert.equal(r.log.looked, after + 3)
})

test('keptRootIsGood: the idle rescan does not read a root this run knows is bad', () => {
  const looked: string[] = []
  const hasLogs = (root: string): boolean => {
    looked.push(root)
    return true
  }
  assert.equal(keptRootIsGood({ root: D_ROOT, sweptAt: null }, hasLogs), true)
  assert.deepEqual(looked, [D_ROOT])
  // Marked bad by a failed re-check: no read, and the rescan goes on to look elsewhere.
  assert.equal(keptRootIsGood({ root: D_ROOT, sweptAt: 1_000_000 }, hasLogs), false)
  assert.deepEqual(looked, [D_ROOT], 'the dead root was read on a rescan tick')
  // Nothing remembered: nothing to read.
  assert.equal(keptRootIsGood(NO_DISCOVERY, hasLogs), false)
  assert.equal(keptRootIsGood({ root: null, sweptAt: null }, hasLogs), false)
  assert.equal(keptRootIsGood({ root: D_ROOT, sweptAt: null }, () => false), false)
  // config.ts cannot be loaded here (electron-store): its rescan is read from source.
  const config = readFileSync(new URL('../src/main/log/config.ts', import.meta.url), 'utf8')
  assert.match(config, /if \(keptRootIsGood\(discovery, rootHasLogs\)\) return/)
  assert.doesNotMatch(config, /rootHasLogs\(discovery\.root\)/)
})

test('recheckDiscoveredRoot: THE SWEEP IS NOT RUN TWICE INSIDE 60 s while the root stays bad', () => {
  const r = run({ good: [D_ROOT], persisted: D_ROOT })
  r.check()
  r.world.good = []
  // The 5 s cycle, for a minute: one sweep, however many re-checks.
  for (let i = 0; i < 12; i += 1) {
    assert.equal(r.check(), D_ROOT)
    r.world.clock += 5_000
  }
  assert.equal(r.log.swept, 1, 'a synchronous sweep with a 6 s ceiling ran on every cycle')
  assert.equal(SWEEP_AGAIN_MS, 60_000)
  // A minute after the last sweep it may look again.
  assert.equal(r.check(), D_ROOT)
  assert.equal(r.log.swept, 2)
  // A root seen good again and then bad is a new failure: the clock starts over.
  r.world.good = [D_ROOT]
  r.world.clock += SWEEP_AGAIN_MS
  r.check()
  r.world.good = []
  r.world.clock += 5_000
  r.check()
  assert.equal(r.log.swept, 3)
})

test('recheckDiscoveredRoot: A SWEEP THAT FINDS A DIFFERENT ROOT REPLACES THE KEPT ONE', () => {
  const r = run({ good: [D_ROOT], persisted: D_ROOT })
  r.check()
  // The install really moved.
  r.world.good = [E_ROOT]
  r.world.sweepFinds = E_ROOT
  assert.equal(r.check(), E_ROOT)
  assert.deepEqual(r.log.persisted, [E_ROOT], 'the new root is what the next launch should skip to')
  r.check()
  assert.equal(r.log.swept, 1)
})

test('recheckDiscoveredRoot: a run that never found a root remembers that, and sweeps once', () => {
  const r = run({ good: [] })
  assert.equal(r.check(), null)
  r.world.clock += 120_000
  assert.equal(r.check(), null)
  assert.equal(r.log.swept, 1, 'the idle rescan is what looks again, not a sweep per cycle')
  assert.equal(r.log.persisted.length, 0)
})
