// macros/useGameFiles.ts — the game's character files as main read them, and when.
// Read once when the tab opens and again on every `reload`.

import { useCallback, useEffect, useState } from 'react'
import type { GameMacroFiles } from '@shared/macros/types'

export interface GameFilesState {
  /** Null until main has answered the first read. */
  reply: GameMacroFiles | null
  /** When the reply landed (epoch ms). */
  readAt: number | null
  reading: boolean
  reload: () => void
}

export function useGameFiles(): GameFilesState {
  const [reply, setReply] = useState<GameMacroFiles | null>(null)
  const [readAt, setReadAt] = useState<number | null>(null)
  const [reading, setReading] = useState(false)
  const [ask, setAsk] = useState(0)

  useEffect(() => {
    let live = true
    setReading(true)
    const land = (next: GameMacroFiles): void => {
      if (!live) return
      setReply(next)
      setReadAt(Date.now())
      setReading(false)
    }
    window.eq.macrosGameFiles().then(land, () => {
      land({ gameFolder: null, files: [], reason: 'unreadable' })
    })
    return () => {
      live = false
    }
  }, [ask])

  const reload = useCallback(() => {
    setAsk((n) => n + 1)
  }, [])
  return { reply, readAt, reading, reload }
}
