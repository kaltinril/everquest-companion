// useSecondsClock — the local 1 Hz clock every countdown reads: the Timers tab, the respawn
// overlay and the buffs overlay. A timer must recede while the log is idle, which is exactly when
// no delta is coming; every row already carries its own start, so this costs one render a second
// and zero IPC. In lib/ so the overlay bundle can use it without the Timers tab's data seam.

import { useEffect, useState } from 'react'

/** One shared 1 Hz clock. Every countdown on the surface reads this and nothing else. */
export function useSecondsClock(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => {
      clearInterval(id)
    }
  }, [])
  return now
}
