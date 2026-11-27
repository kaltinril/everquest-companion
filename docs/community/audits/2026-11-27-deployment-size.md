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
