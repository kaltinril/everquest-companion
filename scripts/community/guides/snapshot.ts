// snapshot.ts — the last good pull, kept in the repo as the bytes that were fetched
// (scripts/sources/cache/guides/), and the data file written from it. A refused pull writes nothing
// here, so the last good copy is what the next pull is compared against.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ODS_PAGE_URL, SHEET_PAGE_URL, type RawPull, type RawTab } from './build'
import { ODS_FILE, tabFile } from './source'

export const MANIFEST_FILE = 'manifest.json'

interface FileStamp {
  file: string
  bytes: number
  sha256: string
}

export interface Manifest {
  pulledAt: string
  sheet: { url: string; title?: string; tabs: ({ name: string; gid: string } & FileStamp)[] }
  recipes: { url: string } & FileStamp
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const stamp = (file: string, bytes: Uint8Array): FileStamp => ({ file, bytes: bytes.byteLength, sha256: sha256(bytes) })

export function manifestOf(raw: RawPull, pulledAt: string): Manifest {
  if (raw.ods === undefined) throw new Error('a pull with no recipe book has no manifest')
  return {
    pulledAt,
    sheet: {
      url: SHEET_PAGE_URL,
      ...(raw.title === undefined ? {} : { title: raw.title }),
      tabs: raw.tabs.map((t) => ({ name: t.name, gid: t.gid, ...stamp(tabFile(t), t.bytes) }))
    },
    recipes: { url: ODS_PAGE_URL, ...stamp(ODS_FILE, raw.ods) }
  }
}

/** The last good pull, or undefined when the folder holds none. Throws when a file does not match its manifest. */
export function readSnapshot(dir: string): { raw: RawPull; manifest: Manifest } | undefined {
  const path = join(dir, MANIFEST_FILE)
  if (!existsSync(path)) return undefined
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as Manifest
  const load = (f: FileStamp): Uint8Array => {
    const bytes = new Uint8Array(readFileSync(join(dir, f.file)))
    if (sha256(bytes) !== f.sha256) throw new Error(`${join(dir, f.file)} does not match its manifest (edited by hand, or a line-ending change): restore it from git`)
    return bytes
  }
  const tabs: RawTab[] = manifest.sheet.tabs.map((t) => ({ name: t.name, gid: t.gid, bytes: load(t) }))
  const raw: RawPull = { tabs, ods: load(manifest.recipes), refusals: [] }
  if (manifest.sheet.title !== undefined) raw.title = manifest.sheet.title
  return { raw, manifest }
}

function writeIfChanged(path: string, bytes: Uint8Array): void {
  if (existsSync(path) && Buffer.compare(readFileSync(path), bytes) === 0) return
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, bytes)
}

/** The fetched bytes and their manifest. Tab files the sheet no longer has are removed. */
export function writeSnapshot(dir: string, raw: RawPull, pulledAt: string): void {
  const manifest = manifestOf(raw, pulledAt)
  const keep = new Set(manifest.sheet.tabs.map((t) => t.file))
  const sheetDir = join(dir, 'sheet')
  for (const name of existsSync(sheetDir) ? readdirSync(sheetDir) : []) {
    if (name.endsWith('.csv') && !keep.has(`sheet/${name}`)) rmSync(join(sheetDir, name))
  }
  for (const t of raw.tabs) writeIfChanged(join(dir, tabFile(t)), t.bytes)
  if (raw.ods !== undefined) writeIfChanged(join(dir, ODS_FILE), raw.ods)
  writeIfChanged(join(dir, MANIFEST_FILE), Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'))
}

// ---- the data file's text ---------------------------------------------------------------------------

/** A record this short is written on one line, so a changed recipe is a changed line. */
const LINE_WIDTH = 150

function inline(v: unknown): string {
  if (Array.isArray(v)) return v.length === 0 ? '[]' : `[${v.map(inline).join(', ')}]`
  if (v !== null && typeof v === 'object') {
    const entries = Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`)
    return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`
  }
  return JSON.stringify(v)
}

function block(v: unknown, indent: string): string {
  const flat = inline(v)
  if (v === null || typeof v !== 'object' || indent.length + flat.length <= LINE_WIDTH) return flat
  const deeper = `${indent}  `
  if (Array.isArray(v)) return `[\n${v.map((x) => `${deeper}${block(x, deeper)}`).join(',\n')}\n${indent}]`
  const entries = Object.entries(v).map(([k, x]) => `${deeper}${JSON.stringify(k)}: ${block(x, deeper)}`)
  return `{\n${entries.join(',\n')}\n${indent}}`
}

/** JSON in the order the keys were set: indented, with any record that fits on one line kept on it. */
export const formatData = (file: unknown): string => `${block(file, '')}\n`

export function writeData(path: string, file: unknown): void {
  writeIfChanged(path, Buffer.from(formatData(file), 'utf8'))
}
