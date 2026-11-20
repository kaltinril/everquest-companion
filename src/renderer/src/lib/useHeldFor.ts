// useHeldFor - has a state held, without a break, for a length of time? (fork #9, phase R3.)
//
// A tab whose module has no snapshot draws the log-read status line, but not at once: a rebuild of
// the same log empties a tab for a few milliseconds, and a sentence that flashed there would be
// noise. The wait is timed from when the state BEGAN, so one that ends and begins again waits again.

import { useEffect, useState } from 'react'

/** True once `active` has been true for `ms` in a row. False the moment it is not. */
export function useHeldFor(active: boolean, ms: number): boolean {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    if (!active) return undefined
    const timer = setTimeout(() => {
      setHeld(true)
    }, ms)
    return () => {
      clearTimeout(timer)
      setHeld(false)
    }
  }, [active, ms])
  return active && held
}
