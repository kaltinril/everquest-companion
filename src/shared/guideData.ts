// shared/guideData.ts — the shape of src/main/data/tradeskillGuides.json: two community tradeskill
// guides as data, written by scripts/community/guides-pull.mts at release time (owner, 2026-11-20).
// The app makes no request for them; it reads the committed file. Other players' work: every guide
// carries its author, its title and its link, and the app shows them wherever it shows the data.
//
// PURE. Types only, so main, the renderer and the pull script share one definition.

import type { Tradeskill } from './tradeskills'

/** Who wrote a guide and where it lives. */
export interface GuideCredit {
  id: string
  title: string
  author: string
  /** The game server the author names. */
  server?: string
  /** The author's own credit line, as written in the guide. */
  credit?: string
  version?: string
  /** As the guide writes it (`11/19/26`), not a parsed date. */
  lastUpdate?: string
  /** The page a player opens to read the guide. */
  sourceUrl: string
  /** When the pull that produced this copy ran (ISO 8601). */
  pulledAt: string
}

// ---- the leveling guide (a published Google Sheet) -------------------------------------------------

/** One ingredient. Sub-combine ingredients nest in `materials`. */
export interface GuideMaterial {
  name: string
  qty?: number
  /** A tool the combine gives back. */
  returned?: boolean
  /** What the guide says beside the name: a parenthesised remark, a source, a trivial. */
  note?: string
  /** The cell as written, when `name` is not the whole of it. */
  text?: string
  materials?: GuideMaterial[]
}

/** One rung of the ladder: make `item` from skill `from` to skill `to`. */
export interface GuideStep {
  from: number
  /** Absent when the guide's upper bound is not a number (`189 - see side`). */
  to?: number
  /** The range cell as written, when it is not `from - to`. */
  range?: string
  item: string
  note?: string
  text?: string
  materials: GuideMaterial[]
}

/** Cells beside the ladder that belong to no step (a side table), kept as written. */
export interface GuideAside {
  /** Column letter of the first cell. */
  col: string
  cells: string[]
}

export interface GuideLadder {
  notes: string[]
  steps: GuideStep[]
  alternates: GuideStep[]
  asides?: GuideAside[]
  /** Rows the parser could not place, cells joined with ` | `. */
  unparsed?: string[]
}

export interface GuideOverviewSection {
  heading?: string
  lines: string[]
}

export interface LevelingGuide extends GuideCredit {
  overview: GuideOverviewSection[]
  tradeskills: Partial<Record<Tradeskill, GuideLadder>>
}

// ---- the recipe book (an OpenDocument spreadsheet) --------------------------------------------------

export interface RecipeMaterial {
  name: string
  qty?: number
  /** A tool the combine gives back (the guide writes `Reusable`). */
  returned?: boolean
  /** Set together with `loc`: a named merchant at a stated place. */
  merchant?: string
  /** The Merchant Zone cell as written; not always a zone name. */
  zone?: string
  /** Coordinates as written (`-176, 207, 17`). */
  loc?: string
  /** The merchant cell when it names no located merchant: `Crafted (Blacksmithing)`, `Farmed`. */
  sourceText?: string
  notes?: string[]
}

export interface GuideRecipe {
  /** The skill level at which the item stops giving skill-ups. Absent when the guide states none. */
  trivial?: number
  /** Set when the recipe belongs to another tradeskill than the tab it sits on. */
  tradeskill?: Tradeskill
  /** The heading the recipe sits under (`Useful Alchemy`). */
  section?: string
  item: string
  notes: string[]
  materials: RecipeMaterial[]
}

export interface RecipeList {
  notes?: string[]
  recipes: GuideRecipe[]
  unparsed?: string[]
}

export interface RecipeBook extends GuideCredit {
  tradeskills: Partial<Record<Tradeskill, RecipeList>>
}

// ---- the file --------------------------------------------------------------------------------------

export interface TradeskillGuidesFile {
  /** One line on where the file comes from; it is never edited by hand. */
  about: string
  leveling: LevelingGuide
  recipes: RecipeBook
}
