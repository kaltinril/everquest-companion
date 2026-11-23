// THE IDS EVERY INSTALL IS MATCHED ON. The name players see is EQ Legends Companion CE; these stayed
// "test" on purpose when it changed (docs/community/plans/2026-11-19-own-project.md, Part 2). A tidy
// that "finishes the rename" here strands players:
//   - appId makes the GUID the installer finds the existing install by;
//   - executableName keeps the exe, the uninstaller and the player's shortcuts where they are;
//   - channel `test` is the file every install from test.20 on asks the feed for;
//   - the package name is the install folder and the updater cache;
//   - PROD_DIR_NAME is the player's settings.
// channel.ts cannot be imported here (it calls app.setPath at import), so it is read as text.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { load } from 'js-yaml'
import { FROZEN_EXE, identityProblems } from '../scripts/community/check-release-identity.mts'

interface BuilderConfig {
  appId: string
  productName: string
  executableName: string
  publish: { provider: string; url: string; channel: string }[]
  nsis: Record<string, unknown>
}

const builder = load(readFileSync('electron-builder.yml', 'utf8')) as BuilderConfig
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { name: string; productName?: string }
const channelTs = readFileSync('src/main/channel.ts', 'utf8')
const installer = readFileSync('build/installer.nsh', 'utf8')

test('the ids existing installs depend on have not moved', () => {
  assert.equal(builder.appId, 'com.kaltinril.everquest-companion.test')
  assert.equal(builder.executableName, 'EQ Legends Companion TEST')
  assert.equal(`${builder.executableName}.exe`, FROZEN_EXE)
  assert.equal(builder.nsis.guid, undefined, 'a set guid replaces the one made from appId')
  assert.deepEqual(builder.publish, [
    {
      provider: 'generic',
      url: 'https://github.com/kaltinril/everquest-companion/releases/latest/download/',
      channel: 'test'
    }
  ])
  assert.equal(pkg.name, 'everquest-companion-test')
  assert.equal(pkg.productName, undefined, 'a productName here would change app.getName()')
  assert.match(channelTs, /^const PROD_DIR_NAME = 'everquest-companion-test'/m)
})

test('the one-click per-user shape that puts the install folder under the package name', () => {
  assert.equal(builder.nsis.oneClick, true)
  assert.equal(builder.nsis.perMachine, false)
})

test('what players see says CE', () => {
  assert.equal(builder.productName, 'EQ Legends Companion CE')
  assert.equal(builder.nsis.shortcutName, 'EQ Legends Companion CE')
  assert.equal(builder.nsis.artifactName, 'everquest-companion-ce-Setup-${version}.${ext}')
  assert.match(installer, /reinstall \$\{PRODUCT_NAME\}\./)
})

test("the installer's literal folders still match the package and the settings folder", () => {
  assert.ok(installer.includes('StrCpy $INSTDIR "$LOCALAPPDATA\\Programs\\everquest-companion-test"'))
  assert.ok(installer.includes('RMDir /r "$APPDATA\\everquest-companion-test"'))
})

// ---- the release script's guard ----------------------------------------------------------------

const VERSION = '0.1.55'
const EXE = `everquest-companion-ce-Setup-${VERSION}.exe`
const GOOD_UPDATE_CONFIG = [
  'provider: generic',
  'url: https://github.com/kaltinril/everquest-companion/releases/latest/download/',
  'channel: test',
  'updaterCacheDirName: everquest-companion-test-updater',
  ''
].join('\n')
const GOOD_TEST_YML = [
  `version: ${VERSION}`,
  'files:',
  `  - url: ${EXE}`,
  '    sha512: abc',
  '    size: 1',
  `path: ${EXE}`,
  'sha512: abc',
  "releaseDate: '2026-11-23T00:00:00.000Z'",
  ''
].join('\n')

/** A build folder as electron-builder leaves it; `change` then breaks one thing. */
function withBuild(change: (dir: string) => void, check: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'eqc-release-identity-'))
  try {
    mkdirSync(join(dir, 'win-unpacked', 'resources'), { recursive: true })
    writeFileSync(join(dir, 'win-unpacked', FROZEN_EXE), '')
    writeFileSync(join(dir, 'win-unpacked', 'resources', 'app-update.yml'), GOOD_UPDATE_CONFIG)
    writeFileSync(join(dir, 'test.yml'), GOOD_TEST_YML)
    change(dir)
    check(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const updateConfig = (dir: string): string => join(dir, 'win-unpacked', 'resources', 'app-update.yml')
const problemsIn = (dir: string, exe = EXE): string[] =>
  identityProblems({ dir, version: VERSION, exe, requireUnpacked: true })

test('the guard passes a build with its identity intact', () => {
  withBuild(
    () => undefined,
    (dir) => assert.deepEqual(problemsIn(dir), [])
  )
})

test('the guard reads a CRLF update file the same way', () => {
  withBuild(
    (dir) => writeFileSync(updateConfig(dir), GOOD_UPDATE_CONFIG.replace(/\n/g, '\r\n')),
    (dir) => assert.deepEqual(problemsIn(dir), [])
  )
})

const BROKEN: readonly (readonly [string, (dir: string) => void, RegExp])[] = [
  ['the channel moved', (d) => writeFileSync(updateConfig(d), GOOD_UPDATE_CONFIG.replace('channel: test', 'channel: latest')), /channel is latest/],
  ['the channel is gone', (d) => writeFileSync(updateConfig(d), GOOD_UPDATE_CONFIG.replace('channel: test\n', '')), /channel is undefined/],
  ['the feed moved', (d) => writeFileSync(updateConfig(d), GOOD_UPDATE_CONFIG.replace('kaltinril', 'jmoyers')), /url is/],
  ['the provider moved', (d) => writeFileSync(updateConfig(d), GOOD_UPDATE_CONFIG.replace('generic', 'github')), /provider is github/],
  ['the updater cache moved', (d) => writeFileSync(updateConfig(d), GOOD_UPDATE_CONFIG.replace('-test-updater', '-ce-updater')), /updaterCacheDirName/],
  ['a publisher name appeared', (d) => writeFileSync(updateConfig(d), `${GOOD_UPDATE_CONFIG}publisherName: someone\n`), /publisherName/],
  ['app-update.yml is missing', (d) => rmSync(updateConfig(d)), /app-update\.yml/],
  ['the exe was renamed', (d) => rmSync(join(d, 'win-unpacked', FROZEN_EXE)), /executableName changed/],
  ['win-unpacked is missing', (d) => rmSync(join(d, 'win-unpacked'), { recursive: true }), /cannot be published/],
  ['test.yml is missing', (d) => rmSync(join(d, 'test.yml')), /did not write its update file/],
  ['test.yml names another version', (d) => writeFileSync(join(d, 'test.yml'), GOOD_TEST_YML.replace(`version: ${VERSION}`, 'version: 0.1.54')), /names version 0\.1\.54/],
  ['test.yml path names another installer', (d) => writeFileSync(join(d, 'test.yml'), GOOD_TEST_YML.replace(`path: ${EXE}`, 'path: other.exe')), /has path other\.exe/],
  ['test.yml files[0] names another installer', (d) => writeFileSync(join(d, 'test.yml'), GOOD_TEST_YML.replace(`- url: ${EXE}`, '- url: other.exe')), /files\[0\]\.url other\.exe/]
]

for (const [name, change, expected] of BROKEN) {
  test(`the guard stops a build when ${name}`, () => {
    withBuild(change, (dir) => {
      const problems = problemsIn(dir)
      assert.ok(problems.some((p) => expected.test(p)), problems.join(' | ') || 'no problem reported')
    })
  })
}

test('the guard stops an installer name with a space', () => {
  const spaced = `everquest companion-ce-Setup-${VERSION}.exe`
  withBuild(
    (dir) => writeFileSync(join(dir, 'test.yml'), GOOD_TEST_YML.replaceAll(EXE, spaced)),
    (dir) => assert.ok(problemsIn(dir, spaced).some((p) => /has a space/.test(p)))
  )
})

test('a dry run may lack win-unpacked; a publish may not', () => {
  withBuild(
    (dir) => rmSync(join(dir, 'win-unpacked'), { recursive: true }),
    (dir) => {
      assert.deepEqual(identityProblems({ dir, version: VERSION, exe: EXE, requireUnpacked: false }), [])
      assert.equal(identityProblems({ dir, version: VERSION, exe: EXE, requireUnpacked: true }).length, 1)
    }
  )
})
