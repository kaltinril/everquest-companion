# Deployment size and dependency updates, 2026-11-27

Measured on the 0.1.57 `npm run dist` build (Electron 45.5.0). MB = 1,048,576 bytes (Explorer's MB).
Re-measure: group every file of `release/<v>/win-unpacked`, expanding `app.asar` with
`@electron/asar` `getRawHeader`; download share = each group 7-Zipped alone at `-mx=7`.

## Dependency updates (merged to main_community)

- Electron 45.1.0 -> 45.5.0: Chromium 156.0.8078.109 and the Chromium/V8 security backports of 45.2/45.3.
- eslint 10.16, typescript-eslint 8.74: clears minimatch GHSA-g3hv-75wg-m249 (DoS on crafted globs) for lint.
  `npm audit`: 14 moderate -> 6. The 6 left are the same advisory inside electron-builder
  (`app-builder-lib` pins minimatch ^10, mac-only `@electron/universal` ^9); build-time, own globs only.
  `npm audit fix --force` would DOWNGRADE electron-builder to 25: never run it.
- typescript-eslint 8.74 adds `no-unsafe-class-instance-assignment`; it misreads Electron's
  `Menu.buildFromTemplate` (one line-level disable in `src/main/tray.ts`).
- Vite 8 renamed `build.rollupOptions` to `rolldownOptions`; electron-vite 6 reads the new key. Built
  `out/` was byte-identical before and after the rename.
- Left out on purpose: vite 8.4 (adds `napi-windows-process-start-time`, two weeks old at the time, and a
  second `rolldown`, since electron-vite pins rolldown ~1.2; no security fix). Majors not taken: MUI 9,
  TypeScript 7, chokidar 6, electron-store 12, onnxruntime-node 1.31.
- Rust: all 76 registry crates checked against OSV: no vulnerabilities. `chrono` and `chrono-tz` are
  flagged unmaintained only (RUSTSEC-2026-0543, -0555); alternatives `jiff`, `time`. Dependabot alerts
  are disabled on the repo.

## Where the install goes (on disk / download share)

| Part | Disk MB | Download MB |
| --- | --- | --- |
| Electron executable | 238.8 | 70.6 |
| Chromium language packs (55) | 48.8 | 7.6 |
| GPU DLLs (dxcompiler 24.6, swiftshader, d3dcompiler, vulkan) | 35.2 | 8.8 |
| Voice alerts (DirectML 17.7, onnxruntime 14.0, phonemizer) | 34.6 | 12.0 |
| Chromium resources (resources.pak, icudtl, licenses, ffmpeg) | 34.4 | 18.2 |
| Rust engine | 28.5 | 3.0 |
| Main bundle (game data compiled in) | 20.4 | 2.0 |
| OCR (tesseract) | 14.0 | 4.3 |
| Renderer | 12.3 | 2.0 |
| Wiki images | 6.4 | 6.0 |
| Rest | 4.3 | 0.7 |
| Total | 477.7 | installer 149.6 |

Dev tools (eslint, typescript, vite, electron-builder, playwright) ship 0 MB.

## Ways to shrink, not yet done

- `electronLanguages: [en-US]`: -48.3 MB disk, ~-7.5 MB download. App never reads the locale; spellcheck off.
- `compression: maximum`: whole build 7z 140.9 -> 131.5 MB (`-mx=9 -md=64m`), same pack time.
- Updater cache keeps `installer.exe` AND `pending/<installer>` of the installed version: 2 x 149 MB per
  player (measured on the owner's PC). Clearing `pending` once installed is updater code: owner's call.
- phonemizer ships `dist/phonemizer.js` beside the `.cjs` the CJS bundle requires: -1.3 MB.
  `tesseract.js/docs`: -0.4 MB.
- Engine has no `[profile.release]` (no LTO, default codegen-units); not measured.
- Do not remove: GPU DLLs (the owner's AppData has `DawnGraphiteCache`: Chromium's Dawn GPU path is used),
  `DirectML.dll` (measured required, see electron-builder.yml), `LICENSES.chromium.html`.
- The packaged app never writes `userData/engine-run` (dev launch only); a copy there on a player PC
  is stale.

## Second pass: deprecations and majors (same day)

Taken (all on main_community):
- chokidar 5 -> 6, electron-store 11 -> 12 (conf 16). chokidar 6 picks recursive native watching only
  when `depth` is unset on a DIRECTORY; our dir watchers set `depth: 0` and file targets watch the
  parent per-directory, so no recursive watch on the EQ folder (measured with an fs.watch probe;
  same events as 5, fewer handles). conf 16 opened a copy of a real settings file deep-equal.
- GitHub Actions to latest majors, SHA-pinned (checkout 7, setup-node 7, cache 6, upload-artifact 7,
  configure-pages 6, deploy-pages 5, upload-pages-artifact 5). Three pins had stale comments (cache
  and deploy-pages were already latest, setup-node was v7.0.0 labelled v4). Resolve an ANNOTATED tag
  through `git/tags/<sha>` to get the commit SHA.
- MUI 7 -> 9 (there is no v8): system props moved into `sx`, removed `...Outline` icons ->
  `...OutlineOutlined`, Autocomplete `params.inputProps` -> `params.slotProps.htmlInput`, computed
  Typography colours into `sx` (v9 silently drops a non-palette `color` prop: text went white).
  Not compared on screen: dialogs, menus, Maps, Bazaar, Plane of Sky, overlays.
- Rust: protocol-codegen to typify 0.10, syn 3, prettyplease 0.3, sha2 0.11; eqlog off chrono and
  chrono-tz onto jiff 1 (bundled tzdb, host zone still named by iana-time-zone). Parity output
  byte-identical on the owner's logs; engined.exe -0.9 MB; OSV 0 advisories. jiff carries a newer
  IANA database (2026f vs 2025b): western Canada from Nov 2026 now reads correctly.
  Required-nullable protocol fields (ComboCorrection.endTs, Resist*Benchmark.mobLevel) must now be
  present when the engine reads them; the app has always sent `endTs`.

Not taken, and why (re-check these, not the rest):
- TypeScript 7: typescript-eslint (8.74) supports `typescript <6.1`; TS 7 has no stable JS API.
- schemars 1: typify 0.10.2 still takes a schemars 0.8 `RootSchema`.
- Node 26 LTS for dev/CI and `@types/node` 26: the app runs Electron 45's Node 24 (45 is the newest
  Electron); tests and types stay on the runtime players get. Move when Electron moves.
- Deprecated transitive packages with no trusted swap in our hands: lodash.isequal (electron-updater
  6.8.11, latest), glob 7 / inflight / rimraf 2 / boolean (electron-builder 26.18, latest),
  whatwg-encoding (cheerio 1.2, latest).

## Third pass: follow-ups (same day, branch deps-followup)

Taken:
- native-reg (last published 2022) removed: discovery's registry reads go through koffi
  (`src/main/log/winRegistry.ts`, advapi32, same `KEY_READ | KEY_WOW64_64KEY`, no new permission).
  Old and new read 1,413 keys / 40,488 values side by side on the owner's PC: 0 differences.
- koffi 3.3.5 -> 3.3.8; vite 8.3.5 -> 8.4.0 (a second rolldown, 1.3 beside electron-vite's 1.2:
  +25.5 MB dev `node_modules`, 0 shipped; goes when electron-vite moves); Rust pin 1.99 -> 1.100.1
  (generated protocol byte-identical, clippy clean, workspace tests green).
- onnxruntime-node 1.20.1 -> 1.31.1: Kokoro synthesis about 2x faster (whole 4-phrase run
  11.2 s -> 5.7 s). It runs on the CPU provider, so `dxcompiler.dll` (17.2 MB, WebGPU provider
  only, not imported) is excluded: shipped binaries 31.9 -> 48.3 MB (+16.4 MB). TRAPS:
  - 1.31's onnxruntime.dll carries Microsoft's 1DS telemetry and opens an HTTPS connection to
    `mobile.events.data.microsoft.com` while it synthesizes. `engine.ts` sets
    `ORT_DISABLE_TELEMETRY=1` on MAIN before the worker starts (a worker's env never reaches
    native code); measured: no socket with it set.
  - onnxruntime.dll now imports `MSVCP140_ATOMIC_WAIT.dll`: a fifth app-local VC++ runtime file.
    A PC whose cached runtime has only the old four fails as 'engine-unloadable' until it is
    re-provisioned.

Next (owner, 2026-11-27): phonemizer + onnxruntime move out of the installer into a voice pack
downloaded with the model, published once on the fork's releases (and the Kokoro files mirrored
there, same sha256 pins). Voice releases must never be GitHub's "latest": the updater reads
`releases/latest/download/`. Fixed the same day (branch fix-reds).
