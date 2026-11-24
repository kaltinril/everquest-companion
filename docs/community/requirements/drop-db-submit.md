# drop-db-submit: what was asked for

Sending the player's own loot to the wiki's drop database (`Special:DropDatabase`) through
`action=eozobservations` (schema 1). The spec is `https://eqlwiki.com/API_Documentation`, section
"Private kill/loot observations: schema 1" (read 2026-11-23, ledgered). Newest row at the bottom.
Nothing here is removed or narrowed without the owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-11-23 | owner, after Maergoth (wiki admin) on Discord | Hook the app up to the wiki's drop database, as the wiki's own tool (Eye of Zomm) does: convert the app's recorded loot to schema 1 and submit it through the API, so wiki loot lists get their percentages automatically and hand-written `[Overall: ~N%]` notes are no longer needed. Maergoth: "massage yours into something the wiki knows what to do with and submit it via some api calls". The wiki counts % per drop, not per kill. | slice 1 building on `drop-db-submit` |

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
