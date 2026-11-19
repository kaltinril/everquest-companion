// RespawnAlertWatcher - fires the 'respawnSoon' app signal once per clock as its lead moment
// passes (shared/respawnAlert.ts), mounted for the life of the window (AppCelebrations). The
// reader, and its respawn module subscription, is mounted only while the setting is on. Its clock
// is main's tick, not a renderer interval: a minimized window may slow its own timers.

import { useEffect, useRef, type JSX } from 'react'
import type { RespawnSnap } from '@shared/respawn'
import { respawnAlertsDue } from '@shared/respawnAlert'
import { useModule } from '../../lib/useModule'
import { fireAppSignal } from '../alerts/player'
import { useRespawnAlert } from './useRespawnAlert'

export default function RespawnAlertWatcher(): JSX.Element | null {
  const { on, leadSec } = useRespawnAlert()
  return on ? <ClockReader leadSec={leadSec} /> : null
}

function ClockReader({ leadSec }: { leadSec: number }): null {
  const snap = useModule<RespawnSnap>('respawn')
  const live = useRef({ snap, leadSec })
  live.current = { snap, leadSec }

  useEffect(() => {
    // The first tick after mounting is a baseline; a clock fires once however its estimate moves.
    let prevMs: number | null = null
    const fired = new Set<string>()
    return window.eq.onRespawnAlertTick((nowMs) => {
      const now = live.current
      const due = now.snap === null ? [] : respawnAlertsDue(now.snap, now.leadSec, prevMs, nowMs)
      prevMs = nowMs
      for (const d of due) {
        if (fired.has(d.key)) continue
        fired.add(d.key)
        fireAppSignal('respawnSoon', d.context, d.captures)
      }
    })
  }, [])

  return null
}
