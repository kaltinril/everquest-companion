// aa/AaUnspentLine.tsx — the Points card's warning line (owner, 2026-11-25): the unspent count's state
// against the 50-point cap, as the nav row's "!" shows it, and the Unspent AA points alert's N beside it.

import { type JSX, useState } from 'react'
import { Stack, TextField, Typography } from '@mui/material'
import { AA_POINT_CAP, aaPointsWarnOf } from '@shared/aaPointsWarn'
import { Tooltip } from '../../lib/Tooltip'
import { useAaAlertAt, useAaUnspent } from './useAaUnspent'

const UNSPENT_TIP = 'From your log: the last "You now have" count, less purchases since.'
const ALERT_AT_TIP = "Turn on the Alerts tab's Unspent AA points alert to hear this."

/** "Unspent: N of 50" (amber from 45, red at 50) and the alert's N. */
export function AaUnspentLine(): JSX.Element | null {
  const unspent = useAaUnspent()
  const [at, setAt] = useAaAlertAt()
  const [draft, setDraft] = useState<string | null>(null)
  if (unspent === null) return null
  const warn = aaPointsWarnOf(unspent)
  const commit = (): void => {
    if (draft !== null && draft.trim() !== '') setAt(Number(draft))
    setDraft(null)
  }
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mt: 1 }}>
      <Tooltip title={warn?.tip ?? UNSPENT_TIP}>
        <Typography variant="body2" sx={{ color: warn === null ? 'text.secondary' : warn.cap ? 'error.main' : 'warning.main' }} data-testid="aa-unspent">
          {`Unspent: ${String(unspent)} of ${String(AA_POINT_CAP)}${warn === null ? '' : ' !'}`}
        </Typography>
      </Tooltip>
      <Tooltip title={ALERT_AT_TIP}>
        <TextField
          size="small"
          type="number"
          label="Alert at"
          value={draft ?? String(at)}
          onChange={(e) => {
            setDraft(e.target.value)
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
          }}
          sx={{ width: 90 }}
          slotProps={{ htmlInput: { min: 1, max: AA_POINT_CAP, 'data-testid': 'aa-alert-at' } }}
        />
      </Tooltip>
    </Stack>
  )
}
