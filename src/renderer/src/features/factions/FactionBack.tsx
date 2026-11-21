// factions/FactionBack.tsx - "Back to <tab>" on the Factions tab, for the one arrival that parks
// an origin: `appRouting.openFactions(name)` (a faction's name on the Tradeskills route's Faction
// goal). Every other way onto this tab (the nav row) parks none, so this draws nothing and the tab
// is as it always was. `maps/MapBack.tsx` is the same arrangement.
//
// The same expression serves the button and the mouse's Back button (`useBackTarget`, JOS-201),
// and it says where it went (lib/navReturn) so the screen the reader left comes back as it was.

import type { JSX } from 'react'
import { Box, Button } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { useBackTarget } from '../../appBack'
import type { NavBack } from '../../appRouting'
import { noteBack } from '../../lib/navReturn'

export function FactionBack({ nav }: { nav: NavBack }): JSX.Element | null {
  const back = (): boolean => {
    const origin = nav.origin
    if (origin === null || !nav.back()) return false
    noteBack(origin.view)
    return true
  }
  useBackTarget(back)
  if (nav.origin === null) return null
  return (
    <Box sx={{ flexShrink: 0, mb: 0.5 }}>
      <Button size="small" startIcon={<ArrowBackIcon />} onClick={back} data-testid="factions-back">
        Back to {nav.origin.label}
      </Button>
    </Box>
  )
}
