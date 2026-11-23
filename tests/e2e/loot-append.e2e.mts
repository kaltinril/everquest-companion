/**
 * loot-append.e2e.mts: A PICKUP CROSSES AS THE ROWS A WINDOW LACKS, AND THE WINDOW STILL EQUALS A
 * FULL READ (docs/community/plans/2026-11-21-loot-append-frames.md, step 1).
 *
 * `tests/lootFrame.test.mts` and `lootFrameWalk.test.mts` run both halves over a fake wire. What
 * only the real app can show is the path around them: chokidar, the engine, main's merge, the real
 * IPC channel, the store in the main window and the hook in the XP overlay.
 *
 * THREE INSTRUMENTS, none of them in the product:
 *   1. WHAT THE WINDOW HOLDS. The array itself, read out of React's fibers in that window: the
 *      `useModule('loot')` state in main, the `useOverlayModule('loot')` state in the overlay. The
 *      table on screen is windowed and the overlay draws only totals, so neither could prove a row
 *      was not duplicated.
 *   2. WHAT CROSSED THE WIRE. `module:getLootFrame` is wrapped in main to record each reply, by
 *      window. That is what says "one row", rather than "the right rows, resent whole".
 *   3. THE ORACLE. `module:getSnapshot('loot')` is the whole-ledger read the frames replaced. It
 *      still exists and shares none of the frame code.
 *
 * RULES, NEVER COUNTS. Nothing here names how many rows the fixture holds. The token items are this
 * spec's own, so "each written once, in the order written" is a statement about them alone.
 *
 * THE WORLD CHANGE IS THE ARCHIVE SWITCH (`setLogArchiveEnabled`): a real control that sends the
 * world-changed frame with nothing killed. Each launch has its own throwaway userData.
 *
 * Run: `npm run test:e2e -- loot-append`.
 */
import { closeSync, fsyncSync, openSync, utimesSync, writeSync } from 'node:fs'
import type { ElectronApplication, Page } from 'playwright-core'
import { buildIfStale, check, dumpArtifacts, failures, note, reportRun, settle, sleep } from './appHarness.mjs'
import { mainWindow, overlayWindow } from './appWindow.mjs'
import { launchOnFixture, stageFixture, stamp } from './logFixture.mjs'

const FIXTURE = 'e2e-deep-link.log'
const OTHER = 'Alterna'
const LOOT_ROW = '[data-testid="loot-row"]'
const ITEM_NAME = '[data-testid="loot-item-name"]'
const GROUP_SWITCH = '[data-testid="loot-group"] input'
const LOOT_SORT = '[data-testid="loot-sort"]'
const WAIT_MS = 45_000
/** A burst is this many writes of this many rows. */
const BURST_WRITES = 6
const BURST_PER_WRITE = 5
/** Longer than the engine's 10 Hz cursor beat, so a paced burst is answered by several reads. */
const PACED_GAP_MS = 180

type Who = 'Primitive' | typeof OTHER

interface LootRow {
  ts: number
  item: string
}

interface WireFrame {
  who: string
  known: { gen: number; length: number } | null
  none: boolean
  gen: number
  from: number
  items: string[]
}

interface Held {
  copies: number
  same: boolean
  rows: LootRow[] | null
}

interface Win {
  name: 'main' | 'xp'
  page: Page
  bridge: 'eq' | 'eqOverlay'
}

interface Rig {
  app: ElectronApplication
  main: Page
  windows: Win[]
  logs: Record<Who, string>
  written: Record<Who, string[]>
  active: Who
}

let tokens = 0
const token = (): string => `Append Frame Token ${String(++tokens).padStart(3, '0')}`
const looted = (item: string): string => `--You have looted a ${item} from a decaying skeleton corpse.--`

/** Whole lines into a log, fsynced as the fixture's own driver does, for either character. */
function writeLines(path: string, messages: readonly string[]): void {
  const prefix = stamp(new Date())
  const fd = openSync(path, 'a')
  try {
    writeSync(fd, `${messages.map((m) => `${prefix} ${m}`).join('\n')}\n`, null, 'utf8')
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

function pick(rig: Rig, who: Who, items: readonly string[]): void {
  writeLines(rig.logs[who], items.map(looted))
  rig.written[who].push(...items)
}

/** The parts of React's fiber tree `heldIn` walks. */
interface Hook {
  memoizedState: unknown
  queue: unknown
  next: Hook | null
}

interface Fiber {
  tag: number
  child: Fiber | null
  sibling: Fiber | null
  memoizedState: unknown
  stateNode: { current: Fiber }
}

/**
 * The array this window's React state holds. No named bindings in the callback: tsx's keepNames
 * wraps them in a helper that exists only in the Node bundle (settle.mts records the trap).
 */
function heldIn(win: Win): Promise<Held> {
  // eslint-disable-next-line complexity -- one callback by necessity: Playwright ships only its source to the page, so it cannot call a helper
  return win.page.evaluate((overlay) => {
    const hosts = [...document.querySelectorAll('body > div')] as unknown as Record<string, Fiber>[]
    const host = hosts.find((h) => Object.keys(h).some((k) => k.startsWith('__reactContainer$')))
    if (!host) return { copies: 0, same: false, rows: null }
    const key = Object.keys(host).find((k) => k.startsWith('__reactContainer$')) as string
    const found: unknown[] = []
    const stack: Fiber[] = [host[key].stateNode.current]
    while (stack.length > 0) {
      const f = stack.pop() as Fiber
      if (f.sibling) stack.push(f.sibling)
      if (f.child) stack.push(f.child)
      if (f.tag !== 0 && f.tag !== 11 && f.tag !== 15) continue
      for (let h = f.memoizedState as Hook | null; h && typeof h === 'object' && 'next' in h; h = h.next) {
        const v = h.memoizedState as { id?: unknown; snap?: unknown; 0?: { ts?: unknown; item?: unknown } } | null
        if (!h.queue || !v || typeof v !== 'object') continue
        if (!overlay && v.id === 'loot' && 'snap' in v) found.push(v.snap)
        if (overlay && Array.isArray(v) && typeof v[0]?.ts === 'number' && typeof v[0]?.item === 'string') found.push(v)
      }
    }
    return { copies: found.length, same: found.every((x) => x === found[0]), rows: (found[0] ?? null) as LootRow[] | null }
  }, win.name === 'xp')
}

/** The oracle: the whole ledger, by the channel the frames did not replace. */
function fullRead(win: Win): Promise<LootRow[] | null> {
  return win.page.evaluate(async (b) => {
    const api = (window as unknown as Record<string, { getModuleSnapshot: (id: string) => Promise<{ state?: unknown } | null> }>)[b]
    const snap = await api.getModuleSnapshot('loot')
    return Array.isArray(snap?.state) ? (snap.state as LootRow[]) : null
  }, win.bridge)
}

/** Wrap the frame channel in main, so each reply is recorded with the window it went to. */
function installWire(app: ElectronApplication): Promise<boolean> {
  return app.evaluate(({ ipcMain }) => {
    const channel = 'module:getLootFrame'
    const table = (ipcMain as unknown as { _invokeHandlers?: Map<string, (e: unknown, k: unknown) => unknown> })._invokeHandlers
    const real = table?.get(channel)
    if (!real) return false
    const log: unknown[] = []
    ;(globalThis as unknown as { __lootWire: unknown[] }).__lootWire = log
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (e, known: unknown) => {
      const reply = (await real(e, known)) as { gen?: number; from?: number; rows?: { item: string }[] } | null
      log.push({
        who: new URL(e.sender.getURL()).searchParams.get('kind') ?? 'main',
        known: known ?? null,
        none: reply === null,
        gen: reply?.gen ?? -1,
        from: reply?.from ?? -1,
        items: (reply?.rows ?? []).map((r) => r.item)
      })
      return reply
    })
    return true
  })
}

function wire(app: ElectronApplication): Promise<WireFrame[]> {
  return app.evaluate(() => (globalThis as unknown as { __lootWire: WireFrame[] }).__lootWire.slice())
}

/** Count world-changed frames as this window hears them. */
function hearWorld(win: Win): Promise<void> {
  return win.page.evaluate((b) => {
    const g = window as unknown as Record<string, unknown> & { __worldHeard?: number }
    g.__worldHeard = 0
    ;(g[b] as { onModuleChanged: (cb: (c: { moduleId: string }) => void) => void }).onModuleChanged((c) => {
      if (c.moduleId === '*') g.__worldHeard = (g.__worldHeard ?? 0) + 1
    })
  }, win.bridge)
}

const worldHeard = (win: Win): Promise<number> =>
  win.page.evaluate(() => (window as unknown as { __worldHeard?: number }).__worldHeard ?? 0)

const items = (rows: readonly LootRow[] | null): string[] => (rows ?? []).map((r) => r.item)

/** The rows of `want`'s names, as they sit in the ledger, equal `want` exactly: none lost, doubled or moved. */
function inOrder(rows: readonly LootRow[] | null, want: readonly string[]): boolean {
  const names = new Set(want)
  return JSON.stringify(items(rows).filter((n) => names.has(n))) === JSON.stringify(want)
}

interface Agreement {
  ok: boolean
  held: Held
  full: LootRow[] | null
}

async function agreement(win: Win): Promise<Agreement> {
  const [held, full] = await Promise.all([heldIn(win), fullRead(win)])
  const ok = full !== null && held.copies > 0 && held.same && JSON.stringify(held.rows) === JSON.stringify(full)
  return { ok, held, full }
}

/** THE LAW, after each step, in each window: it equals a full read, and holds this character's pickups. */
async function lawHolds(rig: Rig, tag: string): Promise<void> {
  const mine = rig.written[rig.active]
  const foreign = rig.written[rig.active === OTHER ? 'Primitive' : OTHER].filter((n) => !mine.includes(n))
  for (const win of rig.windows) {
    const a = await settle(
      () => agreement(win),
      (x) => x.ok && inOrder(x.full, mine) && !items(x.full).some((n) => foreign.includes(n)),
      { timeoutMs: WAIT_MS }
    )
    const size = `${String(a.held.rows?.length ?? -1)} held, ${String(a.full?.length ?? -1)} in a full read, ${String(a.held.copies)} reader(s)`
    check(`${tag}: the ${win.name} window equals a full read`, a.ok, size)
    check(`${tag}: …with each of ${rig.active}'s pickups once, in the order written`, inOrder(a.held.rows, mine))
    check(`${tag}: …and none of the other character's`, !items(a.held.rows).some((n) => foreign.includes(n)))
  }
}

/** What crossed to each window since `mark`: exactly `sent`, as an append, whole ledger never. */
async function crossed(rig: Rig, tag: string, mark: number, sent: readonly string[]): Promise<void> {
  const frames = (await wire(rig.app)).slice(mark)
  for (const win of rig.windows) {
    const mine = frames.filter((f) => f.who === win.name)
    const carried = mine.flatMap((f) => f.items)
    check(`${tag}: ${win.name} was sent exactly the new row(s)`, JSON.stringify(carried) === JSON.stringify(sent), `${String(carried.length)} row(s) over ${String(mine.length)} repl(ies), ${String(sent.length)} written`)
    check(`${tag}: …as an append to what it held, never the whole ledger`, mine.length > 0 && mine.every((f) => !f.none && f.known !== null && f.from === f.known.length && f.from > 0), JSON.stringify(mine.map((f) => [f.known?.length, f.from, f.items.length])))
  }
}

/** The first reply a window gets after the world moved: asked with no mark, answered from row 0. */
async function restarted(rig: Rig, tag: string, mark: number): Promise<void> {
  for (const win of rig.windows) {
    // An unchanged ledger already equals a full read, so the law can pass before this reply lands.
    const all = await settle(() => wire(rig.app), (w) => w.slice(mark).some((f) => f.who === win.name && !f.none), { timeoutMs: WAIT_MS })
    const first = all.slice(mark).find((f) => f.who === win.name && !f.none)
    check(`${tag}: ${win.name} asked again with no mark and got the ledger from row 0`, first?.known === null && first.from === 0, JSON.stringify(first ? { known: first.known, from: first.from, rows: first.items.length } : null))
  }
}

/** The log stamps whole seconds, so a row that must draw on top is written in a second of its own. */
const nextSecond = (): Promise<void> => sleep(1_100)

/** The table on screen: the newest pickup is its top row, and no token is drawn twice. */
async function drawn(rig: Rig, tag: string, newest: string): Promise<void> {
  const read = (): Promise<string[]> =>
    rig.main.evaluate((a) => [...document.querySelectorAll(a.row)].map((r) => r.querySelector(a.name)?.textContent?.trim() ?? ''), { row: LOOT_ROW, name: ITEM_NAME })
  const names = await settle(read, (n) => n[0] === newest, { timeoutMs: WAIT_MS })
  check(`${tag}: the ledger on screen shows it as the top row`, names[0] === newest, names.slice(0, 3).join(' | '))
  const tokensShown = names.filter((n) => n.startsWith('Append Frame Token'))
  check(`${tag}: …and draws no token twice`, new Set(tokensShown).size === tokensShown.length, `${String(tokensShown.length)} token rows mounted`)
}

async function stepOnePickup(rig: Rig): Promise<void> {
  const mark = (await wire(rig.app)).length
  const mote = 'Mote of Infinitesimal Potential'
  await nextSecond()
  pick(rig, 'Primitive', [mote])
  await lawHolds(rig, 'one pickup')
  await crossed(rig, 'one pickup', mark, [mote])
  await drawn(rig, 'one pickup', mote)
  const xp = rig.windows[1].page
  const row = await settle(
    () => xp.evaluate(() => [...document.querySelectorAll('[data-row="motes"]')].map((e) => e.getAttribute('data-testid') ?? '')),
    (r) => r.some((id) => id !== 'xp-row-motes-none'),
    { timeoutMs: WAIT_MS }
  )
  check('one pickup: the XP overlay draws it as a mote row', row.some((id) => id !== 'xp-row-motes-none'), row.join(', '))
}

async function stepSinglesInARow(rig: Rig): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    const mark = (await wire(rig.app)).length
    const item = token()
    await nextSecond()
    pick(rig, 'Primitive', [item])
    await lawHolds(rig, `single ${String(i + 1)}`)
    await crossed(rig, `single ${String(i + 1)}`, mark, [item])
    await drawn(rig, `single ${String(i + 1)}`, item)
  }
}

/** Two real, identical drops in one second are two rows. An append must not fold them into one. */
async function stepIdenticalTwins(rig: Rig): Promise<void> {
  const mark = (await wire(rig.app)).length
  const twin = token()
  pick(rig, 'Primitive', [twin, twin])
  await lawHolds(rig, 'identical twins')
  await crossed(rig, 'identical twins', mark, [twin, twin])
}

/** Tight (`gapMs` 0) tends to share one read. Paced, reads overlap the writes, which is the race. */
async function stepBurst(rig: Rig, tag: string, gapMs: number): Promise<void> {
  const mark = (await wire(rig.app)).length
  const all: string[] = []
  for (let w = 0; w < BURST_WRITES; w += 1) {
    const batch = Array.from({ length: BURST_PER_WRITE }, token)
    all.push(...batch)
    pick(rig, 'Primitive', batch)
    if (gapMs > 0) await sleep(gapMs)
  }
  await lawHolds(rig, tag)
  await crossed(rig, tag, mark, all)
  if (gapMs === 0) return
  const frames = (await wire(rig.app)).slice(mark)
  for (const win of rig.windows) {
    const carrying = frames.filter((f) => f.who === win.name && f.items.length > 0).length
    if (carrying < 2) note(`${tag}: the ${win.name} window took it in one read, so no read overlapped a write this run`)
  }
}

async function setCharacter(rig: Rig, who: Who): Promise<void> {
  await rig.main.evaluate((p) => (window as unknown as { eq: { setCharacter: (x: string) => Promise<unknown> } }).eq.setCharacter(p), rig.logs[who])
  rig.active = who
}

async function stepCharacterSwitch(rig: Rig): Promise<void> {
  // Written while it is not the tailed log, so it can only arrive through the switch's own read.
  pick(rig, OTHER, [token()])
  let mark = (await wire(rig.app)).length
  await setCharacter(rig, OTHER)
  await lawHolds(rig, 'switch to the other character')
  await restarted(rig, 'switch to the other character', mark)

  mark = (await wire(rig.app)).length
  const there = token()
  await nextSecond()
  pick(rig, OTHER, [there])
  await lawHolds(rig, 'a pickup on the other character')
  await crossed(rig, 'a pickup on the other character', mark, [there])
  await drawn(rig, 'a pickup on the other character', there)

  // While away: a line the first character's log gained, which only the way back can bring in.
  pick(rig, 'Primitive', [token()])
  mark = (await wire(rig.app)).length
  await setCharacter(rig, 'Primitive')
  await lawHolds(rig, 'switch back')
  await restarted(rig, 'switch back', mark)

  mark = (await wire(rig.app)).length
  const back = token()
  pick(rig, 'Primitive', [back])
  await lawHolds(rig, 'a pickup after switching back')
  await crossed(rig, 'a pickup after switching back', mark, [back])
}

async function stepWorldChange(rig: Rig): Promise<void> {
  const before = await Promise.all(rig.windows.map(worldHeard))
  const mark = (await wire(rig.app)).length
  await rig.main.evaluate(() => (window as unknown as { eq: { setLogArchiveEnabled: (on: boolean) => Promise<unknown> } }).eq.setLogArchiveEnabled(true))
  for (const [i, win] of rig.windows.entries()) {
    const heard = await settle(() => worldHeard(win), (n) => n > before[i], { timeoutMs: WAIT_MS })
    check(`world change: the ${win.name} window heard it`, heard > before[i], `${String(before[i])} -> ${String(heard)}`)
  }
  await lawHolds(rig, 'world change')
  await restarted(rig, 'world change', mark)

  const next = (await wire(rig.app)).length
  const item = token()
  pick(rig, 'Primitive', [item])
  await lawHolds(rig, 'a pickup after the world change')
  await crossed(rig, 'a pickup after the world change', next, [item])
  await rig.main.evaluate(() => (window as unknown as { eq: { setLogArchiveEnabled: (on: boolean) => Promise<unknown> } }).eq.setLogArchiveEnabled(false))
}

/** Open the XP overlay and the flat ledger, and start recording once both hold the ledger. */
async function ready(rig: Rig): Promise<boolean> {
  await rig.main.waitForSelector('[data-testid="overview-grid"]', { timeout: 60_000 })
  await rig.main.evaluate(() => (window as unknown as { eq: { toggleOverlay: (k: string) => Promise<boolean> } }).eq.toggleOverlay('xp'))
  const xp = await overlayWindow(rig.app, 'xp')
  if (!check('the XP overlay opens', xp !== null) || xp === null) return false
  rig.windows.push({ name: 'xp', page: xp, bridge: 'eqOverlay' })
  await rig.main.click('[data-testid="nav-loot"]', { timeout: 15_000 })
  await rig.main.waitForSelector('[data-testid="loot-list"]', { timeout: 20_000 })
  await rig.main.click(GROUP_SWITCH, { timeout: 15_000 })
  const flat = await settle(() => rig.main.evaluate((s) => document.querySelectorAll(s).length, LOOT_SORT), (n) => n === 0, { timeoutMs: 10_000 })
  check('the Loot tab is on the flat ledger', flat === 0)
  await lawHolds(rig, 'at rest')
  for (const win of rig.windows) await hearWorld(win)
  return check('the frame channel is being recorded', await installWire(rig.app))
}

async function main(): Promise<void> {
  buildIfStale()
  const log = stageFixture(FIXTURE, { others: { [OTHER]: FIXTURE } })
  // The other character's own row, in its log before launch, so the two ledgers differ from the start.
  const theirs = token()
  writeLines(log.others[OTHER], [looted(theirs)])
  // The app opens on the log written last, and this spec starts on the first character. Two writes
  // in a row can share a file-time tick, so the other log is dated a minute back.
  const earlier = new Date(Date.now() - 60_000)
  utimesSync(log.others[OTHER], earlier, earlier)
  log.append("You say, 'ready'")
  const { app, close } = await launchOnFixture(log, { env: { NODE_USE_ENV_PROXY: '1', HTTPS_PROXY: 'http://127.0.0.1:9' } })
  const page = await mainWindow(app)
  const errors: string[] = []
  const listen = (p: Page, name: string): void => {
    p.on('pageerror', (e) => errors.push(`${name}: ${String(e)}`))
    p.on('console', (m) => {
      if (m.type() === 'error') errors.push(`${name}: ${m.text()}`)
    })
  }
  listen(page, 'main')
  const rig: Rig = {
    app,
    main: page,
    windows: [{ name: 'main', page, bridge: 'eq' }],
    logs: { Primitive: log.logPath, [OTHER]: log.others[OTHER] },
    written: { Primitive: [], [OTHER]: [theirs] },
    active: 'Primitive'
  }
  try {
    if (await ready(rig)) {
      listen(rig.windows[1].page, 'xp')
      await stepOnePickup(rig)
      await stepSinglesInARow(rig)
      await stepIdenticalTwins(rig)
      await stepBurst(rig, 'burst', 0)
      await stepBurst(rig, 'paced burst', PACED_GAP_MS)
      await stepCharacterSwitch(rig)
      await stepWorldChange(rig)
      await lawHolds(rig, 'after all of it')
    }
    check('no page or console error in either window', errors.length === 0, errors.slice(0, 3).join(' | '))
  } catch (err) {
    check('the spec ran to completion', false, String(err))
  } finally {
    if (failures.length > 0) await dumpArtifacts(page, 'loot-append-FAIL')
    await close()
    await log.dispose()
  }
  reportRun()
}

main().catch((err: unknown) => {
  console.error('e2e: harness error:', err)
  process.exitCode = 1
})
