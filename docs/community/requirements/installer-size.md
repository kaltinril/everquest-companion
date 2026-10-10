# installer-size: what was asked for

Every request this branch has taken, newest at the bottom. Read it before changing the branch;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-08 | owner | Find out how much the installer can shrink ("it's really really big"), as an exploratory branch. | measured: test.20's 141.8 MB installer is ~70 MB Electron's own exe, ~15 MB the voice engine (onnxruntime and DirectML, which must ship), ~7.8 MB Chromium's 55 locale paks, ~6.5 MB app.asar, ~2.6 MB the engine |
| 2026-10-09 | owner | Implement the reductions found, as long as they cause no issues. | built: React, MUI and Emotion move to devDependencies (installer 141.8 to 137.0 MB, installed app 494 to 451 MB, nothing loads them at run time) |
| 2026-10-09 | owner | (same ask) Keep only the en-US locale pak. | not built: measured to cause an issue. Chromium resolves the app's locale from the paks present, so without them every player formats numbers and dates as en-US (en-GB and en-CA dates flip from 09/10/2026 to 10/9/2026, de-DE `1.234,5` becomes `1,234.5`); about 60 call sites format with the default locale |
| 2026-10-09 | owner | (same ask) `compression: maximum`. | not built: measured to change nothing (app-builder-lib packs the NSIS payload at -mx=9 either way; byte-identical installer) |
