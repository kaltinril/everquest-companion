/**
 * engineStamp.mts — what an `engined.exe` was built from, written beside it, and the rule for
 * taking another checkout's binary instead of compiling one (docs/community/agent/WORKFLOW.md,
 * "Engine binary reuse").
 *
 * THE STAMP is `engine/target/release/.e2e-engine-stamp`, JSON:
 *  - `files`: every input of the build, as a path relative to the checkout root. Cargo's dep-info
 *    (`engined.d`) names the sources and every `include_str!`'d data file; the workspace and crate
 *    manifests, `Cargo.lock` and `rust-toolchain.toml` are cargo's fingerprint rather than rustc's
 *    and are added by name. The engine has no build script, so nothing else feeds the binary.
 *  - `inputs`: one sha256 over those files' bytes, keyed by the RELATIVE paths, so two checkouts
 *    holding the same bytes get the same digest wherever they sit on disk.
 *  - `bin`: the sha256 of the binary the stamp describes, so a binary rebuilt or replaced without a
 *    new stamp (a raw `cargo build`) never passes as the one the stamp vouches for.
 *
 * Any file this checkout lacks hashes as absent, so a deleted input is a change. A new input can
 * only arrive through a changed listed file (the `.rs` that adds an `include_str!` or a `mod`, a
 * manifest), so the donor's list is enough to compare against.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

export const STAMP_NAME = '.e2e-engine-stamp'

export interface EngineStamp {
  v: 2
  /** sha256 over the inputs' bytes, keyed by the relative paths in `files`. */
  inputs: string
  /** sha256 of the binary this stamp describes. */
  bin: string
  /** Relative to the checkout root (forward slashes); absolute only for a path outside it. */
  files: string[]
}

/** A file's bytes, or null when it cannot be read. Passed in so the decision is a pure function. */
export type ReadBytes = (path: string) => Buffer | null

export type Decision = { reuse: true } | { reuse: false; why: string }

/**
 * Parse a cargo/GNU-make dep-info file into its input paths. Spaces inside a path are escaped `\ `
 * by the writer, so the split is on spaces NOT preceded by a backslash.
 */
export function depInfoInputs(text: string): string[] {
  const line = text.split(/\r?\n/).find((l) => l.includes(': '))
  if (line === undefined) return []
  return line
    .slice(line.indexOf(': ') + 2)
    .split(/(?<!\\) /)
    .map((p) => p.replace(/\\ /g, ' ').trim())
    .filter((p) => p !== '')
}

/**
 * Normalize input paths against `root`: `..` segments resolved, relative to the root with forward
 * slashes, sorted, deduplicated. Dep-info names one file several ways (`c:\…\spelldb\../../…` and
 * `C:\…\combat\../../…`); Windows path comparison ignores case, so those become one entry.
 */
export function relativeInputs(root: string, paths: string[]): string[] {
  const out = new Set<string>()
  for (const p of paths) {
    const abs = resolve(root, p)
    const rel = relative(root, abs)
    const inside = rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
    out.add((inside ? rel : abs).replace(/\\/g, '/'))
  }
  return [...out].sort()
}

/** One digest over the files' bytes, keyed by the paths as listed, so it does not depend on `root`. */
export function inputDigest(root: string, files: string[], read: ReadBytes): string {
  const h = createHash('sha256')
  for (const f of files) {
    const bytes = read(isAbsolute(f) ? f : join(root, f))
    // The length prefix keeps "absent" (-1) and every byte string apart.
    h.update(`${f}\0${bytes === null ? -1 : bytes.length}\0`)
    if (bytes !== null) h.update(bytes)
  }
  return h.digest('hex')
}

const HEX64 = /^[0-9a-f]{64}$/

/** The stamp, or null for anything else: an old bare-digest stamp, a torn write, a wrong shape. */
export function parseStamp(text: string): EngineStamp | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const { v, inputs, bin, files } = raw as Partial<EngineStamp>
  if (v !== 2 || !Array.isArray(files) || files.length === 0) return null
  if (!files.every((f) => typeof f === 'string')) return null
  if (typeof inputs !== 'string' || !HEX64.test(inputs)) return null
  if (typeof bin !== 'string' || !HEX64.test(bin)) return null
  return { v: 2, inputs, bin, files }
}

export function formatStamp(s: EngineStamp): string {
  return `${JSON.stringify(s, null, 1)}\n`
}

/**
 * May the binary a stamp describes stand for THIS checkout's engine? Only when the stamp is
 * readable, the binary on disk is the one it describes, and every input it lists has the same
 * bytes here. `binSha` is the sha256 of that binary (null: missing); `treeDigest` hashes a file
 * list in this checkout. Used for this checkout's own binary and for a donor's alike.
 */
export function decide(
  stamp: EngineStamp | null,
  binSha: string | null,
  treeDigest: (files: string[]) => string
): Decision {
  if (stamp === null) return { reuse: false, why: 'no readable stamp beside the binary' }
  if (binSha === null) return { reuse: false, why: 'no binary' }
  if (binSha !== stamp.bin) return { reuse: false, why: 'the binary is not the one its stamp describes' }
  if (treeDigest(stamp.files) !== stamp.inputs) return { reuse: false, why: 'the engine inputs differ' }
  return { reuse: true }
}

// ── the file-system side ────────────────────────────────────────────────────────────────

const readBytes: ReadBytes = (p) => {
  try {
    return readFileSync(p)
  } catch {
    return null
  }
}

function releaseDir(root: string): string {
  return join(root, 'engine', 'target', 'release')
}

export function sha256File(path: string): string | null {
  const bytes = readBytes(path)
  return bytes === null ? null : createHash('sha256').update(bytes).digest('hex')
}

function readStamp(dir: string): EngineStamp | null {
  const bytes = readBytes(join(dir, STAMP_NAME))
  return bytes === null ? null : parseStamp(bytes.toString('utf8'))
}

/** The manifests and the toolchain pin: cargo's fingerprint, never in dep-info. */
function manifestInputs(root: string): string[] {
  const engine = join(root, 'engine')
  const out = ['Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml'].map((n) => join(engine, n))
  for (const crate of readdirSync(join(engine, 'crates'), { withFileTypes: true })) {
    if (crate.isDirectory()) out.push(join(engine, 'crates', crate.name, 'Cargo.toml'))
  }
  return out
}

function checkDecision(root: string, dir: string, binName: string): Decision {
  return decide(readStamp(dir), sha256File(join(dir, binName)), (files) =>
    inputDigest(root, files, readBytes)
  )
}

/** Is this checkout's own binary the one its current inputs would produce? */
export function engineIsFresh(root: string, binName: string): boolean {
  return checkDecision(root, releaseDir(root), binName).reuse
}

/**
 * After a successful cargo build: record what the binary came from. Writes nothing (and removes
 * the old stamp) when cargo left no dep-info, or when an input was modified after `startedMs`,
 * because then the binary may hold either version of that file. The next run builds again.
 */
export function writeEngineStamp(root: string, binName: string, startedMs: number): boolean {
  const dir = releaseDir(root)
  rmSync(join(dir, STAMP_NAME), { force: true })
  const dep = readBytes(join(dir, `${basename(binName, '.exe')}.d`))
  const listed = dep === null ? [] : depInfoInputs(dep.toString('utf8'))
  const bin = sha256File(join(dir, binName))
  if (listed.length === 0 || bin === null) return false
  const files = relativeInputs(root, [...listed, ...manifestInputs(root)])
  const touched = files.some((f) => {
    try {
      return statSync(isAbsolute(f) ? f : join(root, f)).mtimeMs > startedMs
    } catch {
      return false
    }
  })
  if (touched) return false
  const stamp: EngineStamp = { v: 2, inputs: inputDigest(root, files, readBytes), bin, files }
  writeFileSync(join(dir, STAMP_NAME), formatStamp(stamp))
  return true
}

/**
 * The main clone this worktree belongs to, or null when `root` is the main clone itself (or git
 * cannot say). `EQ_ENGINE_DONOR` names another checkout root instead.
 */
export function donorRoot(root: string): string | null {
  const named = process.env.EQ_ENGINE_DONOR
  let donor: string | null = named !== undefined && named !== '' ? resolve(named) : null
  if (donor === null) {
    const res = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: root,
      encoding: 'utf8'
    })
    const common = res.status === 0 ? res.stdout.trim() : ''
    if (basename(common) !== '.git') return null
    donor = dirname(common)
  }
  return relative(donor, root) === '' ? null : donor
}

/**
 * Copy the donor checkout's binary into this one when its stamp proves the same inputs. A COPY,
 * never a link: the donor may be rebuilt while this tree runs. The copy is hashed again before it
 * is put in place, so a donor rebuilt mid-copy is caught; the stamp goes in last, so a crash
 * between the two leaves a binary with no stamp, which the next run does not trust.
 */
export function reuseDonorEngine(root: string, donor: string, binName: string): Decision {
  const from = releaseDir(donor)
  const stamp = readStamp(from)
  const verdict = checkDecision(root, from, binName)
  if (!verdict.reuse || stamp === null) return verdict
  const dir = releaseDir(root)
  const tmp = join(dir, `${binName}.donor-${String(process.pid)}`)
  try {
    mkdirSync(dir, { recursive: true })
    copyFileSync(join(from, binName), tmp)
    if (sha256File(tmp) !== stamp.bin) {
      rmSync(tmp, { force: true })
      return { reuse: false, why: 'the donor binary changed while it was copied' }
    }
    renameSync(tmp, join(dir, binName))
    writeFileSync(join(dir, STAMP_NAME), formatStamp(stamp))
  } catch (err) {
    rmSync(tmp, { force: true })
    return { reuse: false, why: `the copy failed: ${err instanceof Error ? err.message : String(err)}` }
  }
  return verdict
}
