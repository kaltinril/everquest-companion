// DropObsSetting — Preferences → Game → "Send my loot to the wiki"
// (docs/community/requirements/drop-db-submit.md; main/dropObs/service.ts; words in dropObsView.ts).
//
// OFF FOR EVERY PLAYER. While the switch is off nothing goes to the wiki; the card still shows how
// much loot is ready, so the player knows what turning it on sends.
//
// THE FLOW: until a sign-in has worked, the card is two numbered steps (make a Bot password on the
// wiki; paste its user name and password, one button saves and signs in). After that the steps fold
// into one "Signed in as …" line with Change and Remove, and the switch and the live status take the
// card. Turning the switch on signs in first when the saved sign-in has not worked yet. The status is
// asked again every few seconds while the card is open, so the count runs down as batches go.
//
// The password is encrypted on this computer and never shown again. Links open the system browser
// (main's window-open handler), like every other wiki link in the app.

import { type JSX, type ReactNode, useCallback, useEffect, useState } from 'react'
import { Alert, Box, Button, Collapse, FormControlLabel, Link, Stack, Switch, TextField, Typography } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { BOT_PASSWORDS_URL, DROP_DATABASE_URL, type DropObsReply, type DropObsStatus } from '@shared/dropObs'
import { fmtCount, keptReason, progressView, setupStage, type ProgressTone } from './dropObsView'

const POLL_MS = 5000
const GRANT = 'Submit attributed gameplay observations'

type Run = (p: Promise<DropObsReply>) => Promise<DropObsReply>

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const

function Step(props: { n: number; title: string; children: ReactNode }): JSX.Element {
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'flex-start' }}>
      <Box
        sx={{
          flex: '0 0 auto',
          width: 22,
          height: 22,
          borderRadius: '50%',
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          fontSize: 13,
          fontWeight: 600,
          display: 'grid',
          placeItems: 'center',
          mt: '1px'
        }}
      >
        {props.n}
      </Box>
      <Stack spacing={0.75} sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {props.title}
        </Typography>
        {props.children}
      </Stack>
    </Stack>
  )
}

/** Step 1: what to do on the wiki, in the order its pages ask. */
function MakeBotPassword(): JSX.Element {
  return (
    <Typography variant="caption" color="text.secondary" component="div">
      Sign in to the wiki, open{' '}
      <Link href={BOT_PASSWORDS_URL} {...ext}>
        Special:BotPasswords
      </Link>
      , type a name such as <b>Companion</b> and press Create. Tick only <b>{GRANT}</b>, then Create again. The wiki
      shows a user name like <b>YourName@Companion</b> and a password: you need both. Never use your main wiki
      password here.
    </Typography>
  )
}

/** Whether the one button can go, and what it says: Sign in when the saved pair is kept as it is. */
function signInButton(st: DropObsStatus, user: string, pass: string, busy: boolean): { canSubmit: boolean; label: string } {
  const name = user.trim()
  const keepSaved = st.hasPassword && pass === '' && name === st.username
  const canSubmit = !busy && st.encryptionAvailable && name !== '' && (pass !== '' || st.hasPassword)
  return { canSubmit, label: busy ? 'Signing in…' : keepSaved ? 'Sign in' : 'Save and sign in' }
}

/** Step 2 (and Change): the user name and password, one button that saves and signs in. */
function SignInFields(props: { st: DropObsStatus; run: Run; onDone?: () => void }): JSX.Element {
  const { st, run, onDone } = props
  const [user, setUser] = useState(st.username)
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const { canSubmit, label } = signInButton(st, user, pass, busy)
  const submit = (): void => {
    if (!canSubmit) return
    setBusy(true)
    void run(window.eq.dropObsSaveAccount(user, pass)).then(async (r) => {
      if (r.ok) {
        setPass('')
        const t = await run(window.eq.dropObsTest())
        if (t.ok) onDone?.()
      }
      setBusy(false)
    })
  }
  const noAt = user.trim() !== '' && !user.includes('@')
  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        <TextField
          size="small"
          label="Bot user name"
          placeholder="YourName@Companion"
          value={user}
          error={noAt}
          helperText={noAt ? 'It has an @ in it, like YourName@Companion' : undefined}
          onChange={(e) => setUser(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          slotProps={{ htmlInput: { 'data-testid': 'drop-obs-user', spellCheck: false } }}
        />
        <TextField
          size="small"
          type="password"
          label="Bot password"
          placeholder={st.hasPassword ? 'saved (leave empty to keep)' : ''}
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          slotProps={{ htmlInput: { 'data-testid': 'drop-obs-pass', autoComplete: 'off' } }}
        />
      </Stack>
      <Stack direction="row" spacing={1}>
        <Button size="small" variant="contained" data-testid="drop-obs-save" disabled={!canSubmit} onClick={submit}>
          {label}
        </Button>
        {onDone !== undefined && st.signedInAs !== '' && (
          <Button size="small" onClick={onDone}>
            Cancel
          </Button>
        )}
      </Stack>
      {!st.encryptionAvailable && (
        <Typography variant="caption" color="warning.main">
          This computer cannot encrypt a saved password, so the sign-in cannot be saved.
        </Typography>
      )}
    </Stack>
  )
}

const TONE_FG: Record<ProgressTone, string> = { info: 'text.primary', busy: 'text.primary', done: 'success.main', warn: 'warning.main' }

/** The live status, the Sign in again button after a stop, and the reports the wiki did not take. */
function StatusBox(props: { st: DropObsStatus; run: Run }): JSX.Element {
  const { st, run } = props
  const [showKept, setShowKept] = useState(false)
  const view = progressView(st, Date.now())
  return (
    <Box sx={{ p: 1.25, borderRadius: 1, bgcolor: 'action.hover' }} data-testid="drop-obs-status">
      <Typography variant="body2" sx={{ color: TONE_FG[view.tone] }}>
        {view.headline}
      </Typography>
      {view.detail !== null && (
        <Typography variant="caption" color="text.secondary" display="block">
          {view.detail}
        </Typography>
      )}
      {st.stopped !== null && (
        <Button size="small" variant="outlined" sx={{ mt: 1 }} data-testid="drop-obs-retry" onClick={() => void run(window.eq.dropObsTest())}>
          Sign in again
        </Button>
      )}
      {st.kept > 0 && (
        <Box sx={{ mt: 0.75 }}>
          <Link component="button" type="button" variant="caption" onClick={() => setShowKept((v) => !v)} data-testid="drop-obs-kept-toggle">
            {showKept ? 'Hide' : 'Show'} {fmtCount(st.kept)} the wiki did not take
          </Link>
          <Collapse in={showKept} unmountOnExit>
            <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5, maxHeight: 180, overflowY: 'auto' }}>
              {st.keptItems.map((k, i) => (
                <Typography component="li" variant="caption" color="text.secondary" key={`${k.observedAt}-${String(i)}`}>
                  {k.item} from {k.npc}, {new Date(k.observedAt).toLocaleString()}: {keptReason(k.code)}
                </Typography>
              ))}
            </Box>
            {st.kept > st.keptItems.length && (
              <Typography variant="caption" color="text.secondary">
                Showing the newest {fmtCount(st.keptItems.length)}.
              </Typography>
            )}
          </Collapse>
        </Box>
      )}
    </Box>
  )
}

export function DropObsSetting(): JSX.Element {
  const [st, setSt] = useState<DropObsStatus | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let live = true
    const read = (): void => void window.eq.dropObsStatus().then((s) => live && setSt(s))
    read()
    const t = setInterval(read, POLL_MS)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [])

  const run = useCallback<Run>(async (p) => {
    setMsg(null)
    const r = await p
    setSt(r.status)
    setMsg({ ok: r.ok, text: r.message })
    return r
  }, [])

  // A success note says its piece and goes; a failure stays until the next action.
  useEffect(() => {
    if (msg?.ok !== true) return
    const t = setTimeout(() => setMsg(null), 6000)
    return () => clearTimeout(t)
  }, [msg])

  if (st === null) return <Typography variant="body2">Loading…</Typography>
  const stage = setupStage(st)
  const signedIn = stage === 'signed-in'
  return (
    <Stack spacing={1.5} data-testid="pref-drop-obs">
      <Typography variant="caption" color="text.secondary">
        Sends the loot you take off corpses (zone, corpse, item, count, time) to the wiki, so its loot lists show real drop
        rates. No character name, chat or log lines are sent. Loot already in your log is sent too, newest first. See the
        results on the wiki&apos;s{' '}
        <Link href={DROP_DATABASE_URL} {...ext}>
          drop list
        </Link>
        .
      </Typography>

      {!signedIn || editing ? (
        <Stack spacing={1.5}>
          {!editing && (
            <Step n={1} title="Make a Bot password on the wiki">
              <MakeBotPassword />
            </Step>
          )}
          <Step n={editing ? 1 : 2} title={editing ? 'Change the sign-in' : 'Paste it here'}>
            <SignInFields st={st} run={run} onDone={editing ? () => setEditing(false) : undefined} />
          </Step>
        </Stack>
      ) : (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} data-testid="drop-obs-signed-in">
          <CheckCircleIcon fontSize="small" color="success" />
          <Typography variant="body2">
            Signed in as <b>{st.signedInAs}</b>
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ({st.username})
          </Typography>
          <Button size="small" onClick={() => setEditing(true)}>
            Change
          </Button>
          <Button size="small" color="inherit" data-testid="drop-obs-forget" onClick={() => void run(window.eq.dropObsForget())}>
            Remove
          </Button>
        </Stack>
      )}

      <Stack spacing={0.25}>
        <FormControlLabel
          control={
            <Switch
              size="small"
              data-testid="drop-obs-switch"
              checked={st.enabled}
              disabled={stage === 'no-sign-in' && !st.enabled}
              onChange={(e) => void run(window.eq.setDropObsEnabled(e.target.checked))}
            />
          }
          label={<Typography variant="body2">Send my loot to the wiki</Typography>}
        />
        {stage === 'no-sign-in' && !st.enabled && (
          <Typography variant="caption" color="text.secondary">
            Sign in above first.
          </Typography>
        )}
      </Stack>

      <StatusBox st={st} run={run} />
      {msg !== null && (
        <Alert severity={msg.ok ? 'success' : 'warning'} onClose={() => setMsg(null)}>
          {msg.text}
        </Alert>
      )}
    </Stack>
  )
}
