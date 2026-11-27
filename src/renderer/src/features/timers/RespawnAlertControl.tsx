// RespawnAlertControl - the Timers tab's alert setting (shared/respawnAlert.ts): on or off, and how
// many seconds before the respawn. How it sounds is the Alerts tab's "Respawn timer ending" alert.

import { useEffect, useState, type JSX } from 'react'
import { Checkbox, FormControlLabel, Stack, TextField, Typography } from '@mui/material'
import {
  RESPAWN_ALERT_MAX_SEC,
  RESPAWN_ALERT_MIN_SEC,
  respawnAlertHeard,
  respawnAlertOffNames,
  respawnAlertLeadFromDraft,
  respawnAlertSilentNote
} from '@shared/respawnAlert'
import type { AlertDef } from '@shared/types'
import Tooltip from '../../lib/Tooltip'
import { currentDefs, onAlertStoreChange, refreshAlertStore } from '../alerts/player'
import { editRespawnAlert, useRespawnAlert } from './useRespawnAlert'

/**
 * The Alerts tab's list, read fresh when the control mounts and kept current after every change
 * there. Null until that first read lands, so the note below is never shown on a guess.
 */
function useAlertList(): AlertDef[] | null {
  const [alerts, setAlerts] = useState<AlertDef[] | null>(null)
  useEffect(() => {
    const off = onAlertStoreChange(() => setAlerts(currentDefs()))
    void refreshAlertStore().catch(() => undefined)
    return () => {
      off()
    }
  }, [])
  return alerts
}

export function RespawnAlertControl(): JSX.Element {
  const { on, leadSec } = useRespawnAlert()
  const alerts = useAlertList()
  // What is being typed. It is stored once, when the typing is finished (blur or Enter), held to
  // the bounds: storing each keystroke kept "60" out of a typed "600".
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (): void => {
    const sec = draft === null ? null : respawnAlertLeadFromDraft(draft)
    if (sec !== null && sec !== leadSec) editRespawnAlert({ leadSec: sec })
    setDraft(null)
  }
  // A ticked box with no enabled alert behind it plays nothing: say so here, where the box is.
  const note = alerts === null ? null : respawnAlertSilentNote(on, respawnAlertHeard(alerts), respawnAlertOffNames(alerts))
  // The note sits UNDER the box and the field, on its own line: beside them it took the row's room
  // and squeezed the field until its label was cut off (132 px down to 56 at the minimum window).
  return (
    <Stack spacing={0.5} sx={{ alignItems: 'flex-start', minWidth: 0 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Tooltip title="Fires the Alerts tab's Respawn timer ending alert for watched mobs in your zone.">
          <FormControlLabel
            sx={{ mr: 0, flexShrink: 0 }}
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
          label={`Seconds (${String(RESPAWN_ALERT_MIN_SEC)}-${String(RESPAWN_ALERT_MAX_SEC)})`}
          value={draft ?? String(leadSec)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
          }}
          sx={{ width: 132, flexShrink: 0 }}
          slotProps={{
            htmlInput: { min: RESPAWN_ALERT_MIN_SEC, max: RESPAWN_ALERT_MAX_SEC, 'data-testid': 'respawn-alert-lead' }
          }}
        />
      </Stack>
      {note !== null && (
        <Typography variant="caption" sx={{ color: 'warning.main' }} data-testid="respawn-alert-silent">
          {note}
        </Typography>
      )}
    </Stack>
  )
}
