// The hard stop before a release: does this build still answer to the identity every install in
// players' hands is matched on?
//
//   node --import tsx scripts/community/check-release-identity.mts <dir> <version> <exe> [--require-unpacked]
//
// A release cannot be taken back: allowDowngrade is off, so an install that took a bad build can
// only be fixed by a later one, and only if the bad build's own updater settings still work. A
// wrong channel or feed in app-update.yml would strand every install that took it. So
// publish-release.sh runs this on the build it is about to publish, CI's included, and stops on any
// problem. With --require-unpacked (every real publish) a missing win-unpacked is a problem too,
// because the updater settings can be read nowhere else.

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The exe name is frozen: see `executableName` in electron-builder.yml. */
export const FROZEN_EXE = 'EQ Legends Companion TEST.exe'

/** What resources/app-update.yml must say, exactly. */
const UPDATE_CONFIG: Readonly<Record<string, string>> = {
  provider: 'generic',
  url: 'https://github.com/kaltinril/everquest-companion/releases/latest/download/',
  channel: 'test',
  updaterCacheDirName: 'everquest-companion-test-updater'
}

export interface ReleaseBuild {
  /** The build's output folder, release/<version>. */
  readonly dir: string
  readonly version: string
  /** The installer's file name. */
  readonly exe: string
  /** True on a real publish: win-unpacked must be there to be read. */
  readonly requireUnpacked: boolean
}

/** The top-level `key: value` lines of a YAML file, quotes off. Nested and list lines are skipped. */
function topLevel(text: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z][\w-]*):\s*(.*?)\s*$/.exec(line)
    if (m) out.set(m[1], m[2].replace(/^(['"])(.*)\1$/, '$2'))
  }
  return out
}

/** Everything wrong with the update file the new build wrote. */
function updateFileProblems({ dir, version, exe }: ReleaseBuild): string[] {
  const file = join(dir, 'test.yml')
  if (!existsSync(file)) return [`no ${file}; the build did not write its update file`]
  const text = readFileSync(file, 'utf8')
  const yml = topLevel(text)
  const problems: string[] = []
  if (yml.get('version') !== version) problems.push(`${file} names version ${String(yml.get('version'))}, not ${version}`)
  if (yml.get('path') !== exe) problems.push(`${file} has path ${String(yml.get('path'))}, not ${exe}`)
  const firstUrl = /^\s*-\s*url:\s*(.+?)\s*$/m.exec(text)?.[1]?.replace(/^(['"])(.*)\1$/, '$2')
  if (firstUrl !== exe) problems.push(`${file} has files[0].url ${String(firstUrl)}, not ${exe}`)
  return problems
}

/** Everything wrong with the updater settings and exe inside win-unpacked. */
function unpackedProblems({ dir, requireUnpacked }: ReleaseBuild): string[] {
  const unpacked = join(dir, 'win-unpacked')
  if (!existsSync(unpacked)) {
    return requireUnpacked ? [`no ${unpacked}; the updater settings cannot be checked, so this cannot be published`] : []
  }
  const problems: string[] = []
  if (!existsSync(join(unpacked, FROZEN_EXE))) problems.push(`${unpacked} has no "${FROZEN_EXE}"; executableName changed`)
  const file = join(unpacked, 'resources', 'app-update.yml')
  if (!existsSync(file)) return [...problems, `no ${file}`]
  const yml = topLevel(readFileSync(file, 'utf8'))
  for (const [key, want] of Object.entries(UPDATE_CONFIG)) {
    if (yml.get(key) !== want) problems.push(`${file}: ${key} is ${String(yml.get(key))}, must be ${want}`)
  }
  // With a publisher name the updater rejects every update that is not signed, and none are.
  if (yml.has('publisherName')) problems.push(`${file} sets publisherName; every unsigned update would be refused`)
  return problems
}

/** Everything that makes this build unsafe to publish; empty when it is fine. */
export function identityProblems(build: ReleaseBuild): string[] {
  const name = /\s/.test(build.exe) ? [`the installer name "${build.exe}" has a space; test.yml carries it bare`] : []
  return [...name, ...updateFileProblems(build), ...unpackedProblems(build)]
}

function main(argv: readonly string[]): number {
  const flags = argv.filter((a) => a.startsWith('--'))
  const [dir, version, exe] = argv.filter((a) => !a.startsWith('--'))
  if (!dir || !version || !exe || flags.some((f) => f !== '--require-unpacked')) {
    console.error('usage: check-release-identity.mts <dir> <version> <exe> [--require-unpacked]')
    return 2
  }
  const requireUnpacked = flags.includes('--require-unpacked')
  const problems = identityProblems({ dir, version, exe, requireUnpacked })
  for (const p of problems) console.error(`STOP: ${p}`)
  if (problems.length > 0) return 1
  const read = existsSync(join(dir, 'win-unpacked')) ? 'update file, exe and updater settings' : 'update file only (no win-unpacked)'
  console.log(`identity: ${read} OK`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)))
}
