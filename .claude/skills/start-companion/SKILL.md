---
name: start-companion
description: Start the EQ Companion dev app from this clone for the owner to test. Use when asked to start, launch, run, or restart the app, or to bring it up after a merge.
---

# Start the dev app

`start_companion.ps1` at the repo root does the whole launch: finds Node 24, refuses if this
clone's Electron is already running, installs missing `node_modules`, rebuilds the release
engine when `engine/` sources are newer than `engined.exe`, clears `ELECTRON_RUN_AS_NODE`,
clears the vite pre-bundle and the dev Electron caches, then runs `npm run dev`. A person runs
it with `powershell -ExecutionPolicy Bypass -File .\start_companion.ps1`.

## The procedure

1. **Nothing is mid-merge in this clone.** `npm run dev` is `--watch`: a change under `src/main`
   relaunches Electron, so a merge or checkout here while it runs crashes the app on the owner.
   Finish merges first, or pass `-NoWatch`.

2. **Launch it in the background** (PowerShell tool, `run_in_background: true`), sending the
   output to a log in the session scratchpad:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File C:\git\everquest-companion\start_companion.ps1 *> "<scratchpad>\dev.log"
   ```

3. **Wait for the engine**, not just the window: poll the log until a line matches
   `connected to the engine` or `engine attached` (a cold engine rebuild takes minutes, a warm
   launch about 20 s). Also stop on `already running`, `not found`, `npm ERR!` or the background
   task exiting, and report what the log says.

4. **Tell the owner it is up**, with the branch (`git branch --show-current`) and the short HEAD.

## When the owner is playing on it: `-Prod`

`-Prod` builds once and runs the build (`electron-vite preview`) instead of the dev server. It is
about twice as fast on every tab switch (measured 2.2x, 2026-10-20), uses the same userData files,
and nothing a merge does in this clone reaches it until the next launch, so no hot reload lands on
the owner mid-play. The build adds a minute or so to the launch.

TRAP (2026-11-01): the renderer's localStorage is keyed by page origin. The dev server serves
`http://localhost:5173`, the build serves `file://`, so `-Prod` sees a separate, nearly empty store:
the Gaps tab's Done marks, kept pictures, filters and every other remembered view choice look gone
(the owner: "why are all my dones gone?"). Nothing is lost; a dev launch shows them again. Launch
the dev server unless the owner asks for `-Prod`, and say this when they do.

## If it is already running

The script exits with `already running from this clone (pid N)`. Do not kill Electron or
`engined`: ask the owner to close the window, then launch again. A dev task this session
started can be stopped with TaskStop, which ends the watcher; the window may still need the
owner to close it.

## If clicks do nothing in the app

Suspect a stale vite pre-bundle before the code. The script already clears it at launch, so a
relaunch is the fix.
