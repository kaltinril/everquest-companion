# sky-rune-count: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the feature;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19). Fork issue #2.

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-29 | owner, from fork #2 (comegetme) | Add the reporter's suggestion as one more count option, never forced on anyone: runes counted from the log alone (loot adds, any hand-over removes, the inventory export ignored). "you can add another option, but i don't want to lock people into using this fork #2 suggestion". The default stays "Both (higher of the two)". | built (sky-log-only-count, not yet tested in the app): a fifth count source `handins`, "Log only (loot minus hand-ins)" with a hover, on the Sky tab and the Loot ledger; loot less every completed hand-over (stack counts, any NPC) and destroy, in time order, floored at 0; the engine's `turnins` rows now carry `given` (cancel and refusal taken out) |
