// The community build's What's new list (src/shared/communityReleaseNotes.ts).
//
// The file is generated from the `Community build` (before 0.1.55, `Test build`) commits, so the one thing that can go wrong is a
// release cut without regenerating it: the app would then open on notes that stop one version
// short. The newest entry must be the package.json version.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { COMMUNITY_RELEASE_NOTES } from '../src/shared/communityReleaseNotes'
import { compareVersions } from '../src/shared/update'
import { newerFirst, versionKey } from '../scripts/community/communityVersion.mjs'

const pkgVersion = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version

test('the version order: plain 0.1.N sorts above every 0.1.0-test.N, as the updater sees it', () => {
  const newestFirst = ['0.2.0', '0.1.56', '0.1.55', '0.1.0', '0.1.0-test.54', '0.1.0-test.9']
  assert.deepEqual([...newestFirst].reverse().sort(newerFirst), newestFirst)
  // The app's own guard (src/shared/update.ts) must agree with the generator's order.
  for (let i = 1; i < newestFirst.length; i++) {
    assert.equal(compareVersions(newestFirst[i - 1], newestFirst[i]), 1, newestFirst[i])
  }
})

test('a version shape the release tooling cannot place stops it', () => {
  for (const bad of ['0.1', '0.1.55-ce.1', 'v0.1.55', '0.1.0-test', '']) {
    assert.throws(() => versionKey(bad), /not a community version/, bad)
  }
})

test('the newest community release is the version in package.json', () => {
  assert.equal(
    COMMUNITY_RELEASE_NOTES[0]?.version,
    pkgVersion,
    'run `node scripts/community/community-release-notes.mjs` after the Community build commit'
  )
})

test('community releases are newest first, once each, with ISO dates and something to read', () => {
  const versions = COMMUNITY_RELEASE_NOTES.map((r) => r.version)
  for (let i = 1; i < versions.length; i++) {
    assert.ok(newerFirst(versions[i - 1]!, versions[i]!) < 0, `order at ${versions[i]!}`)
  }
  for (const r of COMMUNITY_RELEASE_NOTES) {
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/, r.version)
    assert.ok(r.title.length > 0, `${r.version} has a title`)
    const items = r.groups.reduce((n, g) => n + g.items.length, 0)
    assert.ok(items > 0 || r.intro !== undefined, `${r.version} has notes`)
  }
})
