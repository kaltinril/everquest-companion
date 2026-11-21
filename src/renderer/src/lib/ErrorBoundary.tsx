import React from 'react'

/**
 * Last line of defense against a BLANK WINDOW. Wraps <App/> in main.tsx. When any
 * descendant throws during render/lifecycle, React would otherwise unmount the
 * whole tree and leave an empty page — this catches it and shows a visible,
 * self-contained fallback plus reports the error to main (errors.log + dev stdout).
 *
 * Deliberately imports NO app code: styles are inline and it does not use the MUI
 * theme, because the theme itself could be the crash source (a bad theme.ts must
 * still render this fallback, not re-throw).
 */

interface Props {
  children: React.ReactNode
}

interface State {
  error: Error | null
  info: React.ErrorInfo | null
}

/**
 * Where "Report on GitHub" goes: this project's new-issue page, in the player's browser.
 *
 * Spelled here rather than imported from `shared/issueLink.ts` on purpose: this file deliberately
 * imports no app code, because the app (or the theme) may be the crash source.
 * `tests/issueLink.test.mts` holds the two spellings together.
 */
export const CRASH_ISSUE_URL = 'https://github.com/kaltinril/everquest-companion/issues/new'

/**
 * The new-issue link with the crash's one-line message as its title. The stack is NOT sent: its
 * file paths carry the player's Windows user name, and an issue is public. It stays on screen and
 * in errors.log for the player to paste if they choose.
 */
export function crashIssueUrl(error: Error): string {
  const title = `Crash: ${error.name}: ${error.message}`.slice(0, 160)
  const body = 'What I was doing when the app broke:\n'
  return `${CRASH_ISSUE_URL}?${new URLSearchParams({ title, body }).toString()}`
}

const BUTTON: React.CSSProperties = {
  border: 'none',
  borderRadius: 6,
  padding: '10px 18px',
  fontSize: 14,
  cursor: 'pointer'
}

/** The two actions. Reporting is offered FIRST — the crash is most useful to us right now. */
function CrashActions({ reportUrl }: { reportUrl: string }): React.ReactElement {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <a
        href={reportUrl}
        target="_blank"
        rel="noreferrer"
        data-testid="crash-report"
        style={{ ...BUTTON, background: '#3b82f6', color: '#fff', textDecoration: 'none' }}
      >
        Report on GitHub
      </a>
      <button
        type="button"
        onClick={() => location.reload()}
        style={{ ...BUTTON, background: '#2a2f3a', color: '#e6e6e6' }}
      >
        Reload
      </button>
    </div>
  )
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    this.setState({ info })
    // Report over the same fire-and-forget channel used by window.onerror.
    try {
      window.eq?.reportError({
        // JOS-100: the NAME is half the error's grouping key.
        //
        // THE COMPONENT STACK IS APPENDED TO `stack` BEHIND A LITERAL MARKER (JOS-111), so a
        // reader of errors.log can tell where the thrown stack ends and the chain of COMPONENTS
        // the error came through begins. React's own component-stack lines are
        // character-for-character V8 frames, so a marker is the only way to tell the two apart.
        name: error?.name,
        message: error?.message ?? String(error),
        stack: `${error?.stack ?? ''}${
          info?.componentStack ? `\n\nComponent stack:${info.componentStack}` : ''
        }`,
        source: 'ErrorBoundary'
      })
    } catch {
      // Ignore — the visible fallback below is the primary user-facing signal.
    }
    // Also hit the console so main's console-message forwarder picks it up. The component stack
    // carries the SAME marker it carries on the IPC report (JOS-111).
    // eslint-disable-next-line no-console
    console.error(
      '[everquest-companion] ErrorBoundary caught:',
      error,
      info?.componentStack ? `\n\nComponent stack:${info.componentStack}` : ''
    )
  }

  render(): React.ReactNode {
    const { error, info } = this.state
    if (!error) return this.props.children

    const detail = `${error.name}: ${error.message}\n${error.stack ?? '(no stack)'}${
      info?.componentStack ? `\n\nComponent stack:${info.componentStack}` : ''
    }`

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: '#0f1115',
          color: '#e6e6e6',
          font: '14px/1.5 system-ui, sans-serif',
          padding: '32px',
          overflow: 'auto',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h1 style={{ fontSize: 22, margin: '0 0 8px', color: '#ff6b6b' }}>Something broke</h1>
          <p style={{ margin: '0 0 16px', color: '#b9b9b9' }}>
            The app hit an unrecoverable render error. It has been written to{' '}
            <code style={{ color: '#e6e6e6' }}>errors.log</code>. Reporting it opens a GitHub issue in
            your browser with this error as its title.
          </p>
          <div
            style={{
              background: '#1a1d24',
              border: '1px solid #2a2f3a',
              borderRadius: 6,
              padding: '12px 14px',
              marginBottom: 16,
              color: '#ffb4b4',
              fontFamily: 'ui-monospace, monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}
          >
            {error.message}
          </div>
          <details style={{ marginBottom: 20 }}>
            <summary style={{ cursor: 'pointer', color: '#9aa4b2', marginBottom: 8 }}>
              Stack trace
            </summary>
            <pre
              style={{
                background: '#14171d',
                border: '1px solid #2a2f3a',
                borderRadius: 6,
                padding: 14,
                overflow: 'auto',
                fontSize: 12,
                color: '#c7c7c7',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}
            >
              {detail}
            </pre>
          </details>
          <CrashActions reportUrl={crashIssueUrl(error)} />
        </div>
      </div>
    )
  }
}
