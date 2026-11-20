# auto-update-toggle: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the feature;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-10 | owner | Upgrading can be switched off, so someone can stay on a specific version. | built (Preferences > Updates, "Update automatically"; off stops background checks, downloads and apply-on-quit; the manual check still works) |
| 2026-11-19 | owner (the bug hunt of that day) | Five defects found and fixed. With the switch off, a build downloaded by hand was forgotten when the app closed and Preferences said "up to date". Turning the switch back on did not install an already downloaded build on close. A failed download waited 3 to 5 hours for its next try. A check cut short by a network change or sleep read "up to date" and lost its retry. The one-time copy from the original app left the player's imported sounds behind. | built (the downloaded version is remembered across launches and shown as "update not installed" until installed; with the switch off the chip reads "automatic updates off" and the app says closing will not install; switching on arms install-on-close for a downloaded build; a failed download retries in about 15 minutes, three times at most; an interrupted check says so, has no cooldown and retries soon when the switch is on; imported sounds are copied, with a one-time late copy for installs already seeded. Not built, needs the owner's word: any check the app starts by itself while the switch is off) |
