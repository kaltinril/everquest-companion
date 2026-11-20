// maps/MapBack.tsx — "Back to <tab>" on the Maps tab, for the one arrival that parks an origin:
// `appRouting.openMapAt` (the Tradeskills section's "Show on map"). Every other way onto this tab
// (the nav row, `openMapZone`) parks none, so this draws nothing and the tab is as it always was.
//
// The same expression serves the button and the mouse's Back button (`useBackTarget`, JOS-201),
// and it says where it went (lib/navReturn) so the screen the reader left comes back as it was.

import type { JSX } from 'react'
import { Box, Button } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { useBackTarget } from '../../appBack'
import type { NavBack } from '../../appRouting'
import { noteBack } from '../../lib/navReturn'

export function MapBack({ nav }: { nav: NavBack }): JSX.Element | null {
  const back = (): boolean => {
    const origin = nav.origin
    if (origin === null || !nav.back()) return false
    noteBack(origin.view)
    return true
  }
  useBackTarget(back)
  if (nav.origin === null) return null
  return (
    <Box sx={{ flexShrink: 0 }}>
      <Button size="small" startIcon={<ArrowBackIcon />} onClick={back} data-testid="maps-back">
        Back to {nav.origin.label}
      </Button>
    </Box>
  )
}
