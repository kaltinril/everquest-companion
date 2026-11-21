// NavMenuSetting - Preferences > Appearance > Left menu (fork #10): the menu's own text size and
// row height. Both are localStorage values (components/useNavMenu.ts), so the drawer beside this
// card moves on the press. ONE BORDER: PreferencesView wraps each item, so this is a bare Stack.

import { type JSX } from 'react'
import { Stack, Typography } from '@mui/material'
import {
  NAV_ROW_DEFAULT,
  NAV_ROW_KEY,
  NAV_ROW_STEPS,
  NAV_TEXT_DEFAULT,
  NAV_TEXT_KEY,
  NAV_TEXT_STEPS,
  navPx
} from '@shared/navMenu'
import { useNavStep } from '../../components/useNavMenu'
import { PrefStepper } from './PrefStepper'
import type { PrefItem } from './PreferencesView'

/** A labelled row with one stepper on the right, the shape the Overlays card's rows have. */
function Row({ label, children }: { label: string; children: JSX.Element }): JSX.Element {
  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0 }} noWrap>
        {label}
      </Typography>
      {children}
    </Stack>
  )
}

function NavMenuSetting(): JSX.Element {
  const [text, stepText] = useNavStep(NAV_TEXT_KEY, NAV_TEXT_STEPS, NAV_TEXT_DEFAULT)
  const [row, stepRow] = useNavStep(NAV_ROW_KEY, NAV_ROW_STEPS, NAV_ROW_DEFAULT)
  return (
    <Stack spacing={0.5}>
      <Row label="Text size">
        <PrefStepper
          kind="size"
          value={navPx(text)}
          name="the left menu"
          atMin={text <= Math.min(...NAV_TEXT_STEPS)}
          atMax={text >= Math.max(...NAV_TEXT_STEPS)}
          onStep={stepText}
          testid="pref-nav-text"
        />
      </Row>
      <Row label="Row height">
        <PrefStepper
          kind="spacing"
          value={navPx(row)}
          name="the left menu"
          atMin={row <= Math.min(...NAV_ROW_STEPS)}
          atMax={row >= Math.max(...NAV_ROW_STEPS)}
          onStep={stepRow}
          testid="pref-nav-row"
        />
      </Row>
      <Typography variant="caption" color="text.secondary" data-testid="pref-nav-note">
        This sizes the left menu only; the text size above still scales it.
      </Typography>
    </Stack>
  )
}

/** The Appearance section's item. The section passes its own size words in for the search. */
export function navMenuItem(sizeWords: string): PrefItem {
  return {
    id: 'nav-menu',
    label: 'Left menu',
    keywords: `${sizeWords} menu sidebar side bar left nav navigation drawer tabs rows row height taller shorter menu size row spacing spacious gap gaps compact dense density tight height padding`,
    content: <NavMenuSetting />
  }
}
