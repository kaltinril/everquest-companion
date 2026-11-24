// DropObsSetting — Preferences → Game → "Send loot to the wiki's drop database"
// (docs/community/requirements/drop-db-submit.md; main/dropObs/service.ts).
//
// OFF FOR EVERY PLAYER. While the switch is off nothing goes to the wiki; the card still shows how
// much loot is ready, so the player knows what turning it on sends. The sign-in is a wiki Bot
// password (Special:BotPasswords) with only the observation-submission grant; the password is
// encrypted on this computer and never shown again. Links open the system browser (main's
// window-open handler), like every other wiki link in the app.

import { type JSX, useCallback, useEffect, useState } from 'react'
import { Alert, Box, Button, FormControlLabel, Link, Stack, Switch, TextField, Typography } from '@mui/material'
import { BOT_PASSWORDS_URL, DROP_DATABASE_URL, type DropObsReply, type DropObsStatus } from '@shared/dropObs'

/** `12 ready to send · 340 delivered · 2 kept for review · last error eoz-rate-limit` */
function statusLine(st: DropObsStatus): string {
  const parts = [
    st.ready === null ? 'loot not readable yet' : `${String(st.ready + st.inFlight)} ready to send`,
    `${String(st.delivered)} delivered`,
    `${String(st.kept)} kept for review`
  ]
  if (st.lastError !== null) parts.push(`last error ${st.lastError}`)
  return parts.join(' · ')
}

function retryNote(st: DropObsStatus): string | null {
  if (st.nextAttemptAt === 0) return null
  return `Trying again at ${new Date(st.nextAttemptAt).toLocaleTimeString()}.`
}

function AccountFields(props: { st: DropObsStatus; run: (p: Promise<DropObsReply>) => void }): JSX.Element {
  const { st, run } = props
  const [user, setUser] = useState(st.username)
  const [pass, setPass] = useState('')
  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        <TextField
          size="small"
          label="Bot password user name"
          placeholder="Name@Label"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          slotProps={{ htmlInput: { 'data-testid': 'drop-obs-user', spellCheck: false } }}
        />
        <TextField
          size="small"
          type="password"
          label="Bot password"
          placeholder={st.hasPassword ? 'saved (leave empty to keep)' : ''}
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          slotProps={{ htmlInput: { 'data-testid': 'drop-obs-pass', autoComplete: 'off' } }}
        />
      </Stack>
      <Stack direction="row" spacing={1}>
        <Button
          size="small"
          variant="outlined"
          data-testid="drop-obs-save"
          disabled={!st.encryptionAvailable}
          onClick={() => {
            run(window.eq.dropObsSaveAccount(user, pass))
            setPass('')
          }}
        >
          Save
        </Button>
        <Button size="small" variant="outlined" data-testid="drop-obs-test" disabled={!st.hasPassword} onClick={() => run(window.eq.dropObsTest())}>
          Test sign-in
        </Button>
      </Stack>
      {!st.encryptionAvailable && (
        <Typography variant="caption" color="warning.main">
          This computer cannot encrypt a saved password, so the sign-in cannot be saved.
        </Typography>
      )}
    </Stack>
  )
}

export function DropObsSetting(): JSX.Element {
  const [st, setSt] = useState<DropObsStatus | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    void window.eq.dropObsStatus().then(setSt)
  }, [])

  const run = useCallback((p: Promise<DropObsReply>) => {
    setMsg({ ok: true, text: 'Working…' })
    void p.then((r) => {
      setSt(r.status)
      setMsg({ ok: r.ok, text: r.message })
    })
  }, [])

  if (st === null) return <Typography variant="body2">Loading…</Typography>
  const retry = retryNote(st)
  return (
    <Stack spacing={1.5} data-testid="pref-drop-obs">
      <Typography variant="caption" color="text.secondary">
        Sends the loot you take off corpses (zone, corpse, item, count, time) to the wiki, so its loot lists get their
        percentages. No character name, chat or log lines are sent. Your log&apos;s past loot is sent too, newest
        first. See what the wiki has at the{' '}
        <Link href={DROP_DATABASE_URL} target="_blank" rel="noopener noreferrer">
          drop database
        </Link>
        .
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Sign in with a wiki Bot password: create one at{' '}
        <Link href={BOT_PASSWORDS_URL} target="_blank" rel="noopener noreferrer">
          Special:BotPasswords
        </Link>{' '}
        and give it only the observation-submission grant. Never your main wiki password.
      </Typography>
      <AccountFields st={st} run={run} />
      <FormControlLabel
        control={
          <Switch
            size="small"
            data-testid="drop-obs-switch"
            checked={st.enabled}
            disabled={!st.hasPassword && !st.enabled}
            onChange={(e) => run(window.eq.setDropObsEnabled(e.target.checked))}
          />
        }
        label={<Typography variant="body2">Send my loot to the drop database</Typography>}
      />
      <Box sx={{ p: 1.25, borderRadius: 1, bgcolor: 'action.hover' }}>
        <Typography variant="body2" data-testid="drop-obs-status">
          {statusLine(st)}
        </Typography>
        {st.stopped !== null && (
          <Typography variant="caption" color="warning.main" display="block" data-testid="drop-obs-stopped">
            Stopped: {st.stopped}
          </Typography>
        )}
        {retry !== null && st.stopped === null && (
          <Typography variant="caption" color="text.secondary" display="block">
            {retry}
          </Typography>
        )}
      </Box>
      {msg !== null && <Alert severity={msg.ok ? 'success' : 'warning'}>{msg.text}</Alert>}
    </Stack>
  )
}
