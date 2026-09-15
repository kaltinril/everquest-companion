# Third-party pull requests: the adoption ledger

Every upstream PR that was looked at gets a row, adopted or not (RULES.md, rule 12). The upstream
head commit is the one vetted; if the PR moves, it is vetted again before the `community/` branch
follows it. A deferred PR is re-evaluated from its row.

Upstream is `jmoyers/everquest-companion`. `gh pr list --repo jmoyers/everquest-companion` lists
what is open; `git fetch upstream` refreshes the `upstream/pr/N` refs.

## Adopted

| PR | Title | Author | Upstream head | Vetted | Our branch | What the vetting found |
|---|---|---|---|---|---|---|

## Deferred

| PR | Title | Author | Upstream head | Looked at | Why deferred | Re-evaluate when |
|---|---|---|---|---|---|---|

## Not yet looked at

Open upstream PRs from other contributors as of 2026-09-15, in the order they should probably be
looked at. Small parser and discovery fixes first, then independent features, then the ones that
overlap our own branches and need a purpose-level comparison before anything else.

| PR | Title | Author | Overlaps |
|---|---|---|---|
| [#68](https://github.com/jmoyers/everquest-companion/pull/68) | fix(bosses): "This week" stops tracking raid kills after EQ Legends changed its XP line | brianmontanaweb | none known |
| [#67](https://github.com/jmoyers/everquest-companion/pull/67) | feat(combat): show my character name instead of "You" in the DPS meter | brianmontanaweb | none known |
| [#63](https://github.com/jmoyers/everquest-companion/pull/63) | Bonus experience lines are experience: the parser claims them | Amerzel | none known |
| [#51](https://github.com/jmoyers/everquest-companion/pull/51) | EQ discovery: the Daybreak launcher states the install dir as a FILE in it, and a machine can have three EverQuests | wangel | none known |
| [#54](https://github.com/jmoyers/everquest-companion/pull/54) | feat: add macOS build and packaging support | regnare | `electron-builder.yml` (test-neutering edits it too) |
| [#48](https://github.com/jmoyers/everquest-companion/pull/48) | E2e portability + PR CI | johnsideserf | `.github/workflows/` |
| [#33](https://github.com/jmoyers/everquest-companion/pull/33) | Sky: a held quest reward marks its quest turned in (fixes #27) | johnsideserf | Sky quest tracking |
| [#23](https://github.com/jmoyers/everquest-companion/pull/23) | Tests: make the bundledImages absolute-root check platform-independent | dbspringer | `tests/` only |
| [#47](https://github.com/jmoyers/everquest-companion/pull/47) | Bosses: hide mobs from Raid Targets (fixes #32) | johnsideserf | raid targets surface |
| [#38](https://github.com/jmoyers/everquest-companion/pull/38) | Gear Tab Enhancement: Gear Planner Feature | JKane10 | `gear-tab-improvements`, `gear-progression-plan`, `exaltation-clarity` |
| [#12](https://github.com/jmoyers/everquest-companion/pull/12) | Sky: make quest progression easier to scan and filter | Evan-Coleman | Sky quest list |
| [#46](https://github.com/jmoyers/everquest-companion/pull/46) | AI assistant: ask about this character over the game | DaveVoyles | new network surface; RULES.md rule 15 |
| [#42](https://github.com/jmoyers/everquest-companion/pull/42) | feat(chat): capture and save player chat | Jibblits | log parser, storage |

Dependabot PRs [#18](https://github.com/jmoyers/everquest-companion/pull/18) (vite 7 to 8),
[#19](https://github.com/jmoyers/everquest-companion/pull/19) (@eslint/js 9 to 10),
[#20](https://github.com/jmoyers/everquest-companion/pull/20) (@mui/x-data-grid 7 to 9) and
[#21](https://github.com/jmoyers/everquest-companion/pull/21) (eslint-plugin-react-hooks 5 to 7)
are major bumps and are evaluated one at a time; each ends up in Adopted or Deferred above.
