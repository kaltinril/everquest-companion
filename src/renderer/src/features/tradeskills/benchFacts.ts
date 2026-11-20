// tradeskills/benchFacts.ts — what every line of a workbench reads, handed down once: the recipe
// book, the inventory dump's counts, the era setting, the player's own combines and merchant
// prices (the engine's `crafting` module), and the two community guides.

import { createContext, useContext } from 'react'
import type { BookIndex } from '@shared/tradeskillBook'
import type { GuideIndex } from '@shared/tradeskillGuide'
import type { CraftBook } from '@shared/tradeskillHistory'
import type { MoneyBook } from '@shared/tradeskillMoney'
import type { HeldState } from './tradeskillData'

export interface BenchFacts {
  index: BookIndex
  held: HeldState
  eraOnly: boolean
  craft: CraftBook
  money: MoneyBook
  guides: GuideIndex
}

const FactsContext = createContext<BenchFacts | null>(null)

export const FactsProvider = FactsContext.Provider

export function useFacts(): BenchFacts {
  const facts = useContext(FactsContext)
  if (facts === null) throw new Error('tradeskills: a workbench line outside its facts')
  return facts
}
