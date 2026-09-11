// spells/SpellIcon.tsx — the gem the game draws, beside the name.
//
// The owner's ask, verbatim (2026-09-10): *"spells need icons next to them"*.
//
// ONE `<img>` AND A RESERVED BOX. The bytes come from `eqimg://spell/<id>`, which main cuts out of
// the player's own EverQuest install (`src/main/spellIcons.ts` carries the whole arrangement and
// the reason there is no network in it). Three things can leave a row without a picture - no
// install, a client row that states no icon, or a custom UI whose `uifiles` lack the sheets - and
// all three draw the SAME empty box of the same size rather than a broken-image glyph, so a list
// with a few unknown spells in it does not visibly jitter.
//
// `RecentDropsCard.tsx` is the precedent and this follows it exactly, including the `failed` state:
// an `onError` that blanks the row is what keeps a 404 from painting the browser's own icon.

import { useState, type JSX } from 'react'
import { Box } from '@mui/material'

/** The client's own gem size. Drawn at 20 here: these are dense table rows, not a spell bar. */
const ICON_PX = 20

export function spellIconUrl(iconId: number): string {
  return `eqimg://spell/${String(iconId)}`
}

export default function SpellIcon({ iconId }: { iconId?: number }): JSX.Element {
  const [failed, setFailed] = useState(false)
  if (iconId === undefined || failed) {
    return <Box sx={{ width: ICON_PX, height: ICON_PX, flexShrink: 0 }} data-testid="spell-icon-none" />
  }
  return (
    <Box
      component="img"
      src={spellIconUrl(iconId)}
      alt=""
      data-testid="spell-icon"
      data-icon={iconId}
      onError={() => setFailed(true)}
      sx={{ width: ICON_PX, height: ICON_PX, flexShrink: 0, imageRendering: 'pixelated' }}
    />
  )
}
