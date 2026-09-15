# Third-party pull requests: the adoption ledger

Every upstream PR that was looked at gets a row, adopted or not (RULES.md, rule 12). The upstream
head commit is the one vetted; if the PR moves, it is vetted again before the `community/` branch
follows it. A deferred PR is re-evaluated from its row.

Upstream is `jmoyers/everquest-companion`. `gh pr list --repo jmoyers/everquest-companion` lists
what is open; `git fetch upstream` refreshes the `upstream/pr/N` refs.

## Adopted

| PR | Title | Author | Upstream head | Vetted | Our branch | What the vetting found |
|---|---|---|---|---|---|---|
| [#16](https://github.com/jmoyers/everquest-companion/pull/16) | ci: bump actions/setup-node from 4.4.0 to 7.0.0 | dependabot[bot] | `1b757c5b` | 2026-09-15 | `community/pr-16-setup-node` | Diff is exactly two workflow files, SHA only. The creator's `# v4 (v4.4.0)` trailing comments were not rewritten, so the new SHA was checked against `actions/setup-node` tag v7.0.0 via the GitHub API: matches. Workflows do not run on this fork; no runtime effect. Gate: typecheck, lint, suite unchanged. |
| [#59](https://github.com/jmoyers/everquest-companion/pull/59) | ci: bump actions/cache from 4.3.0 to 6.1.0 | dependabot[bot] | `60185e25` | 2026-09-15 | `community/pr-59-actions-cache` | One line in `build.yml`. SHA matches tag v6.1.0. Stale comment as above. |
| [#65](https://github.com/jmoyers/everquest-companion/pull/65) | ci: bump actions/deploy-pages from 4.0.5 to 5.0.1 | dependabot[bot] | `ef34f314` | 2026-09-15 | `community/pr-65-deploy-pages` | One line in `pages.yml`. SHA matches tag v5.0.1. Stale comment as above. |
| [#70](https://github.com/jmoyers/everquest-companion/pull/70) | deps: bump the npm-minor-and-patch group across 1 directory with 14 updates | dependabot[bot] | `d405a937` | 2026-09-15 | `community/pr-70-npm-minor-patch` (+2 commits) | Diff is exactly `package.json` and the lockfile; the 14 versions match the title; 107 added `resolved` URLs, all `registry.npmjs.org`, all with `integrity`. Clean against `main`. **Two bumps fail the gate and are pinned back on our branch:** (1) `typescript-eslint` 8.70 tightened `no-meaningless-void-operator` and `no-inferrable-types`; five of the seven new lint errors are in the creator's own unchanged files (`storeFile.ts`, `logEventKinds.ts`, `speechText.ts`, the `void _exhaustive` idiom), so the bump turns his lint red on an unmodified `main`. (2) `onnxruntime-node` 1.29 moves its binaries from `bin/napi-v3` to `bin/napi-v6`; `electron-builder.yml`'s platform excludes and `src/main/speech/vcRuntime.ts` both name the old path, so the installer grew from 136 MB to 208 MB (283 MB of foreign-platform binaries inside) and the voice-alert runtime check would not find the binding at all. Both need his files changed. With the pins: typecheck, lint and suite at the known reds, `npm run dist` builds on electron 43.7.0. |

## Deferred

| PR | Title | Author | Upstream head | Looked at | Why deferred | Re-evaluate when |
|---|---|---|---|---|---|---|
| [#18](https://github.com/jmoyers/everquest-companion/pull/18) | deps(dev): bump vite from 7.3.6 to 8.2.1 | dependabot[bot] | `upstream/pr/18` | 2026-09-15 | `electron-vite` 5.0.0 declares `vite` peer `^5 \|\| ^6 \|\| ^7`; vite 8 is outside it. | electron-vite publishes a release whose peer range includes vite 8, and the creator bumps it. |
| [#19](https://github.com/jmoyers/everquest-companion/pull/19) | deps(dev): bump @eslint/js from 9.39.5 to 10.0.1 | dependabot[bot] | `upstream/pr/19` | 2026-09-15 | `@eslint/js` 10 has peer `eslint ^10.0.0`; the repo is on eslint 9.39.5. The bump alone is an unsatisfiable peer. | An eslint 10 bump appears (dependabot or the creator), and its config migration is his. |
| [#20](https://github.com/jmoyers/everquest-companion/pull/20) | deps: bump @mui/x-data-grid from 7.29.13 to 9.11.0 | dependabot[bot] | `cda96c4c` | 2026-09-15 | Tried: merges clean, but `npm ci` refuses. 9.x has peer `@mui/material ^7.3 \|\| ^9`; the repo is on 6.5.0. Note the package is imported by nothing under `src/` on any branch: it is an unused dependency. | The creator moves to `@mui/material` 7, or drops the dependency. |
| [#21](https://github.com/jmoyers/everquest-companion/pull/21) | deps(dev): bump eslint-plugin-react-hooks from 5.2.0 to 7.1.1 | dependabot[bot] | `3e8a4a35` | 2026-09-15 | Tried: merges clean, installs, but `npm run lint` exits 2 before linting. 7.x changed the shape of `configs['recommended-latest']`, which `eslint.config.mjs` spreads into the flat config. That file is the creator's. | The creator updates the react-hooks block in `eslint.config.mjs`, or a later plugin release restores the flat-config export. |

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

Every dependabot PR open on 2026-09-15 is in Adopted or Deferred above. A `community/` branch
exists only for adopted PRs; a deferred one is re-tried from its `upstream/pr/N` ref.
