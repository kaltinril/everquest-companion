// The community build's own release history, at the top of Preferences -> What's new.
//
// The original app's notes (shared/releaseNotes.ts) stop at the last release its creator made,
// and that file is never edited here (docs/community/RULES.md rule 13), so without this the panel
// showed none of this build's releases. The data is generated from the `Test build` commits
// (scripts/community/community-release-notes.mjs). Known issues are shown for the newest release
// only: each release's list replaces the one before.

import type { JSX } from 'react'
import { Box, Divider, Stack, Typography } from '@mui/material'
import {
  COMMUNITY_RELEASE_NOTES,
  type CommunityNoteGroup,
  type CommunityRelease
} from '@shared/communityReleaseNotes'
import { formatCalendarDate } from '../../lib/formatDate'

function Bullets({ items }: { items: CommunityNoteGroup['items'] }): JSX.Element {
  return (
    <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
      {items.map((item) => (
        <Box
          component="li"
          key={item.text}
          data-testid="community-bullet"
          sx={{ display: 'list-item', listStyleType: 'disc', ml: 2.5, pl: 0.5 }}
        >
          <Typography variant="body2" component="span">
            {item.text}
          </Typography>
          {item.sub !== undefined && (
            <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
              {item.sub.map((s) => (
                <Box component="li" key={s} sx={{ display: 'list-item', listStyleType: 'circle', ml: 2.5, pl: 0.5 }}>
                  <Typography variant="body2" component="span">
                    {s}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  )
}

function CommunityReleaseBlock({ note, latest }: { note: CommunityRelease; latest: boolean }): JSX.Element {
  return (
    <Stack spacing={0.75} data-testid={`community-release-${note.version}`}>
      <Stack direction="row" alignItems="baseline" spacing={1} flexWrap="wrap">
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          v{note.version}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatCalendarDate(note.date)}
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
        {note.title}
      </Typography>
      {note.intro !== undefined && <Typography variant="body2">{note.intro}</Typography>}
      {note.groups.map((g, i) => (
        <Stack key={`${g.heading ?? ''}-${String(i)}`} spacing={0.25}>
          {g.heading !== undefined && (
            <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 0.5 }} color="text.secondary">
              {g.heading}
            </Typography>
          )}
          <Bullets items={g.items} />
        </Stack>
      ))}
      {latest && note.knownIssues !== undefined && (
        <Stack spacing={0.25} data-testid="community-known-issues">
          <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 0.5 }} color="text.secondary">
            Known issues
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {note.knownIssues}
          </Typography>
        </Stack>
      )}
    </Stack>
  )
}

/** Every community release, newest first, then a heading over the original app's history. */
export function CommunityReleases(): JSX.Element {
  return (
    <>
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.5 }}>
        Community build
      </Typography>
      {COMMUNITY_RELEASE_NOTES.map((note, i) => (
        <Box key={note.version}>
          {i > 0 && <Divider sx={{ mb: 1.5 }} />}
          <CommunityReleaseBlock note={note} latest={i === 0} />
        </Box>
      ))}
      <Divider sx={{ mt: 1 }} />
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.5 }}>
        The original app (by jmoyers, no longer updated)
      </Typography>
    </>
  )
}
