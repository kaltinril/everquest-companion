// The app's "open an issue" links must be ones a window is allowed to open: a link the checker
// refuses opens nothing at all, and the player is left with a dead button.

import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ISSUES_URL, NEW_ISSUE_URL, newIssueUrl } from '../src/shared/issueLink.ts'
import { allowedExternalUrl } from '../src/main/security.ts'

test('the issues page and the new-issue page are links a window may open', () => {
  assert.equal(allowedExternalUrl(ISSUES_URL), ISSUES_URL)
  assert.equal(allowedExternalUrl(NEW_ISSUE_URL), NEW_ISSUE_URL)
})

test('the crash screen, which imports no app code, spells the same new-issue page', () => {
  const crash = readFileSync(new URL('../src/renderer/src/lib/ErrorBoundary.tsx', import.meta.url), 'utf8')
  assert.ok(crash.includes(`CRASH_ISSUE_URL = '${NEW_ISSUE_URL}'`))
})

test('a prefilled link keeps its text and is still allowed', () => {
  const url = newIssueUrl('Engine fault: absent', 'engine-fault: absent\n\nWhat happened & when?\n')
  const opened = allowedExternalUrl(url)
  assert.ok(opened !== null, 'the checker refused the prefilled link')
  const read = new URL(opened)
  assert.equal(read.pathname, '/kaltinril/everquest-companion/issues/new')
  assert.equal(read.searchParams.get('title'), 'Engine fault: absent')
  assert.equal(read.searchParams.get('body'), 'engine-fault: absent\n\nWhat happened & when?\n')
})

test('a very long title or body is cut, so the link is never too long to open', () => {
  const url = newIssueUrl('t'.repeat(5000), '%'.repeat(5000))
  assert.ok(url.length <= 2048, `the link is ${url.length} long`)
  assert.ok(allowedExternalUrl(url) !== null)
  assert.equal(new URL(url).searchParams.get('title'), 't'.repeat(160))
})

test('text that encodes long (non-Latin letters) still gives a link that opens', () => {
  const url = newIssueUrl('龍'.repeat(160), '龍'.repeat(1200))
  assert.ok(allowedExternalUrl(url) !== null, `the link is ${url.length} long`)
})
