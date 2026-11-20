// gear/VoidMoteView.tsx — the gear area's Void motes tab: where a Void-Touched Potential is best
// spent on what you wear.
//
// A TAB OF ITS OWN (owner, 2026-11-19). The list first shipped as a panel over the Gear tab's
// table, opened by a chip on its count line: a second list, with its own picks and order, on a
// page whose subject is the whole item catalog. It asks about the handful of things you WEAR, so it
// sits beside Exaltations and Character, with the whole tab to itself.
//
// IT OWNS NOTHING BUT THE LAYOUT. What is worn is the Gear tab's own join (`useGearCompare`, read
// at base: a mote row scales its item at the item's own `+N`), the classes are the area's shared
// pick (`useGearClasses`), and the list is `VoidMotePanel`, which any other host could mount.

import type { JSX } from 'react'
import { Box } from '@mui/material'
import { ITEM_UPGRADE_BASE } from '@shared/itemUpgrade'
import OutputKindLine from '../../components/OutputKindLine'
import { useGearClasses, useGearCompare, useGearIndex } from './gearData'
import { useVoidMotePrefs } from './useGearPrefs'
import VoidMotePanel from './VoidMotePanel'

export interface VoidMoteViewProps {
  /** an item name opens its Loot drill-down, as everywhere in the gear area */
  onOpenLoot?: (item: string) => void
}

export default function VoidMoteView({ onOpenLoot }: VoidMoteViewProps = {}): JSX.Element {
  const { rows, ready, refused } = useGearIndex()
  const classes = useGearClasses()
  const compare = useGearCompare(rows, ITEM_UPGRADE_BASE)
  const [motes, setMotes] = useVoidMotePrefs()

  return (
    <Box data-testid="void-motes-view" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, height: '100%', minHeight: 0 }}>
      {/* The list is only as true as the dump is fresh: the Gear tab's own line, for the same file. */}
      <OutputKindLine kind="inventory" quiet testId="void-motes-dump-line" />
      <VoidMotePanel
        compare={compare}
        indexReady={ready}
        indexRefused={refused}
        classes={classes.classes}
        motes={motes}
        setMotes={setMotes}
        onOpenLoot={onOpenLoot}
      />
    </Box>
  )
}
