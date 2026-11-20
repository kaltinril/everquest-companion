// The guide credits name the authors the committed guides name (owner, 2026-11-20: "make sure we
// give credit to the guide author").

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { GUIDE_CREDITS, guideCreditLine } from '../src/shared/guideCredits'

interface GuideAbout {
  id: string
  title: string
  author: string
  server: string
}

function guidesInData(): GuideAbout[] {
  const data = JSON.parse(readFileSync(new URL('../src/main/data/tradeskillGuides.json', import.meta.url), 'utf8')) as Record<string, unknown>
  return Object.values(data).filter((v): v is GuideAbout => typeof v === 'object' && v !== null && 'id' in v && 'author' in v)
}

test('every guide in the committed data has a credit, and every credit names a guide in the data', () => {
  const guides = guidesInData()
  assert.ok(guides.length >= 2, 'the data file holds the two guides')
  assert.deepEqual(GUIDE_CREDITS.map((c) => c.id).sort(), guides.map((g) => g.id).sort())
})

test('a credit states the title, author and server the guide states for itself', () => {
  for (const guide of guidesInData()) {
    const credit = GUIDE_CREDITS.find((c) => c.id === guide.id)
    assert.ok(credit, `${guide.id} is credited`)
    assert.equal(credit.title, guide.title)
    // The leveling guide signs with the character's race and classes after the name.
    assert.ok(guide.author.startsWith(credit.author), `${guide.id}: "${guide.author}" starts with "${credit.author}"`)
    assert.equal(credit.server, guide.server)
  }
})

test('the one-line credit reads title, author, server', () => {
  assert.equal(guideCreditLine(GUIDE_CREDITS[0]), 'EQ Legends Tradeskill Guide, by Zakarsis Moonstalker (Neriak)')
})
