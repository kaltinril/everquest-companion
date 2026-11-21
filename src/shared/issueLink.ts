// Where players report problems and ideas: this project's GitHub issues (RULES.md rule 20).
// Every link here sits under the one github.com subtree `main/security.ts` lets a window open.

export const ISSUES_URL = 'https://github.com/kaltinril/everquest-companion/issues'
export const NEW_ISSUE_URL = `${ISSUES_URL}/new`

/** Under the link checker's 2048 (`MAX_LINK_LEN`, main/security.ts): a longer link opens nothing. */
const MAX_LINK = 2000
const MAX_TITLE = 160
const MAX_BODY = 1200

/**
 * The new-issue page with its title and body filled in. The issue is public and the player reads
 * it before posting, so a caller passes no file paths and no character names.
 */
export function newIssueUrl(title: string, body: string): string {
  let t = title.slice(0, MAX_TITLE)
  let b = body.slice(0, MAX_BODY)
  for (;;) {
    const url = `${NEW_ISSUE_URL}?${new URLSearchParams({ title: t, body: b }).toString()}`
    if (url.length <= MAX_LINK || (t === '' && b === '')) return url
    // Encoding can triple a text's length; the body gives way first, the title last.
    if (b !== '') b = b.slice(0, Math.floor(b.length / 2))
    else t = t.slice(0, Math.floor(t.length / 2))
  }
}
