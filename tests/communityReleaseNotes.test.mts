// The community build's What's new list (src/shared/communityReleaseNotes.ts).
//
// The file is generated from the `Test build` commits, so the one thing that can go wrong is a
// release cut without regenerating it: the app would then open on notes that stop one version
// short. The newest entry must be the package.json version.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { COMMUNITY_RELEASE_NOTES } from '../src/shared/communityReleaseNotes'

const pkgVersion = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version

function testNumber(version: string): number {
  const m = /-test\.(\d+)$/.exec(version)
  assert.ok(m, `not a community version: ${version}`)
  return Number(m[1])
}

test('the newest community release is the version in package.json', () => {
  assert.equal(
    COMMUNITY_RELEASE_NOTES[0]?.version,
    pkgVersion,
    'run `node scripts/community/community-release-notes.mjs` after the Test build commit'
  )
})

test('community releases are newest first, once each, with ISO dates and something to read', () => {
  const nums = COMMUNITY_RELEASE_NOTES.map((r) => testNumber(r.version))
  for (let i = 1; i < nums.length; i++) assert.ok(nums[i - 1]! > nums[i]!, `order at ${String(nums[i])}`)
  for (const r of COMMUNITY_RELEASE_NOTES) {
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/, r.version)
    assert.ok(r.title.length > 0, `${r.version} has a title`)
    const items = r.groups.reduce((n, g) => n + g.items.length, 0)
    assert.ok(items > 0 || r.intro !== undefined, `${r.version} has notes`)
  }
})
