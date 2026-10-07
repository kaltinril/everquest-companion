// LogArchiveSetting — Preferences → Game → "Summarize and archive log" (docs/plans/log-archive).
//
// OFF FOR EVERY PLAYER, and only the player turns it on, here. While it is off the card shows the
// switch and what turning it on allows, and nothing else, and the app does nothing with the log.
// While it is on, nothing happens by itself: archiving is one button, and it asks first, naming the
// file. The archive makes its own verified backup, so the card offers no separate backup or keep
// step (owner, 2026-10-06); the IPC for them stays for the trial scripts.
//
// Shown in every build since step 6.3 (owner, 2026-10-04); the switch stays off by default.

import { type JSX, useCallback, useEffect, useState } from 'react'
import { Alert, Box, Button, FormControlLabel, Stack, Switch, Typography } from '@mui/material'
import type { LogArchiveReply, LogArchiveStatus, SegmentRow } from '@shared/logArchive/panel'

function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}

function fmtDay(ms: number | null): string {
  return ms === null ? 'never' : new Date(ms).toLocaleDateString()
}

/** Two-step button: the first click shows what will happen, the second does it. */
function ConfirmButton(props: { label: string; confirm: string; disabled?: boolean; onGo: () => void; testId: string }): JSX.Element {
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return (
      <Button size="small" variant="outlined" disabled={props.disabled} data-testid={props.testId} onClick={() => setAsking(true)}>
        {props.label}
      </Button>
    )
  }
  return (
    <Stack spacing={1}>
      <Typography variant="body2">{props.confirm}</Typography>
      <Stack direction="row" spacing={1}>
        <Button size="small" variant="contained" data-testid={`${props.testId}-yes`} onClick={() => { setAsking(false); props.onGo() }}>
          Yes, go ahead
        </Button>
        <Button size="small" onClick={() => setAsking(false)}>Cancel</Button>
      </Stack>
    </Stack>
  )
}

function SegmentLine(props: { s: SegmentRow; newest: boolean; run: (p: Promise<LogArchiveReply>) => void }): JSX.Element {
  const { s } = props
  return (
    <Box data-testid={`log-archive-segment-${s.id}`}>
      <Typography variant="body2">
        {s.firstStamp.slice(0, 10)} to {s.lastStamp.slice(0, 10)}: {fmtBytes(s.logBytes)}
        {s.gzBytes !== null ? `, ${fmtBytes(s.gzBytes)} compressed` : ''}
      </Typography>
      {s.archivePath !== null && (
        <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
          {s.archivePath}
        </Typography>
      )}
      {s.gapLines > 0 && (
        <Typography variant="caption" color="text.secondary" display="block">
          {s.gapLines} line(s) written during the move are in the archive but not in the kept totals.
        </Typography>
      )}
      {s.olderEngine && (
        <Typography variant="caption" color="text.secondary" display="block">
          Recorded by version {s.app}. Later fixes to how the log is read reach this history only
          when it is refreshed.
        </Typography>
      )}
      <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
        {s.olderEngine && s.archivePath !== null && (
          <ConfirmButton
            testId="log-archive-refresh"
            label="Refresh this history"
            confirm="This reads the archived log again with this version, in the background, and replaces the kept totals with the new ones. It can take a minute or two for a big log."
            onGo={() => props.run(window.eq.logArchiveRefresh(s.id))}
          />
        )}
        {props.newest && s.archivePath !== null && (
          <ConfirmButton
            testId="log-archive-restore"
            label="Put this log back"
            confirm="This joins the archived log back onto the front of your current log, oldest first, so nothing is lost. The app then restarts to read it."
            onGo={() => props.run(window.eq.logArchiveRestore(s.id))}
          />
        )}
      </Stack>
    </Box>
  )
}

function OnPanel(props: { st: LogArchiveStatus; run: (p: Promise<LogArchiveReply>) => void }): JSX.Element {
  const { st, run } = props
  return (
    <Stack spacing={1.5}>
      {st.live !== null && (
        <Typography variant="body2" data-testid="log-archive-live">
          Your current log: {fmtBytes(st.live.bytes)}, last written {fmtDay(st.live.modifiedMs)}.
        </Typography>
      )}
      {st.dumps?.stale === true && (
        <Alert severity="info" data-testid="log-archive-dumps">
          Before archiving, run <b>/outputfile inventory</b> and <b>/outputfile factions</b> in game. Some
          counts lean on those files once the log is gone. Last inventory file: {fmtDay(st.dumps.inventoryMs)};
          last factions file: {fmtDay(st.dumps.factionsMs)}.
        </Alert>
      )}
      <Box>
        <ConfirmButton
          testId="log-archive-rotate"
          label="Archive this log and start fresh"
          disabled={st.rotateBlockers.length > 0}
          confirm={`This moves ${st.live?.path ?? 'your log'} (${fmtBytes(st.live?.bytes ?? 0)}) into ${st.dir}, compresses it, and starts a fresh log. Your kills, loot and levels keep showing. The game can stay open.`}
          onGo={() => run(window.eq.logArchiveRotate())}
        />
      </Box>
      {st.rotateBlockers.length > 0 && (
        <Typography variant="caption" color="text.secondary" data-testid="log-archive-blockers">
          Archiving is not available right now: {st.rotateBlockers.join(' ')}
        </Typography>
      )}
      {/* eslint-disable-next-line eqc/no-domain-munging -- the status lists every segment (the trial scripts read backups from it); the card shows only archived logs. */}
      {st.segments.filter((s) => s.state === 'sealed').map((s) => (
        <SegmentLine key={s.id} s={s} newest={s.id === st.newestSealedId} run={run} />
      ))}
      {st.held.map((h) => (
        <Typography key={h.id} variant="caption" color="text.secondary" display="block">
          {h.text}
        </Typography>
      ))}
      {st.skipped.map((k) => (
        <Typography key={k.file} variant="caption" color="warning.main" display="block">
          {k.file} could not be read: {k.reason}
        </Typography>
      ))}
      <Typography variant="caption" color="text.secondary">
        Archives are kept in {st.dir}. Kills, loot, levels and AA carry over. Fight details, alerts,
        and the zone and group you were in when the log was archived start fresh.
      </Typography>
    </Stack>
  )
}

export function LogArchiveSetting(): JSX.Element {
  const [st, setSt] = useState<LogArchiveStatus | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [offAsking, setOffAsking] = useState(false)

  useEffect(() => {
    void window.eq.logArchiveStatus().then(setSt)
  }, [])

  const run = useCallback((p: Promise<LogArchiveReply>) => {
    setMsg({ ok: true, text: 'Working…' })
    void p.then((r) => {
      setSt(r.status)
      setMsg({ ok: r.ok, text: r.message })
    })
  }, [])

  if (st === null) return <Typography variant="body2">Loading…</Typography>
  return (
    <Stack spacing={1.5} data-testid="pref-log-archive">
      <FormControlLabel
        control={
          <Switch
            size="small"
            data-testid="log-archive-switch"
            checked={st.enabled}
            onChange={(e) => {
              if (e.target.checked) run(window.eq.setLogArchiveEnabled(true))
              else setOffAsking(true)
            }}
          />
        }
        label={<Typography variant="body2">Summarize and archive log</Typography>}
      />
      <Typography variant="caption" color="text.secondary">
        {st.enabled
          ? 'On. Nothing happens by itself: the log is archived only when you click the button below.'
          : 'Off. When on, one button archives your EverQuest log as a compressed copy and starts a fresh, small log while your kills, loot and levels keep showing. The app never does it unless you click.'}
      </Typography>
      {offAsking && (
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2">Turn it off? Archived history stops showing; your archives stay on disk.</Typography>
          <Button size="small" variant="contained" data-testid="log-archive-off-yes" onClick={() => { setOffAsking(false); run(window.eq.setLogArchiveEnabled(false)) }}>
            Turn off
          </Button>
          <Button size="small" onClick={() => setOffAsking(false)}>Cancel</Button>
        </Stack>
      )}
      {msg !== null && <Alert severity={msg.ok ? 'success' : 'warning'}>{msg.text}</Alert>}
      {st.enabled && <OnPanel st={st} run={run} />}
    </Stack>
  )
}
