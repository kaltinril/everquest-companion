# drop-db-submit: what was asked for

Sending the player's own loot to the wiki's drop database (`Special:DropDatabase`) through
`action=eozobservations` (schema 1). The spec is `https://eqlwiki.com/API_Documentation`, section
"Private kill/loot observations: schema 1" (read 2026-11-23, ledgered). Newest row at the bottom.
Nothing here is removed or narrowed without the owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-11-23 | owner, after Maergoth (wiki admin) on Discord | Hook the app up to the wiki's drop database, as the wiki's own tool (Eye of Zomm) does: convert the app's recorded loot to schema 1 and submit it through the API, so wiki loot lists get their percentages automatically and hand-written `[Overall: ~N%]` notes are no longer needed. Maergoth: "massage yours into something the wiki knows what to do with and submit it via some api calls". The wiki counts % per drop, not per kill. | built 2026-11-24 (slice 1): `src/main/dropObs/` (events, client, drain, state, service), Preferences → Game card `DropObsSetting.tsx`; off by default; zone sent without its instance tier (`zoneBaseName`). Not yet tried against the live wiki. Copy wiki page stops writing `[Overall: ~N%]` the same day (gaps-tab.md) |
| 2026-11-24 | owner | "Anything that is left for us to do in this connectivity to the WIKI first pass ... make sure it is easy to use, and intuitive and flows well, and the user can use it easily if they enable it." Work in a worktree; do not merge to main_community yet. | built 2026-11-24 on branch `drop-obs-ux`, not merged: the card is two numbered steps (make a Bot password, naming the exact grant; paste it, one Save and sign in button, Enter works) that fold into "Signed in as X" with Change and Remove once a sign-in has worked; turning the switch on signs in first and stays off if that fails; the status reads again every 5 s and says what is left, roughly how long, what went and when, in words (no wiki codes); a stop has a Sign in again button; the reports the wiki refused open as a list with a reason. Entry renamed "Send my loot to the wiki". Still not tried against the live wiki |
| 2026-11-24 | owner | "I think the sending should be optional even further. They should be able to say trickle my data in the background or only send when I click the button." | built 2026-11-24 on branch `drop-obs-ux`, not merged: the switch is replaced by a choice of Off / Send in the background / Only when I press Send; manual mode has a "Send N now" button that sends what is waiting, a batch every 30 s, and stops when nothing is left. Not tried against the live wiki |

## Defaults taken (owner may overrule)

- Off until the player turns it on in Settings; nothing is sent before that. This is a new
  network call from the app (RULES.md rule 15): the owner's ask above is the sign-off for building
  it; the off-by-default switch keeps it the player's choice.
- Sign-in with a wiki Bot password (Special:BotPasswords) holding only the `eozobservations`
  grant, stored encrypted with Electron `safeStorage`. Never the account's main password.
- Loot only (no kill events yet), the player's own loot only, `explicit-corpse` only (a line that
  names the corpse). Not sent: destroyed items, Reward Chest loot, loot with no corpse named,
  player corpses.
- The loot already in the log is sent too (real recorded observations; the spec allows old
  `observedAt` for offline delivery), newest first. The screen shows how many before the switch
  is turned on.
- No `characterName` (the spec wants explicit consent to publish it).
- Player corpses: a source named for any character in the Logs folder or a current group member
  is not sent. Other players the app has seen are not known to main yet (the Gaps tab's marked
  players live in the renderer), so a corpse of a stranger is sent as an NPC until that list
  reaches main.
- A source the line named is taken as the corpse (`explicit-corpse`), whether or not the line said
  "corpse" (the `You looted X from Y and ...` forms make the word optional); `Reward Chest` is not.
- A wiki assertion failure (`assertuserfailed`) stops sending for this launch only: the next
  launch, or Sign in again, signs in again. The credential stops (`eoz-login`, `eoz-email`,
  `eoz-blocked`, `permissiondenied`, `eoz-disabled`, a failed login) last until Sign in again.
- (2026-11-24) Remove clears the user name, password and switch, and keeps the record of what the
  wiki took, so signing in again (even as another account) never resends it. The 50 newest refused
  reports are listed; refused reports are never resent by this slice.
- (2026-11-24) The status is asked every 5 s while the card is open; main reads the loot for it at
  most once per 10 s, so an open card costs one loot read per 10 s.
- (2026-11-24) Send modes: a player who had the old switch on keeps the background trickle (files
  without the new field read as background). A Send now run lives in memory: it carries on while
  the app is open, even with Preferences closed, and ends when nothing is left, on a stop, or when
  the app closes; a batch left in flight goes again at the next press. A run sends what arrives
  while it runs too (it stops only when nothing is waiting). Background and Send now sign in first
  when the saved sign-in has not worked yet; Only when I press Send itself sends nothing, so it
  does not.
