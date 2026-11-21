// FeedbackSetting: the Preferences card that says where reports go. This project takes problems
// and ideas as GitHub issues (RULES.md rule 20), so the card is one sentence and two links; a
// link opens in the player's browser through the window's external-link check (main/security.ts).

import type { JSX } from 'react'
import { Button, Stack, Typography } from '@mui/material'
import BugReportIcon from '@mui/icons-material/BugReport'
import ListAltIcon from '@mui/icons-material/ListAlt'
import { ISSUES_URL, NEW_ISSUE_URL } from '@shared/issueLink'

export function FeedbackSetting(): JSX.Element {
  return (
    <Stack spacing={1}>
      <Typography variant="body2" data-testid="prefs-feedback-note">
        Found a problem or have an idea? Open an issue on this project&apos;s GitHub page and say
        what you saw.
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Button
          size="small"
          variant="contained"
          startIcon={<BugReportIcon />}
          href={NEW_ISSUE_URL}
          target="_blank"
          rel="noreferrer"
          data-testid="prefs-feedback-new-issue"
        >
          Open a GitHub issue
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<ListAltIcon />}
          href={ISSUES_URL}
          target="_blank"
          rel="noreferrer"
          data-testid="prefs-feedback-issues"
        >
          See open issues
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Opens github.com in your browser. Posting needs a free GitHub account.
      </Typography>
    </Stack>
  )
}
