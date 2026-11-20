// shared/guideCredits.ts - who wrote the two community tradeskill guides the Tradeskills section
// builds on (owner, 2026-11-20: "make sure we give credit to the guide author").
//
// The names are the ones each guide states for itself; `tests/guideCredits.test.mts` holds them to
// the committed copy (`src/main/data/tradeskillGuides.json`), so a guide that changes hands cannot
// keep the old credit. Shown under Preferences, Thanks, and wherever guide data is drawn.

export interface GuideCredit {
  /** the guide's id in `tradeskillGuides.json` */
  readonly id: string
  readonly title: string
  /** the author as the guide names them */
  readonly author: string
  /** the server the author plays on, as the guide states it */
  readonly server: string
  /** what of theirs the app uses */
  readonly what: string
}

export const GUIDE_CREDITS: readonly GuideCredit[] = [
  {
    id: 'eql-tradeskill-guide',
    title: 'EQ Legends Tradeskill Guide',
    author: 'Zakarsis Moonstalker',
    server: 'Neriak',
    what: 'the leveling routes: which item to make across each stretch of skill, and its notes'
  },
  {
    id: 'kerran-kornerstore',
    title: "EQL Myztikal's Kerran Kornerstore",
    author: 'Myztikal',
    server: 'Halas',
    what: 'recipes with their materials, and the merchant, zone and location each material is bought at'
  }
]

/** `EQ Legends Tradeskill Guide, by Zakarsis Moonstalker (Neriak)` - the one-line credit. */
export function guideCreditLine(credit: GuideCredit): string {
  return `${credit.title}, by ${credit.author} (${credit.server})`
}
