# unreleased-gate: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the feature;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-28 | owner | "no reason to hide them ever just always show the tabs": both halves of `UNRELEASED` pinned true. | built |
| 2026-10-29 | owner | Remove the gate itself (~128 call sites in 48 files): "everyone should always see all tabs". No player-visible change. | built (unreleased-gate-removal, not yet tested in the app): `UNRELEASED`, `src/main/unreleased.ts` and every call site gone; the gated views stay out of `TELEMETRY_VIEWS` via `NOT_YET_REPORTED` in the contract test; `spells-gate` e2e rewritten as `spells-area` |
