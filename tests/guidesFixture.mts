// The committed copy of one guide pull (tests/fixtures/guides, fetched 2026-11-20) as a source the
// pull can read, with a way to doctor one file. Shared by the guides*.test.mts files; nothing here
// reaches the network.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'
import { ODS_MIME, odsContentXml } from '../scripts/community/guides/ods'
import { PullRefusal } from '../scripts/community/guides/rules'
import { ODS_FILE, PAGE_FILE, tabFile, type GuideSource } from '../scripts/community/guides/source'
import { parseCsv, trimGrid } from '../scripts/community/guides/csv'

export const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/guides/', import.meta.url))

export type Files = Map<string, Uint8Array>

/** Every fixture file by its path under the folder: `pubhtml.html`, `sheet/Alchemy.csv`, `kornerstore.ods`. */
export function fixtureFiles(): Files {
  const files: Files = new Map()
  for (const name of [PAGE_FILE, ODS_FILE]) files.set(name, new Uint8Array(readFileSync(join(FIXTURE_DIR, name))))
  for (const name of readdirSync(join(FIXTURE_DIR, 'sheet'))) files.set(`sheet/${name}`, new Uint8Array(readFileSync(join(FIXTURE_DIR, 'sheet', name))))
  return files
}

/** The files, served as if fetched. A file that is not there fails the way a failed request does. */
export function memorySource(files: Files): GuideSource {
  const serve = (path: string): Promise<Uint8Array> => {
    const bytes = files.get(path)
    return bytes === undefined ? Promise.reject(new PullRefusal('response', `${path}: not served`)) : Promise.resolve(bytes)
  }
  return { page: () => serve(PAGE_FILE), tab: (tab) => serve(tabFile(tab)), ods: () => serve(ODS_FILE) }
}

export const bytesOf = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'utf8'))
export const textOf = (files: Files, path: string): string => Buffer.from(files.get(path)!).toString('utf8')

/** The fixture with one text file rewritten. */
export function withText(path: string, edit: (text: string) => string): Files {
  const files = fixtureFiles()
  files.set(path, bytesOf(edit(textOf(files, path))))
  return files
}

/** One fixture tab as rows of trimmed cells. */
export const fixtureGrid = (tab: string): string[][] => trimGrid(parseCsv(textOf(fixtureFiles(), `sheet/${tab}.csv`)))

/** A CSV's lines, whichever line ending it was checked out with. */
export const csvLines = (text: string): string[] => text.split(/\r?\n/)

// ---- a zip, by hand, so a test can hand the reader a spreadsheet it made up ---------------------------

interface ZipEntry {
  name: string
  data: Uint8Array
  /** Stored, not deflated (an .ods stores its `mimetype`). */
  store?: boolean
}

/** A plain zip of the entries. The checksum fields are left zero: the reader under test does not use them. */
export function zipOf(entries: ZipEntry[]): Uint8Array {
  const locals: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8')
    const body = e.store === true ? Buffer.from(e.data) : deflateRawSync(e.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(e.store === true ? 0 : 8, 8)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(e.data.byteLength, 22)
    local.writeUInt16LE(name.length, 26)
    const head = Buffer.alloc(46)
    head.writeUInt32LE(0x02014b50, 0)
    head.writeUInt16LE(20, 4)
    head.writeUInt16LE(20, 6)
    head.writeUInt16LE(e.store === true ? 0 : 8, 10)
    head.writeUInt32LE(body.length, 20)
    head.writeUInt32LE(e.data.byteLength, 24)
    head.writeUInt16LE(name.length, 28)
    head.writeUInt32LE(offset, 42)
    locals.push(local, name, body)
    central.push(head, name)
    offset += 30 + name.length + body.length
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...locals, directory, end]))
}

/** An .ods holding this content.xml. */
export const odsOf = (contentXml: string): Uint8Array =>
  zipOf([{ name: 'mimetype', data: bytesOf(ODS_MIME), store: true }, { name: 'content.xml', data: bytesOf(contentXml) }])

/** The fixture's recipe book with its content.xml rewritten. */
export function withOdsXml(edit: (xml: string) => string): Files {
  const files = fixtureFiles()
  files.set(ODS_FILE, odsOf(edit(odsContentXml(files.get(ODS_FILE)!))))
  return files
}
