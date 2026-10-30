// FriendsOnline — on the Overview's zone strip: which of the player's friends the last `/who` (or
// `/friends`) listing showed, and when it was printed (competitor quick wins; owner, 2026-10-29;
// shared/whoFriends.ts). The list is the player's own, typed in the popover; the listing comes live
// from main (main/whoWatch.ts) and is kept so a restart still shows it. "Seen", never "offline": a
// plain `/who` lists one zone.

import { type JSX, useEffect, useState } from 'react'
import { Box, Chip, IconButton, Popover, Stack, TextField, Tooltip, Typography } from '@mui/material'
import PeopleIcon from '@mui/icons-material/People'
import { addFriend, FRIENDS_KEY, friendsSeen, readFriends, readWhoResult, removeFriend, seenFriendNames, WHO_LAST_KEY, type WhoResult } from '@shared/whoFriends'

function load(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // A blocked store keeps this launch's answer only.
  }
}

/** The friend list and the last listing, kept in step with storage and with main. */
function useFriendsOnline(): { friends: string[]; last: WhoResult | null; setFriends: (next: string[]) => void } {
  const [friends, setFriendsState] = useState(() => readFriends(load(FRIENDS_KEY)))
  const [last, setLast] = useState(() => readWhoResult(load(WHO_LAST_KEY)))
  useEffect(() => {
    const take = (r: WhoResult | null): void => {
      if (r === null) return
      setLast((cur) => (cur !== null && cur.at > r.at ? cur : r))
      save(WHO_LAST_KEY, r)
    }
    void window.eq.whoLast().then(take).catch(() => undefined)
    return window.eq.onWhoResult(take)
  }, [])
  const setFriends = (next: string[]): void => {
    setFriendsState(next)
    save(FRIENDS_KEY, next)
  }
  return { friends, last, setFriends }
}

function when(at: number): string {
  const d = new Date(at)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return Date.now() - at < 12 * 3600_000 ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
}

export function FriendsOnline(): JSX.Element {
  const { friends, last, setFriends } = useFriendsOnline()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [typed, setTyped] = useState('')
  const rows = friendsSeen(friends, last)
  const seen = seenFriendNames(friends, last)
  const summary = friends.length === 0 ? 'Friends' : seen.length > 0 ? seen.join(', ') : 'No friends seen'
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ ml: 'auto', minWidth: 0 }} data-testid="overview-friends">
      <Tooltip title="Friends the last /who or /friends listing showed in game.">
        <IconButton size="small" aria-label="Friends" onClick={(e) => setAnchor(e.currentTarget)}>
          <PeopleIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      <Typography variant="caption" noWrap sx={{ minWidth: 0, fontWeight: seen.length > 0 ? 600 : 400 }}>
        {summary}
      </Typography>
      {friends.length > 0 && (
        <Typography variant="caption" color="text.secondary" noWrap data-testid="overview-friends-when">
          {last === null ? 'type /who in game' : `/who ${when(last.at)}`}
        </Typography>
      )}
      <Popover open={anchor !== null} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Box sx={{ p: 1.5, width: 280 }}>
          <TextField
            size="small"
            fullWidth
            label="Add a friend"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              setFriends(addFriend(friends, typed))
              setTyped('')
            }}
            slotProps={{ htmlInput: { 'data-testid': 'overview-friends-add' } }}
          />
          <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.5} sx={{ mt: 1 }}>
            {rows.map((r) => (
              <Chip key={r.name} size="small" label={r.name} color={r.seen ? 'success' : 'default'} variant={r.seen ? 'filled' : 'outlined'} onDelete={() => setFriends(removeFriend(friends, r.name))} />
            ))}
          </Stack>
        </Box>
      </Popover>
    </Stack>
  )
}
