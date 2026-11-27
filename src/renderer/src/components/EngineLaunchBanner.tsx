// ============================================================================
// EngineLaunchBanner — the two states the cutover created, drawn honestly (JOS-503).
// ============================================================================
//
// ONE COMPONENT, TWO STATES, AND THE SHELL OWNS IT. Every panel in the product reads a fold that
// lives in another process now, so "the engine is not answering yet" and "the engine is never going
// to answer" are facts about the WHOLE WINDOW rather than about any one surface. A per-panel
// loading spinner repeated twenty times would say the same thing twenty times and still not say the
// interesting half — how long, or why not.
//
// ── WHY A BAND AND NOT A SNACKBAR ─────────────────────────────────────────────────────────────
//
// `WhatsNewTeaser` and `TelemetryNotice` float over the content along the bottom edge, and their
// header states the rule they are obeying: this app must never interrupt play, and even a banner
// that pushed the layout down would move a meter somebody is reading. THAT RULE DOES NOT REACH
// EITHER OF THESE STATES, and the reason is the whole argument for the placement:
//
//   * during a CATCH-UP there is nothing under the banner to move — the panels are empty, which is
//     exactly why the banner is there;
//   * in a FAILURE there is nothing under it at all, ever, and a floating strip over a permanently
//     blank window would be a notice about a screen rather than the screen's own explanation.
//
// So it is a `flexShrink: 0` band directly under the title bar, in the seam nothing occupies, and
// it renders `null` in the three phases that have nothing to say (`starting`, `live`, and a
// `folding` that has not yet had a measurement). A band that is absent costs no layout.
//
// ── WHAT IT NEVER DOES ────────────────────────────────────────────────────────────────────────
//
// IT NEVER INVENTS A NUMBER. The percentage and the byte counts are the engine's own measurements;
// the estimate is omitted entirely rather than guessed when the samples cannot support one
// (`shared/engineLaunch.ts foldReadout`). A bar with no ETA is the ordinary first second of every
// fold.
//
// IT NEVER SOFTENS THE FAILURE. `NO_ENGINE_CONSEQUENCE` says in one sentence that there is no data
// at all — post-cutover there is no second fold to degrade to, and a card that said "some features
// are unavailable" would be describing a product that does not exist.
//
// IT NEVER SENDS THE PATHS. "Where it looked" draws behind a disclosure because it is how somebody
// discovers their antivirus took the executable out of a directory they can go and check; it is
// deliberately NOT part of the report prefill, because those strings carry the user's own home
// directory, and "Report this" fills in a GitHub issue anyone can read.

import { type JSX, useState } from 'react'
import { Box, Button, Collapse, LinearProgress, Stack, Typography, useTheme } from '@mui/material'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import type { EngineFaultSay, FoldReadout } from '../../../shared/engineLaunch'
import { NO_ENGINE_CONSEQUENCE, bannerFor, failureWords, reportPrefill } from '../../../shared/engineLaunch'
import { useEngineLaunch } from '../lib/engineLaunchHud'
import { useLogReadReport } from '../lib/logReadReportHud'
import { newIssueUrl } from '@shared/issueLink'
import { LogReadBand } from './LogReadBand'

/**
 * WHICH OF THEM IS DRAWN IS ONE DECISION (fork #9): `bannerFor`, from the log-read status every
 * window is pushed and the launch state. The card used to follow the fault, the bar the launch
 * phase and the box a third source, so a bar could sit frozen over a box that said the read had
 * stopped. The band is the third thing this seam draws: the status, on every tab.
 */
export function EngineLaunchBanner(): JSX.Element | null {
  const { say, readout } = useEngineLaunch()
  const report = useLogReadReport()
  const banner = bannerFor(report, say, readout !== null)
  if (banner === 'card' && say.fault !== null) return <FailureCard fault={say.fault} />
  if (banner === 'bar' && readout !== null) return <FoldBar readout={readout} />
  if ((banner === 'band' || banner === 'notes') && report !== null) {
    return <LogReadBand report={report} kind={banner} />
  }
  return null
}

// ── the catch-up ───────────────────────────────────────────────────────────────────────────────

/**
 * THE BAR. Percentage, bytes of total in human units, and — when the samples can carry one — an
 * estimate.
 *
 * `variant="determinate"` throughout, and never a switch to `indeterminate`: the engine always
 * knows both coordinates, so a barber pole here would be the app pretending not to know something
 * it was just told. The event count rides along because it is the one number that tells a person
 * the fold is doing WORK rather than merely reading bytes.
 */
function FoldBar({ readout }: { readout: FoldReadout }): JSX.Element {
  const theme = useTheme()
  return (
    <Box
      data-testid="engine-launch-progress"
      sx={{
        flexShrink: 0,
        px: 2,
        py: 1,
        borderBottom: `1px solid ${theme.palette.divider}`,
        bgcolor: theme.palette.background.paper
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', mb: 0.75 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          Catching up on your log
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }} data-testid="engine-launch-progress-pct">
          {readout.pctText}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }} data-testid="engine-launch-progress-bytes">
          {readout.bytesText}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {readout.eventsText}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        {readout.etaText !== null && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }} data-testid="engine-launch-progress-eta">
            {readout.etaText}
          </Typography>
        )}
      </Stack>
      <LinearProgress variant="determinate" value={readout.pct} sx={{ height: 4, borderRadius: 2 }} />
    </Box>
  )
}

// ── the failure ────────────────────────────────────────────────────────────────────────────────

/**
 * THE CARD. Plain words for what happened, the consequence stated without softening, and three
 * things a person can do about it.
 *
 * THE RETRY DISABLES ITSELF FOR THE ROUND TRIP and nothing longer. `engineRetry` resolves when main
 * has taken the ask, not when a launch has succeeded — so re-enabling on resolution is honest: the
 * button is available again the moment pressing it would mean something, and if the launch fails
 * the same way the fault edge simply puts a fresh count on this card. What the disable actually
 * buys is that a frustrated double-click is one ask rather than two.
 */
function FailureCard({ fault }: { fault: EngineFaultSay }): JSX.Element {
  const theme = useTheme()
  const [showPaths, setShowPaths] = useState(false)
  const words = failureWords(fault)

  return (
    <Box
      data-testid="engine-launch-failure"
      sx={{
        flexShrink: 0,
        px: 2,
        py: 1.5,
        borderBottom: `1px solid ${theme.palette.divider}`,
        bgcolor: theme.palette.action.hover
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
        <ErrorOutlineIcon color="warning" fontSize="small" sx={{ mt: 0.25 }} />
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 700 }}
            data-testid="engine-launch-failure-headline"
          >
            {words.headline}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }} data-testid="engine-launch-failure-body">
            {words.body}
          </Typography>
          {words.remedy !== null && (
            <Typography
              variant="body2"
              sx={{ color: 'text.secondary' }}
              data-testid="engine-launch-failure-remedy"
            >
              {words.remedy}
            </Typography>
          )}
          <Typography
            variant="body2"
            sx={{ color: 'text.secondary', mt: 0.5 }}
            data-testid="engine-launch-failure-consequence"
          >
            {NO_ENGINE_CONSEQUENCE}
          </Typography>
          {fault.detail !== null && (
            <Typography variant="caption" component="div" sx={{ color: 'text.secondary', mt: 0.5 }}>
              It last said: {fault.detail}
            </Typography>
          )}
          <CardActions
            fault={fault}
            showPaths={showPaths}
            onTogglePaths={() => {
              setShowPaths((was) => !was)
            }}
          />
          <Collapse in={showPaths} unmountOnExit>
            <Box data-testid="engine-launch-lookedin" sx={{ mt: 1 }}>
              {fault.lookedIn.map((path) => (
                <Typography
                  key={path}
                  variant="caption"
                  component="div"
                  sx={{ color: 'text.secondary', fontFamily: 'monospace', wordBreak: 'break-all' }}
                >
                  {path}
                </Typography>
              ))}
            </Box>
          </Collapse>
        </Box>
      </Stack>
    </Box>
  )
}

/**
 * The three things a person can do about it.
 *
 * THE RETRY DISABLES ITSELF FOR THE ROUND TRIP and nothing longer. `engineRetry` resolves when main
 * has taken the ask, not when a launch has succeeded — so re-enabling on resolution is honest: the
 * button is available again the moment pressing it would mean something, and if the launch fails
 * the same way the fault edge simply puts a fresh count on this card. What the disable actually
 * buys is that a frustrated double-click is one ask rather than two.
 *
 * THE THIRD BUTTON IS ABSENT WHEN THERE IS NOTHING BEHIND IT. Only an absence carries candidate
 * paths (`engineLaunchState.ts` attaches them where they are true), and a disclosure that opened
 * onto an empty list would be a control that lies about having an answer.
 */
function CardActions({
  fault,
  showPaths,
  onTogglePaths
}: {
  fault: EngineFaultSay
  showPaths: boolean
  onTogglePaths: () => void
}): JSX.Element {
  const [retrying, setRetrying] = useState(false)
  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', mt: 1 }} useFlexGap>
      <Button
        size="small"
        variant="contained"
        disabled={retrying}
        data-testid="engine-launch-retry"
        onClick={() => {
          setRetrying(true)
          void window.eq.engineRetry().finally(() => {
            setRetrying(false)
          })
        }}
      >
        Try again
      </Button>
      <Button
        size="small"
        variant="outlined"
        data-testid="engine-launch-report"
        href={newIssueUrl(`Data engine did not start: ${fault.kind}`, reportPrefill(fault))}
        target="_blank"
        rel="noreferrer"
      >
        Report on GitHub
      </Button>
      {fault.lookedIn.length > 0 && (
        <Button
          size="small"
          variant="text"
          onClick={onTogglePaths}
          data-testid="engine-launch-lookedin-toggle"
        >
          {showPaths ? 'Hide where it looked' : 'Where it looked'}
        </Button>
      )}
    </Stack>
  )
}
