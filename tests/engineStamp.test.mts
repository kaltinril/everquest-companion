// THE ENGINE BINARY REUSE RULE (scripts/engineStamp.mts): a worktree may copy another checkout's
// engined.exe only when that binary's stamp proves every engine input is byte-identical here. A
// wrong binary would make every e2e spec test code this checkout does not contain, so each way the
// proof can fail must build. Also pins scripts/community/engine-inputs.txt (the gate's list of
// engine inputs) against the include_str! targets actually in engine/.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import {
  decide,
  depInfoInputs,
  donorRoot,
  engineIsFresh,
  inputDigest,
  parseStamp,
  relativeInputs,
  reuseDonorEngine,
  sha256File,
  STAMP_NAME,
  writeEngineStamp,
  type EngineStamp,
  type ReadBytes
} from '../scripts/engineStamp.mts'

// ── the pure decision ─────────────────────────────────────────────────────────────────

const FILES = [
  'engine/Cargo.lock',
  'engine/crates/fold/src/lib.rs',
  'src/main/data/spells.json'
]

/** A checkout as a map of relative path to text, read through the ReadBytes seam. */
function tree(root: string, files: Record<string, string>): ReadBytes {
  return (p) => {
    const rel = relative(root, p).replace(/\\/g, '/')
    return rel in files ? Buffer.from(files[rel]) : null
  }
}

const DONOR_ROOT = resolve('/donor')
const HERE_ROOT = resolve('/here/.claude/worktrees/x')
const SAME = {
  'engine/Cargo.lock': 'lock',
  'engine/crates/fold/src/lib.rs': 'pub fn f() {}',
  'src/main/data/spells.json': '{"spells":[]}'
}
const BIN = 'b'.repeat(64)

function donorStamp(): EngineStamp {
  return { v: 2, inputs: inputDigest(DONOR_ROOT, FILES, tree(DONOR_ROOT, SAME)), bin: BIN, files: FILES }
}

function verdictFor(here: Record<string, string>, stamp: EngineStamp | null = donorStamp()) {
  return decide(stamp, BIN, (files) => inputDigest(HERE_ROOT, files, tree(HERE_ROOT, here)))
}

test('UNCHANGED INPUTS REUSE: same bytes under another root give the same digest', () => {
  assert.deepEqual(verdictFor({ ...SAME }), { reuse: true })
})

test('A CHANGED .rs FILE BUILDS', () => {
  const v = verdictFor({ ...SAME, 'engine/crates/fold/src/lib.rs': 'pub fn f() {} // edited' })
  assert.deepEqual(v, { reuse: false, why: 'the engine inputs differ' })
})

test('A CHANGED EMBEDDED DATA FILE BUILDS', () => {
  const v = verdictFor({ ...SAME, 'src/main/data/spells.json': '{"spells":[1]}' })
  assert.equal(v.reuse, false)
})

test('A DELETED INPUT BUILDS (absent hashes apart from empty)', () => {
  const { 'src/main/data/spells.json': _gone, ...rest } = SAME
  assert.equal(verdictFor(rest).reuse, false)
  assert.equal(verdictFor({ ...SAME, 'src/main/data/spells.json': '' }).reuse, false)
})

test('A MISSING OR UNREADABLE STAMP BUILDS', () => {
  assert.deepEqual(verdictFor({ ...SAME }, null), {
    reuse: false,
    why: 'no readable stamp beside the binary'
  })
  // The pre-2026-11-27 stamp was a bare digest over absolute paths: never trusted as a donor's.
  assert.equal(parseStamp('68923ff9f9e47e851bf47ca1ab5b34263d326aade18757fa47d6446085450eae'), null)
  assert.equal(parseStamp('{"v":2,"inputs":"x","bin":"y","files":[]}'), null)
  assert.equal(parseStamp('{"v":2,'), null)
  assert.deepEqual(parseStamp(JSON.stringify(donorStamp())), donorStamp())
})

test('A BINARY THAT IS NOT THE ONE ITS STAMP DESCRIBES BUILDS, AS DOES NO BINARY', () => {
  const here = (files: string[]) => inputDigest(HERE_ROOT, files, tree(HERE_ROOT, SAME))
  assert.equal(decide(donorStamp(), 'c'.repeat(64), here).reuse, false)
  assert.equal(decide(donorStamp(), null, here).reuse, false)
})

test('DEP-INFO PATHS: one file named several ways becomes one relative entry', () => {
  const root = resolve('/repo')
  const viaFold = join(root, 'engine', 'crates', 'fold', 'src', '..', '..', '..', '..', 'src', 'main', 'data', 'spells.json')
  const viaEqlog = join(root, 'engine', 'crates', 'eqlog', 'src', 'spelldb', '..', '..', '..', '..', '..', 'src', 'main', 'data', 'spells.json')
  const lowered = process.platform === 'win32' ? viaEqlog.toLowerCase() : viaEqlog
  const dep = `${join(root, 'engine', 'target', 'release', 'engined.exe')}: ${viaFold} ${lowered}\n`
  assert.deepEqual(relativeInputs(root, depInfoInputs(dep)), ['src/main/data/spells.json'])
  const outside = resolve('/elsewhere/x.rs')
  assert.deepEqual(relativeInputs(root, [outside]), [outside.replace(/\\/g, '/')])
})

// ── the file-system side, in a scratch directory ───────────────────────────────────────

const BIN_NAME = 'engined.exe'

function put(root: string, rel: string, text: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true })
  writeFileSync(join(root, rel), text)
}

/** A checkout with the engine's shape: manifests, one crate, one embedded data file. */
function checkout(root: string): void {
  put(root, 'engine/Cargo.toml', '[workspace]')
  put(root, 'engine/Cargo.lock', 'lock')
  put(root, 'engine/rust-toolchain.toml', '[toolchain]')
  put(root, 'engine/crates/engined/Cargo.toml', '[package]')
  put(root, 'engine/crates/engined/src/main.rs', 'fn main() {}')
  put(root, 'src/main/data/spells.json', '{}')
}

/** A cargo build's leavings: the binary and its dep-info, absolute paths as cargo writes them. */
function built(root: string, binText: string): void {
  const rel = join(root, 'engine', 'target', 'release')
  const rs = join(root, 'engine', 'crates', 'engined', 'src', 'main.rs')
  const data = join(root, 'engine', 'crates', 'engined', 'src', '..', '..', '..', '..', 'src', 'main', 'data', 'spells.json')
  put(root, 'engine/target/release/engined.d', `${join(rel, BIN_NAME)}: ${rs} ${data}\n`)
  put(root, `engine/target/release/${BIN_NAME}`, binText)
}

function scratch(): { donor: string; here: string; done: () => void } {
  const base = mkdtempSync(join(tmpdir(), 'engine-stamp-'))
  const donor = join(base, 'donor')
  const here = join(base, 'here')
  checkout(donor)
  checkout(here)
  return { donor, here, done: () => rmSync(base, { recursive: true, force: true }) }
}

test('A STAMPED DONOR IS COPIED (binary and stamp) AND THE COPY THEN READS AS FRESH', () => {
  const { donor, here, done } = scratch()
  try {
    built(donor, 'the engine')
    assert.equal(writeEngineStamp(donor, BIN_NAME, Date.now() + 1000), true)
    assert.equal(engineIsFresh(donor, BIN_NAME), true)
    assert.equal(engineIsFresh(here, BIN_NAME), false)
    assert.deepEqual(reuseDonorEngine(here, donor, BIN_NAME), { reuse: true })
    const hereBin = join(here, 'engine', 'target', 'release', BIN_NAME)
    assert.equal(readFileSync(hereBin, 'utf8'), 'the engine')
    assert.equal(engineIsFresh(here, BIN_NAME), true)
    const leftovers = readdirSync(dirname(hereBin)).filter((n) => n.includes('.donor-'))
    assert.deepEqual(leftovers, [], 'no temp copy left behind')
  } finally {
    done()
  }
})

test('A DONOR WHOSE INPUTS DIFFER, OR WITH NO STAMP, IS NOT COPIED', () => {
  const { donor, here, done } = scratch()
  try {
    built(donor, 'the engine')
    assert.deepEqual(reuseDonorEngine(here, donor, BIN_NAME).reuse, false, 'no stamp yet')
    assert.equal(writeEngineStamp(donor, BIN_NAME, Date.now() + 1000), true)
    put(here, 'src/main/data/spells.json', '{"changed":true}')
    assert.equal(reuseDonorEngine(here, donor, BIN_NAME).reuse, false, 'a data file differs')
    put(here, 'src/main/data/spells.json', '{}')
    put(here, 'engine/crates/engined/src/main.rs', 'fn main() {} // comment')
    assert.equal(reuseDonorEngine(here, donor, BIN_NAME).reuse, false, 'a .rs file differs')
    assert.equal(sha256File(join(here, 'engine', 'target', 'release', BIN_NAME)), null)
  } finally {
    done()
  }
})

test('A DONOR BINARY REPLACED AFTER ITS STAMP IS NOT COPIED; NO STAMP WHEN AN INPUT MOVED MID-BUILD', () => {
  const { donor, here, done } = scratch()
  try {
    built(donor, 'the engine')
    assert.equal(writeEngineStamp(donor, BIN_NAME, Date.now() + 1000), true)
    put(donor, `engine/target/release/${BIN_NAME}`, 'a raw cargo build')
    assert.deepEqual(reuseDonorEngine(here, donor, BIN_NAME), {
      reuse: false,
      why: 'the binary is not the one its stamp describes'
    })
    // Inputs written after the build started: the binary may hold either version, so no stamp.
    assert.equal(writeEngineStamp(donor, BIN_NAME, Date.now() - 60_000), false)
    assert.equal(readdirSync(join(donor, 'engine', 'target', 'release')).includes(STAMP_NAME), false)
  } finally {
    done()
  }
})

test('EQ_ENGINE_DONOR names the donor; a checkout is never its own donor', () => {
  const before = process.env.EQ_ENGINE_DONOR
  try {
    process.env.EQ_ENGINE_DONOR = resolve('/some/other/clone')
    assert.equal(donorRoot(resolve('/here')), resolve('/some/other/clone'))
    assert.equal(donorRoot(resolve('/some/other/clone')), null)
  } finally {
    if (before === undefined) delete process.env.EQ_ENGINE_DONOR
    else process.env.EQ_ENGINE_DONOR = before
  }
})

// ── the gate's list of engine inputs ───────────────────────────────────────────────────

function rustFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory() && e.name !== 'target') out.push(...rustFiles(p))
    else if (e.name.endsWith('.rs')) out.push(p)
  }
  return out
}

test('engine-inputs.txt COVERS EVERY include_str!/include_bytes! TARGET IN engine/', () => {
  const listed = readFileSync('scripts/community/engine-inputs.txt', 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'))
  const covered = (rel: string) =>
    listed.some((p) => (p.endsWith('/') ? rel.startsWith(p) : rel === p))
  const embed = /include_(?:str|bytes)!\(\s*"([^"]+)"\s*\)/g
  const targets: string[] = []
  for (const file of rustFiles(resolve('engine', 'crates'))) {
    for (const m of readFileSync(file, 'utf8').matchAll(embed)) {
      targets.push(relative(resolve('.'), resolve(dirname(file), m[1])).replace(/\\/g, '/'))
    }
  }
  assert.ok(targets.includes('src/main/data/spells.json'), 'the scan finds the embeds')
  assert.deepEqual(targets.filter((t) => !covered(t)), [])
})
