// Writes src/shared/communityReleaseNotes.ts from the `Test build 0.1.0-test.N:` commits.
//
// The commit body IS the release notes players read on GitHub (RELEASING.md), so the in-app
// What's new list is generated from the same text instead of being typed twice.
//
// Which releases: every `community-*` tag (test.20 on, the public ones), plus the package.json
// version when it has no tag yet (the release being prepared). For each, the NEWEST
// `Test build <version>:` commit reachable from the tag (or HEAD) is the notes, the same pick the
// publish script makes.
//
// Run from the repo root on Node 24:  node scripts/community/community-release-notes.mjs
// then commit the regenerated file. tests/communityReleaseNotes.test.mts fails the gate when the
// newest entry is not the package.json version.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const OUT = 'src/shared/communityReleaseNotes.ts'

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' })
}

function versionKey(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)-test\.(\d+)$/.exec(v)
  if (!m) throw new Error(`not a community version: ${v}`)
  return m.slice(1).map(Number)
}

function newerFirst(a, b) {
  const ka = versionKey(a)
  const kb = versionKey(b)
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i]
  return 0
}

/** The newest `Test build <version>:` commit reachable from `ref`: date, subject, body. */
function notesCommit(version, ref) {
  const raw = git('log', ref, '-1', '--date=short', '--format=%ad%x00%s%x00%b', `--grep=^Test build ${version}:`)
  if (raw.trim() === '') throw new Error(`no "Test build ${version}:" commit reachable from ${ref}`)
  const [date, subject, body] = raw.split('\0')
  return { date, title: subject.slice(subject.indexOf(':') + 1).trim(), body }
}

/** A top-level section line: an ALL-CAPS label, optionally followed by `: text`. */
function sectionHeader(line) {
  const m = /^([A-Z][A-Z0-9 .'/-]*[A-Z0-9])(?::\s*(.*))?$/.exec(line)
  return m ? { label: m[1], rest: m[2] ?? '' } : null
}

/** Split a body into its ALL-CAPS sections, each with its raw lines. */
function sections(body) {
  const out = []
  for (const line of body.replace(/\r/g, '').split('\n')) {
    const h = line.startsWith(' ') || line.startsWith('-') ? null : sectionHeader(line)
    if (h) out.push({ label: h.label, lines: h.rest ? [h.rest] : [] })
    else if (out.length > 0) out.at(-1).lines.push(line)
  }
  return out
}

const joinWrapped = (parts) => parts.join(' ').replace(/\s+/g, ' ').trim()

/**
 * One section's lines into an intro paragraph and headed groups of bullets.
 * `- ` starts a bullet, `  - ` a sub-bullet, a deeper-indented line continues the last one, and a
 * plain line at column 0 heads the next group (or, before any bullet, is the intro).
 */
function parseSection(lines) {
  const intro = []
  const groups = []
  let group = null
  let item = null
  const newGroup = (heading) => {
    group = { heading, items: [] }
    groups.push(group)
    item = null
  }
  for (const [i, line] of lines.entries()) {
    if (line.trim() === '') {
      item = null
      continue
    }
    if (line.startsWith('- ')) {
      if (!group) newGroup(null)
      item = { text: [line.slice(2)], sub: [] }
      group.items.push(item)
    } else if (/^ {2,}- /.test(line) && item) {
      item.sub.push([line.trim().slice(2)])
    } else if (line.startsWith(' ') && item) {
      lastLines(item).push(line.trim())
    } else if (groups.length === 0 && isIntro(line, lines[i + 1] ?? '')) {
      intro.push(line)
    } else {
      newGroup(line.trim())
    }
  }
  return { intro: intro.length ? joinWrapped(intro) : undefined, groups: finishGroups(groups) }
}

/** Wrapped lines joined into text; empty groups dropped. */
function finishGroups(groups) {
  return groups
    .filter((g) => g.items.length > 0)
    .map((g) => ({
      ...(g.heading ? { heading: g.heading } : {}),
      items: g.items.map((i) => ({
        text: joinWrapped(i.text),
        ...(i.sub.length ? { sub: i.sub.map(joinWrapped) } : {})
      }))
    }))
}

/** Where a wrapped line continues: the last sub-bullet once any started, else the bullet. */
const lastLines = (item) => item.sub.at(-1) ?? item.text

/**
 * Before the first bullet, a plain line is the intro when it does not head a bullet list: the
 * `NEW IN TEST.22: fixes from a review` text, not the `Combat` heading over `- Death recap`.
 */
function isIntro(line, next) {
  return !(next.startsWith('- ') && line.length < 60 && !/[.:]$/.test(line.trim()))
}

function release(version, ref, firstWithSummary) {
  const { date, title, body } = notesCommit(version, ref)
  const secs = sections(body)
  const news = secs.find((s) => s.label.startsWith('NEW IN'))
  const known = secs.find((s) => s.label === 'KNOWN ISSUES')
  const adds = secs.find((s) => s.label.startsWith('WHAT THIS BUILD ADDS'))
  const parsed = news ? parseSection(news.lines) : { groups: [] }
  // The cumulative "what the community build adds" list is shown once, on the first release that
  // carries it (test.20); the next two repeated it word for word.
  const groups = [...parsed.groups]
  if (adds && firstWithSummary) {
    const a = parseSection(adds.lines)
    groups.unshift(...a.groups.map((g) => ({ ...g, heading: g.heading ?? 'What the community build adds to the original app' })))
  }
  if (!news && !adds) throw new Error(`${version}: no NEW IN section in its notes`)
  return {
    version,
    date,
    title,
    ...(parsed.intro ? { intro: parsed.intro } : {}),
    groups,
    ...(known ? { knownIssues: joinWrapped(known.lines) } : {})
  }
}

const pkgVersion = JSON.parse(readFileSync('package.json', 'utf8')).version
const tagged = git('tag', '-l', 'community-*')
  .split('\n')
  .filter(Boolean)
  .map((t) => ({ version: t.slice('community-'.length), ref: t }))
if (!tagged.some((t) => t.version === pkgVersion)) tagged.push({ version: pkgVersion, ref: 'HEAD' })
tagged.sort((a, b) => newerFirst(a.version, b.version))

let summaryShown = false
const releases = [...tagged].reverse().map(({ version, ref }) => {
  const hasAdds = /^WHAT THIS BUILD ADDS/m.test(notesCommit(version, ref).body)
  const r = release(version, ref, hasAdds && !summaryShown)
  if (hasAdds) summaryShown = true
  return r
})
releases.reverse()

const header = `// GENERATED by scripts/community/community-release-notes.mjs from the \`Test build\` commits.
// Do not edit by hand: change the commit notes' source and regenerate (RELEASING.md, step 1).
//
// The community build's own release history, shown in Preferences -> What's new above the
// original app's. The creator's src/shared/releaseNotes.ts is his and never edited (RULES.md
// rule 13), so the fork's notes live here. Newest first.

export interface CommunityNoteItem {
  readonly text: string
  readonly sub?: readonly string[]
}

export interface CommunityNoteGroup {
  readonly heading?: string
  readonly items: readonly CommunityNoteItem[]
}

export interface CommunityRelease {
  readonly version: string
  /** ISO calendar date of the notes commit. */
  readonly date: string
  /** The one-line headline from the commit subject. */
  readonly title: string
  readonly intro?: string
  readonly groups: readonly CommunityNoteGroup[]
  readonly knownIssues?: string
}

export const COMMUNITY_RELEASE_NOTES: readonly CommunityRelease[] = `

writeFileSync(OUT, header + JSON.stringify(releases, null, 2) + '\n')
console.log(`${OUT}: ${releases.length} releases, newest ${releases[0].version}`)
