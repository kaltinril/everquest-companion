// RespawnAlertControl - the Timers tab's alert setting (shared/respawnAlert.ts): on or off, and how
// many seconds before the respawn. How it sounds is the Alerts tab's "Respawn timer ending" alert.

import { useState, type JSX } from 'react'
import { Checkbox, FormControlLabel, Stack, TextField, Typography } from '@mui/material'
import { RESPAWN_ALERT_MAX_SEC, RESPAWN_ALERT_MIN_SEC, respawnAlertLeadOk } from '@shared/respawnAlert'
import Tooltip from '../../lib/Tooltip'
import { editRespawnAlert, useRespawnAlert } from './useRespawnAlert'

export function RespawnAlertControl(): JSX.Element {
  const { on, leadSec } = useRespawnAlert()
  // What is being typed. Only a lead inside the bounds is stored; anything else goes on blur.
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Tooltip title="Fires the Alerts tab's Respawn timer ending alert for every watched mob.">
        <FormControlLabel
          sx={{ mr: 0 }}
          control={
            <Checkbox
              size="small"
              checked={on}
              onChange={(_e, next) => editRespawnAlert({ on: next })}
              sx={{ p: 0.5 }}
              data-testid="respawn-alert-on"
            />
          }
          label={<Typography variant="caption">Alert before respawn</Typography>}
        />
      </Tooltip>
      <TextField
        size="small"
        type="number"
        label="Seconds"
        value={draft ?? String(leadSec)}
        onChange={(e) => {
          setDraft(e.target.value)
          const sec = Number(e.target.value)
          if (respawnAlertLeadOk(sec)) editRespawnAlert({ leadSec: sec })
        }}
        onBlur={() => setDraft(null)}
        sx={{ width: 96 }}
        slotProps={{
          htmlInput: { min: RESPAWN_ALERT_MIN_SEC, max: RESPAWN_ALERT_MAX_SEC, 'data-testid': 'respawn-alert-lead' }
        }}
      />
    </Stack>
  )
}
