# The fork as its own project: phase doc (2026-11-19)

Owner, 2026-11-19: "we need to update our rules and readme etc, we broke away from the original fork
but our readme still acts like we are trying to stay in-sync with it", and the same hour: name the
builds Community Edition, because "test makes it sound like it's not a real version". Four parts:
the pages (done), the rename (planned, waits on the owner), what the app itself still says (not
built), and the decisions that are the owner's. Rules first: `docs/community/RULES.md`, then
`agent/INDEX.md`.

Method: a read-only audit in three sweeps (front pages and rules; agent docs and tooling; the app
itself) found 226 passages that still spoke as a stand-in for, in step with, or reporting to the
original. For the pages: one writer, two reviewers (is each statement true of this build; do the
pages agree with each other), one fixer. For the rename: a map of the build's identity, a design,
and a skeptic who checked the design against the installer and updater sources.

## Part 1: the pages (done 2026-11-19)

What changed:

- **One front page.** The root `README.md` is the project's own page. `.github/README.md` is removed:
  GitHub shows that file in preference to the root one, so the real page was hidden behind the
  original's README, which sent readers to the original's releases and issues and claimed code
  signing, feedback and telemetry this build does not have.
- **The README says only what is true of this build.** The reviewers caught three statements that
  were not: "no game files are touched" (Summarize and archive log moves the log), a privacy list
  that left out the sound-pack list and previews, and a voice pack called bundled that is downloaded
  on first launch. Exact names (the installer file, the shortcut, the settings folder) appear only
  where a player needs them, so the rename touches few lines.
- **RULES.md.** All 20 numbers kept. Reworded: 2 (`main` is a frozen copy, not a mirror that syncs),
  4 (outside code comes in on a work branch after a full read, wherever it was opened), 5 (every
  outside change is untrusted; "adopted wholesale" is gone), 9 (one sentence added), 11 and 15 (one
  phrase each), 12 (ledger rows for either repo), 13 and 14 (the two files are "left as written",
  not "his"; taking `AGENTS.md` over is recorded as open), 20 (players report here; the original
  repo only on the owner's word).
- **`CLAUDE.md`, `docs/community/README.md` and its picture.** The trunk and the working steps lead;
  the original repo is one short last section and one small grey box.
- **Ledgers.** Titles and framing only; every row is byte for byte what it was. `ISSUES.md` lists
  this repo's own issues first.
- **`agent/WORKFLOW.md`.** Three rulings added: the fork does not track the original; a wiki-data
  complaint is reported, not fixed; the owner's comments on this repo's issues are directions.

Defaults taken while the owner was away. Each matches the owner's words and destroys nothing; any
of them can be overruled:

| | Decision | Default taken | The other options |
| --- | --- | --- | --- |
| D1 | The original repo | A frozen reference: `main` and the `upstream` remote stay, nothing is synced as routine work, something is taken only when the owner asks and after a full read | keep syncing; drop the remote and the branch |
| D2 | Reports | Players report here; nothing is filed on the original unless the owner asks | keep filing there (the old rule 20) |
| D3 | `AGENTS.md` | Left as written (5 words under its 20,000-word cap) | take it over (Part 4, item 5) |
| D4 | `src/shared/releaseNotes.ts` | Left as it is; What's new shows two lists | one list |
| D5 | The README | One page, at the root | two pages, only the front one fixed |
| D10 | The ledgers | Records; the original's tracker is swept only when the owner asks | keep sweeping it; freeze it |
| D11 | The creator's absence | "no longer active on it", on every page | "on hiatus" |
| D12 | His app | "the original app", never "the official app" | - |

Left alone on purpose, for Part 4: `SECURITY.md`, `TELEMETRY.md`, `AGENTS.md`, everything under
`src/`, `scripts/`, `build/`, `.claude/`, `.github/workflows/`, `package.json`,
`electron-builder.yml`. Not yet looked at by a person: `fork-workflow.svg` parses as XML but was
never rendered; open it once.

## Part 2: the rename from TEST to Community Edition (planned, waits on the owner)

Owner, 2026-11-19: "We should also probably start naming our builds as Everquest Legends Companion
CE (Community Edition) or some nonsense instead of test ... test makes it sound like it's not a real
version". Analysed the same day in three steps: a map of every place the build's identity is set or
matched on, a design, and a skeptic who checked each of the design's safety claims against the
installer and updater sources under `node_modules` (27 claims: 18 hold, 5 refuted and corrected
below, 4 settled only by a real install). No code is written yet: the name, the depth and the
version scheme are the owner's.

### What existing installs depend on (never change these)

- **appId**: `com.kaltinril.everquest-companion.test` (electron-builder.yml:8). nsis.guid is unset,
  so APP_GUID = UUIDv5(appId) (app-builder-lib/out/targets/nsis/NsisTarget.js:261). That GUID names
  HKCU\Software\<GUID> (InstallLocation, ShortcutName, KeepShortcuts) and ...\Uninstall\<GUID>
  (templates/nsis/multiUser.nsh:8-9), the installer mutex
  (include/allowOnlyOneInstallerInstance.nsh:14) and the AUMID stamped on shortcuts
  (include/installer.nsh:200,225). Change it and the new installer finds no previous install:
  uninstallOldVersion returns at once (include/installUtil.nsh:155-163), InstallLocation is not
  reused, the old Apps entry and shortcuts stay, and with the package name unchanged it unpacks into
  the same folder on top of the old files.
- **installed executable name**: `EQ Legends Companion TEST.exe (seen in
  release/0.1.0-test.40/win-unpacked)` (derived; app-builder-lib/out/appInfo.js:56-57,
  out/winPackager.js:235, templates/nsis/common.nsh:16). On a rename the new installer computes
  $appExe with the NEW name, which does not exist in the old install, so keepShortcuts stays false
  (templates/nsis/installSection.nsh:43-50, include/installUtil.nsh:196-199): the old uninstaller
  deletes the old shortcuts and fresh ones are created, including a desktop shortcut the player had
  deleted. The running-app check matches by install-folder path when PowerShell works
  (allowOnlyOneInstallerInstance.nsh:66,94) but by the NEW image name otherwise (:75,:99), which
  would miss a running old-named exe.
- **uninstaller file name**: `Uninstall EQ Legends Companion TEST.exe` (derived;
  app-builder-lib/templates/nsis/common.nsh:17; repeated as a literal at
  build/installer.nsh:189,197). The installed UninstallString points at it
  (include/installer.nsh:121-123); the next installer runs whatever that registry value names, so an
  old-named uninstaller is still found after a rename as long as appId is unchanged.
- **update feed URL**: `provider generic, url
  https://github.com/kaltinril/everquest-companion/releases/latest/download/`
  (electron-builder.yml:190-192). Confirmed in local build output
  release/dev-2026-10-30/win-unpacked/resources/app-update.yml. Installed builds keep the URL they
  were built with; changing the yml only affects builds made afterwards.
- **update channel and channel file name**: `channel: test -> update file test.yml`
  (electron-builder.yml:193). The file written is <channel>.yml
  (out/publish/updateInfoBuilder.js:36-53). Each install asks for <channel>.yml using the channel in
  ITS OWN app-update.yml (electron-updater/out/providers/GenericProvider.js:14-19,
  out/util.js:30-32). Every install from test.20 to test.51 asks for test.yml, so every future
  release must still carry test.yml, whatever the new builds are told to read.
- **updater cache folder**: `%LOCALAPPDATA%\everquest-companion-test-updater (installer.exe,
  current.blockmap, pending\)` (derived; app-builder-lib/out/appInfo.js:126-128, NsisTarget.js:612).
  The installer copies itself there at install (include/installer.nsh:93); the updater reads the old
  installer from there for differential downloads (electron-updater/out/AppUpdater.js:545-550,686).
  A package rename moves it for new builds and leaves the old folder behind.
- **nsis block and include script**: `oneClick true, perMachine false; no guid,
  uninstallDisplayName, include or script keys` (electron-builder.yml:233-241; build/installer.nsh).
  oneClick + per-user is what makes the install folder follow the package name instead of the
  product name (NsisTarget.js:270, out/targets/targetUtil.js:40-42).
- **package name**: `everquest-companion-test` (package.json:2). Drives the install folder for FRESH
  installs (%LOCALAPPDATA%\Programs\everquest-companion-test), the updater cache folder, and
  app.getName() at runtime (no productName in package.json, no app.setName in src). An existing
  install keeps the folder recorded in its registry InstallLocation
  (templates/nsis/multiUser.nsh:26-28), so a rename splits players between two folders. The official
  installer's running-app check is a path-prefix test (allowOnlyOneInstallerInstance.nsh:66), and
  ...\Programs\everquest-companion is a prefix of this folder.
- **install folder**: `%LOCALAPPDATA%\Programs\everquest-companion-test` (derived;
  templates/nsis/multiUser.nsh:26-47; literal copies at build/installer.nsh:187,201).
  eqLeaveSharedFolder (build/installer.nsh:186-203) moves pre-test.20 installs out of
  ...\Programs\everquest-companion and names the target folder literally; it must match whatever the
  package name yields.
- **version**: `0.1.0-test.51` (package.json:3). The updater offers a release only when semver says
  it is greater (electron-updater/out/AppUpdater.js:339-363). Prerelease words compare as text
  (electron-updater/node_modules/semver/internal/identifiers.js:4-22): evaluated with that copy,
  0.1.0-ce.1 and 0.1.0-ce.52 are NOT greater than 0.1.0-test.51, while 0.1.52, 0.1.1-ce.1 and
  0.2.0-ce.1 are. The app's own guard agrees (src/shared/update.ts:634-660).
- **userData folder (installed build)**: `%APPDATA%\everquest-companion-test`
  (src/main/channel.ts:57,145,158). All settings, caches and the engine's data live here. If the
  name changes, the new folder does not exist, so the one-time seed runs and copies from
  LEGACY_DIR_NAME, the OFFICIAL app's folder (channel.ts:65,101-102,146), not from this one: players
  would start from the official app's settings or none. Must match the literal at
  build/installer.nsh:418.
- **seed source and settings file name**: `LEGACY_DIR_NAME everquest-companion; STORE_NAME
  everquest-companion-progress` (src/main/channel.ts:65,68,70,77-88). First launch copies an
  allowlist from the official app's folder when the target folder is absent. The settings file is
  <userData>/everquest-companion-progress.json.
- **single-instance lock**: `app.requestSingleInstanceLock() with no key` (src/main/index.ts:215).
  Two builds with different userData folders both get the lock and run at once.
- **app.setName / setAppUserModelId / setLoginItemSettings**: `not called` (src (grep: no match)).
  So nothing in the main process needs editing for these, but they follow package name and appId
  silently.
- **updater runtime settings**: `no channel set, allowPrerelease false, allowDowngrade false,
  autoDownload false, autoInstallOnAppQuit on unless switched off, runs only when app.isPackaged`
  (src/main/updater.ts:270-278,612,662-683). allowDowngrade false means a release that sorts lower
  is never applied (AppUpdater.js:357-362).
- **installer: leave-shared-folder macro**: `literals: ...\Programs\everquest-companion, 'EQ Legends
  Companion.exe', 'EQ Legends Companion TEST.exe', 'Uninstall EQ Legends Companion TEST.exe',
  ...\Programs\everquest-companion-test` (build/installer.nsh:186-203). Only fires for a pre-test.20
  install still recorded in the shared folder. The old-exe names must stay as they are (they
  describe what is on those machines); the target folder must match the package name.
- **installer: keep-settings prompt and data folder delete**: `prompt names 'EQ Legends Companion
  TEST'; RMDir /r "$APPDATA\everquest-companion-test"` (build/installer.nsh:413,418). Runs only on
  an interactive uninstall answered No. Must match PROD_DIR_NAME. The uninstaller that runs during
  an update is the OLD version's, with /S and --updated, so it keeps data.

### How an install updates today

Settled from the sources under node_modules (electron-updater 6.8.11, app-builder-lib 26.18.0) and a
local build's output; no build or network request was made.

1. What an install carries. At build, electron-builder writes <install>\resources\app-update.yml
from publish[0] plus the cache folder name
(app-builder-lib/out/publish/PublishManager.js:87-90,193-201). A local build shows exactly: provider
generic, url https://github.com/kaltinril/everquest-companion/releases/latest/download/, channel
test, updaterCacheDirName everquest-companion-test-updater
(release/dev-2026-10-30/win-unpacked/resources/app-update.yml; same in the test.28 output). The app
reads that file at runtime (electron-updater/out/ElectronAppAdapter.js:22-24,
AppUpdater.js:482-487).

2. How the channel is derived. The app never sets autoUpdater.channel or a feed URL
(src/main/updater.ts:270-278). GenericProvider uses updater.channel || app-update.yml channel, else
"latest" (out/providers/GenericProvider.js:14-17), so it asks for test.yml (out/util.js:30-32). On
the build side the file is named <channel>.yml from the pinned publish.channel
(out/publish/updateInfoBuilder.js:36-53); the version's prerelease word is used only when no channel
is set (PublishManager.js:416-430).

3. The check. About 45 s after launch, then every ~4 h (src/main/updater.ts:11-13), it GETs
https://github.com/kaltinril/everquest-companion/releases/latest/download/test.yml?noCache=...
(GenericProvider.js:19-20). GitHub redirects that path to the release marked Latest (stated in
electron-builder.yml:181-183; not re-verified here). A 404 is "Cannot find channel test.yml"
(GenericProvider.js:26-28).

4. The verdict. Update only if test.yml's version is semver-greater than the running version
(AppUpdater.js:339-363); allowDowngrade is forced false (updater.ts:277). The app's own guard drops
anything not strictly newer (src/shared/update.ts:656-660).

5. The download. The installer URL is the feed URL plus files[0].url from test.yml
(out/providers/Provider.js:124-134), i.e.
.../latest/download/everquest-companion-test-Setup-<version>.exe, checked against the sha512 in
test.yml. Differential first: new blockmap at <that URL>.blockmap, old blockmap from the cached
current.blockmap or else the same URL with the new version string replaced by the running one
(Provider.js:22-26, AppUpdater.js:660-735), against
%LOCALAPPDATA%\everquest-companion-test-updater\installer.exe. Any failure falls back to the full
file. No signature check, because app-update.yml has no publisherName (NsisUpdater.js:84-90). The
file is staged in ...-updater\pending\ (DownloadedUpdateHelper.js:30).

6. Applying. Clicking the chip runs quitAndInstall(true,true) = installer with --updated /S
--force-run; otherwise on quit it runs --updated /S (NsisUpdater.js:107-113, BaseUpdater.js:69-89,
updater.ts:403-420).

7. What the new installer does. It finds the existing install by the appId-derived GUID:
InstallLocation under HKCU\Software\<GUID> (templates/nsis/multiUser.nsh:26-28), runs the fork's
customInit (build/installer.nsh:205-223), closes the running app, runs the OLD version's uninstaller
from the registry UninstallString with /S --updated so data is kept
(include/installUtil.nsh:155-224), unpacks, rewrites the registry entries and shortcuts, copies
itself to the updater cache (include/installer.nsh:93-125), and relaunches when --force-run was
passed (installSection.nsh:91-103).

8. What a release must contain. On a tag community-<version>, marked Latest
(publish-release.sh:149): test.yml naming this version and installer; the installer under exactly
the name test.yml gives; <installer>.blockmap; SHA256SUMS.txt for people; and, for a small download,
the previous release's blockmap (publish-release.sh:112-127). electron-builder uploads nothing
itself for a generic provider (PublishManager.js:113-115); scripts/community/publish-release.sh does
it with gh.

Installs before test.20 have no working feed and never update.

### Names considered

- **EQ Legends Companion CE** (short form: EQ Legends Companion CE (23 characters, two shorter than
  today's "EQ Legends Companion TEST", so it fits everywhere TEST fits: title bar, taskbar, tray,
  Start menu). File-name form: everquest-companion-ce. Spelled out once in prose as "EQ Legends
  Companion: Community Edition".). For: keeps the original's name whole, so credit and recognition
  carry over; the front page already says "community edition" (.github/README.md:1); still contains
  the text "EQ Legends Companion" that tests match (tests/toastPayload.test.mts:278,281). Against:
  "CE" means nothing to a newcomer until the README, release body and Thanks page spell it out.
- **EQ Legends Companion Community Edition** (short form: EQ Legends Companion CE in the title bar,
  tray and file names). For: self-explaining. Against: 38 characters, so the Start menu and taskbar
  truncate it, and it forces two names (long in the installer and Apps list, short in the app). One
  productName feeds the installer caption, Apps list and messages
  (app-builder-lib/out/targets/nsis/NsisTarget.js:268,583), so two names means more hand-typed
  strings.
- **EverQuest Legends Companion CE (the owner's wording)** (short form: EQL Companion CE). For: says
  the game's full name. Against: no longer matches the original app's name; spells out Daybreak's
  trademark, which the fork's own Store notes call the likeliest rejection reason
  (docs/community/MS-STORE.md:76-80); 30 characters; the tests that look for "EQ Legends Companion"
  would no longer match.
- **EQ Legends Companion (Community)** (short form: EQ Legends Companion CE). For: plain English, no
  abbreviation. Against: brackets in a product name read as a label, not a name, and it still needs
  a second short form. Not an option at all: plain "EQ Legends Companion" with no suffix. The
  official app's shortcuts carry that exact file name (both are in the Start menu and on the desktop
  of the owner's machine), and the installer renames or creates the shortcut by name
  (app-builder-lib/templates/nsis/include/installer.nsh:197,207,223,230), so it would overwrite or
  collide with the official app's.

Recommended: EQ Legends Companion CE: one product name used everywhere a machine or a tight space
shows it, with "EQ Legends Companion: Community Edition" written out in the README title, the first
line of each release body and the Thanks page. Installer file:
everquest-companion-ce-Setup-<version>.exe (no spaces: test.yml carries the bare file name,
app-builder-lib/out/publish/updateInfoBuilder.js:132-136, and it must equal the GitHub asset name).

### How deep the rename can go

**A: what players see only (identity values untouched)** (size S)

- What an existing install goes through: Nothing to do. Its next check reads test.yml as today,
  downloads the new-named installer and applies it on quit or on the chip. After that: the same
  single entry in Settings > Apps, now named "EQ Legends Companion CE <version>"; the Start menu
  shortcut renamed in place; the desktop shortcut renamed if it existed and not recreated if the
  player deleted it; the title bar, taskbar and tray say CE. Same folder, same exe file name, same
  settings folder, so every setting, alert, overlay position and store is untouched. Still saying
  test afterwards: the exe and uninstaller file names, the install and settings folder names, and
  the version until Level D.
- Changes: electron-builder.yml:9 productName: "EQ Legends Companion TEST" -> "EQ Legends Companion
  CE" ; electron-builder.yml (new key beside :9) executableName: absent -> "EQ Legends Companion
  TEST". This freezes the exe and uninstaller file names while the product name changes; without it
  Level A silently becomes Level B. ; electron-builder.yml:240 shortcutName: "EQ Legends Companion
  TEST" -> "EQ Legends Companion CE" ; electron-builder.yml:241 artifactName:
  everquest-companion-test-Setup-${version}.${ext} -> everquest-companion-ce-Setup-${version}.${ext}
  ; Left alone on purpose: electron-builder.yml:8 appId com.kaltinril.everquest-companion.test;
  :190-193 feed URL and channel: test; package.json:2 name everquest-companion-test;
  src/main/channel.ts:57 PROD_DIR_NAME everquest-companion-test ; Hand-typed name, TEST -> CE:
  src/main/windows.ts:388; src/renderer/index.html:37; src/main/tray.ts:170,311,372;
  src/renderer/tray.html:27; src/renderer/src/components/TitleBar.tsx:478 ; build/installer.nsh:413
  prompt text "reinstall EQ Legends Companion TEST" -> "reinstall ${PRODUCT_NAME}" (the define the
  file already uses at :79 and :217). Lines :189-197, :201 and :418 stay: they describe what is on
  players' disks. ; scripts/community/publish-release.sh:40 exe name ->
  everquest-companion-ce-Setup-$version.exe; :96 and :150 title and first line -> "EQ Legends
  Companion CE (Community Edition) $version"; :105 link text "TEST 0.1.0-test.20" -> "0.1.0-test.20"
  ; publish-release.sh:123 previous blockmap: on the first renamed release, download the previous
  release's everquest-companion-test-Setup-<prev>.exe.blockmap and upload a copy named
  everquest-companion-ce-Setup-<prev>.exe.blockmap, the name an install on <prev> asks for.
  Optional: without it that one update is a full download. ; publish-release.sh new guards
  (durable): stop unless release/<v>/win-unpacked/resources/app-update.yml still says channel: test,
  the fork's URL and updaterCacheDirName: everquest-companion-test-updater, and win-unpacked holds
  "EQ Legends Companion TEST.exe" ; New unit test (for example tests/communityIdentity.test.mts)
  pinning appId, publish channel, executableName, package name and PROD_DIR_NAME, so a later tidy
  cannot strand installs ; Docs and wording: .github/README.md:19;
  docs/community/RELEASING.md:3,12-27; docs/community/README.md:101-104;
  electron-builder.yml:1-7,178-189 comments; .github/workflows/community-release.yml:12-15 comments.
  The start-companion skill and WORKFLOW.md:45,52 stay true at this level (exe and settings folder
  unchanged).
- Risks: Not verifiable from source: what the WinShell plugin does to taskbar and Start pins when a
  shortcut is renamed (installer.nsh:207-209). The exe path is unchanged, so a pin should keep
  working, possibly under its old label. Needs a real machine. ; If executableName is forgotten or
  mistyped, the exe is renamed and shortcuts are deleted and recreated. The script guard and the
  unit test above exist to catch it. ; Verified against electron-updater 6.8.11 in node_modules.
  Older installs (test.20 on) carry whatever version was bundled then; it is inside their bundle and
  its version could not be read. ; GitHub's /releases/latest/download redirect and the published
  assets were not checked live. ; The installer asset name must have no spaces, because test.yml
  carries the bare file name for a generic feed (updateInfoBuilder.js:132-136).

**B: A plus the executable name and install folder** (size M)

- What an existing install goes through: The update arrives the same way. The old version's
  uninstaller removes the whole old folder and, because the new-named exe is not there yet, also
  deletes the old Start menu and desktop shortcuts. The new build unpacks into the new folder and
  creates fresh shortcuts, including a desktop shortcut the player had deleted. One Apps entry, one
  folder, settings untouched. Lost: taskbar and Start pins, and anything the player or Windows tied
  to the old exe path (their own shortcuts or launchers, firewall and antivirus rules, compatibility
  flags).
- Changes: electron-builder.yml executableName: "EQ Legends Companion TEST" -> removed (exe becomes
  "EQ Legends Companion CE.exe", uninstaller "Uninstall EQ Legends Companion CE.exe") ;
  build/installer.nsh customInit (:205-223): new macro after eqLeaveSharedFolder: when $INSTDIR is
  $LOCALAPPDATA\Programs\everquest-companion-test, set it to
  $LOCALAPPDATA\Programs\eq-legends-companion-ce. Same technique as eqLeaveSharedFolder (:186-203),
  which shipped at test.20. ; build/installer.nsh:201 target of eqLeaveSharedFolder:
  everquest-companion-test -> eq-legends-companion-ce; the old-exe literals at :188-197 stay ;
  build/installer.nsh customInstall (:20-22): also delete a leftover "EQ Legends Companion TEST.exe"
  and its uninstaller from $INSTDIR, for the case where the old uninstaller could not be run ;
  package.json:2 name stays everquest-companion-test. Renaming it would also move the updater cache
  (app-builder-lib/out/appInfo.js:126-128) and change app.getName(); the folder is moved by the
  installer instead. ; publish-release.sh guard, .claude/skills/start-companion/SKILL.md:18-19 and
  docs/community/agent/WORKFLOW.md:45: exe name TEST -> CE ; Everything in Level A
- Risks: The gain is small. The installed exe's version info reads FileDescription "Electron",
  ProductName "Electron", CompanyName "GitHub, Inc." (read from the owner's install; cause:
  electron-builder.yml:206 and app-builder-lib/out/winPackager.js:240-243). The exe file name shows
  only in Task Manager's Details tab and in Explorer. ; Pins and the player's own shortcuts to the
  old exe break; a desktop shortcut they deleted comes back. ; If the old uninstaller is missing or
  fails silently, the install proceeds (installUtil.nsh:124-126,241-242) and the old folder's files
  are orphaned. The customInstall cleanup only covers the same-folder case. ; The folder compare is
  an exact string against $LOCALAPPDATA\Programs; a player with a relocated per-user programs folder
  keeps the old folder name. Harmless, but two folder names exist in the field. ; What
  WinShell::UninstAppUserModelId does to pins (uninstaller.nsh:191) is a binary plugin and was not
  verified.

**C: B plus the settings folder, with a migration** (size M)

- What an existing install goes through: The update itself is as Level B. On the first launch of the
  new build the settings folder is renamed in one step and the app opens with everything as it was.
  If something holds a file in the old folder, the app runs on the old folder that session and moves
  it at a later launch. A player who then installs an older build by hand gets a first-run copy from
  the official app, or empty settings, because the old folder is gone.
- Changes: src/main/channel.ts:57 PROD_DIR_NAME: everquest-companion-test ->
  eq-legends-companion-ce, plus a new constant holding the old name ; channel.ts resolveUserData
  (:132-153): before the seed, when the new folder is absent and the old one exists, rename old to
  new (one rename, same volume). If the rename throws, use the OLD folder for this run and try again
  next launch; never start on an empty folder, never copy as a fallback. When neither exists, seed
  from the official app as today (:101-102,146). When both exist, use the new one and leave the old.
  ; build/installer.nsh:418 RMDir /r "$APPDATA\everquest-companion-test" -> remove both folder names
  on an interactive uninstall answered No; comment :379-386 updated ;
  .claude/skills/start-companion/SKILL.md:27-28; docs/community/agent/WORKFLOW.md:52;
  scripts/disarm-stats.mts:54; docs/community/MS-STORE.md:70: folder name ; New unit tests for the
  three cases (old only, both, neither) and the failed-rename path ; Everything in Level B
- Risks: This is the only level that moves player data, and what it buys is a folder name almost
  nobody opens. ; One-way: older builds cannot find the moved folder. The downgrade prompt
  (build/installer.nsh:65-84) warns about the version, not about settings. ; A rename fails while
  any process holds a file there (a lingering engine process, antivirus, a sync tool); the
  fall-back-to-old-folder rule is what keeps that from looking like data loss, and it must be
  tested. ; The single-instance lock lives in the settings folder (channel.ts:31-34, a comment, not
  verifiable in node_modules). ; Agent tooling that copies installed settings to the dev app reads
  the old path until updated.

**D: version scheme and tags (independent of B and C; pairs naturally with A)** (size S)

- What an existing install goes through: Step 1, release community-0.1.52 marked Latest, carrying
  test.yml with version 0.1.52: an install on 0.1.0-test.K (K from 20 to 51) fetches test.yml as
  always, finds 0.1.52 greater than its own version, downloads and applies it. Version shown becomes
  0.1.52 in the app and in Settings > Apps. Step 2, release 0.1.53: installs on 0.1.52 still ask for
  test.yml (their app-update.yml says channel test) and update normally; a straggler still on test.K
  jumps straight to the newest. Never again: any version with a prerelease tail on the same or lower
  core (0.1.0-test.N, 0.1.52-anything) sorts lower and is refused, so there is no going back to the
  old numbering.
- Changes: package.json:3 version: 0.1.0-test.51 -> 0.1.52, then 0.1.53 and so on (the plan already
  written at docs/community/MS-STORE.md:38-43,108-114) ; Tags: community-0.1.0-test.N ->
  community-0.1.52. The community- prefix stays: a v* tag starts the creator's release job
  (scripts/community/publish-release.sh:10-11). ; electron-builder.yml:190-193 unchanged: channel
  stays test, so the update file stays test.yml for every install old and new. Comment at :178-189
  updated. ; publish-release.sh:33-36 guard: accept only plain x.y.z; first_tag at :76 stays
  community-0.1.0-test.20 ; scripts/community/community-release-notes.mjs:24-28 versionKey: accept
  both shapes and sort a plain version above any -test.N of the same core ;
  tests/communityReleaseNotes.test.mts:14-18,29-30: order by the same key instead of the test number
  ; Notes wording for new releases: section label "NEW IN TEST.N" -> "NEW IN 0.1.N" (the generator
  takes any label starting NEW IN, community-release-notes.mjs:128). Optional: commit subject "Test
  build <v>:" -> "Community build <v>:", accepted beside the old wording at publish-release.sh:72
  and community-release-notes.mjs:39,160. ; .claude/skills/community-release/SKILL.md:20,34,41-50;
  docs/community/RELEASING.md:12,38-39; docs/community/agent/WORKFLOW.md:289; MS-STORE.md Phase 1b
  marked done ; No change needed: build/installer.nsh:36-63 already reads a plain version;
  src/shared/update.ts:580-660 and APP_VERSION_RE (src/shared/feedback.ts:320) accept it; the 32
  history entries keep their test.N versions
- Risks: One-way door: after 0.1.52 the old numbering can never be offered again. ; Renaming or
  unpinning the channel at the same time would strand installs unless every later release carried
  both files; nothing a player sees depends on the file's name, so leave it. ; The tooling regexes
  (script guard, notes generator, unit test) fail the build, not players, if one is missed. ;
  MS-STORE.md:43 records a build numbered 0.2.0 writing test.yml; not re-run here, the source
  agrees.

Recommended by the design: A and D together in one release: "EQ Legends Companion CE 0.1.52". A
alone is safe but leaves "0.1.0-test.52" in the version, which is the part that says "not a real
version". B and C are not recommended: they rename things almost nobody sees (Task Manager already
shows "Electron" for the app), B costs players their pins and shortcuts, and C moves their data. If
the owner has not settled the version scheme, ship A alone first; it stands on its own.

The skeptic's verdict: A and D together in one release (EQ Legends Companion CE 0.1.52):
productName, shortcutName, artifactName and the hand-typed strings change, executableName is frozen
to "EQ Legends Companion TEST", and appId, package name, channel test, feed URL and PROD_DIR_NAME
stay untouched. Every safety claim for A and D holds in source; the one open item is the pin label,
which costs nothing if wrong. The condition is the release path, not the design: publish not-Latest,
canary on the CI-built assets, then promote. B and C are not safe to ship on this evidence; both
rest on behaviour only a real install settles (pins, failed uninstalls, Electron's default folder,
paths inside settings).

### Where the design was wrong (corrected)

- Unproven: A4b. Taskbar and Start pins keep working after the shortcut rename, possibly under the
  old label. Correction: Try: on an account with published test.51 pinned to taskbar and Start, run
  the new installer with --updated /S --force-run; record whether each pin survives, launches, and
  what label it shows. Say the outcome in the release notes.
- Refuted: Plan step 10: canary on the owner's install through the real feed before the release is
  announced; if it fails, delete the release so Latest falls back to test.51. Correction: Publish
  the release not marked Latest (gh release create --latest=false; drafts will not do, their assets
  are not public), canary against the tag's own download URL, then promote with gh release edit
  <tag> --latest on the owner's word. Try: after the staged publish, 'gh release view' with no tag
  must still print community-0.1.0-test.51.
- Refuted: Plan steps 7-9: a local build is rehearsed, then the tag is pushed and the release is
  checked for its assets and the Latest mark. Correction: Keep the local rehearsal for behaviour,
  put the identity guards in publish-release.sh as hard failures so they run on the CI output before
  gh release create, and run the canary on the CI-built staged release.
- Refuted: Test plan: updater half with a throwaway build of today's trunk at 0.1.0-test.51 whose
  publish.url points at 127.0.0.1. Correction: On a second Windows account, VM or Sandbox, install
  the published test.51 (and test.20) and edit that install's resources\app-update.yml url (read at
  runtime: electron-updater/out/ElectronAppAdapter.js:22-24, AppUpdater.js:482-487) to the local
  feed, then to https://github.com/kaltinril/everquest-companion/releases/download/community-0.1.52/
  for the staged canary. After the update the new build's own app-update.yml must read
  latest/download and channel test again.
- Refuted: B risk as written: if the old uninstaller is missing or fails silently, the install
  proceeds. Correction: Two cases: cannot launch = old folder and old shortcuts both remain beside
  the new ones (the two-installs look); ran and failed = a dialog and no update.
- Unproven: B5. Side benefit: the official installer's path-prefix check stops matching the
  community folder. Correction: Try: with both apps running, run the official installer and see
  whether the community app is closed.
- Unproven: C1. Only channel.ts decides the settings folder; the package name plays no part.
  Correction: Try: after a migrated first launch and one more launch, check whether
  %APPDATA%\everquest-companion-test exists again and what is in it.
- Unproven: C3. Nothing in the settings points back at the folder by full path. Correction: Try: on
  a copy of a long-used settings folder, search every file including Local Storage for the folder
  name before building C.
- Refuted: Task premise: the engine's working copy lives under %APPDATA%. Correction: For installed
  builds the engine matters to the installer's running-app check, not to the settings folder.

### Risks the design missed

- No staging step exists: pushing the tag builds and publishes as Latest in one CI run
  (community-release.yml:101-111; publish-release.sh:149), and installs download silently within
  hours (updater.ts:649-678). There is no window in which the release exists but players do not have
  it.
- No rollback: allowDowngrade is false (updater.ts:277) and 0.1.52 sorts above every test.N, so
  installs that took a bad 0.1.52 can only be fixed forward, and only if its own updater config is
  right. The app-update.yml guard is the one thing standing between a typo and a stranded fleet; it
  must be a hard failure in the CI path.
- publish-release.sh treats a missing win-unpacked as a note, not a stop (:51-65). The new identity
  guards must fail when --publish is given and win-unpacked is absent.
- The shortcut rename branch (templates/nsis/include/installer.nsh:203-212,228-232) has never run
  for this fork; shortcutName was the same at every tag checked. NSIS Rename fails quietly if the
  new name already exists.
- Taskbar pins are separate .lnk copies, so a pinned icon will most likely keep the TEST label after
  Level A even though it launches. Unverified; say so in the notes if the rehearsal confirms it.
- Freezing executableName makes TEST permanent in the exe, uninstaller, install folder, updater
  cache and settings folder names. Renaming them later is Level B or C on a bigger fleet. The owner
  should rule on A knowing it is the cheap moment that is being passed up.
- If exe branding is switched on later (signExecutable: false), the embedded internal name comes
  from the frozen file name (winPackager.js:247), so TEST would appear in the exe's properties.
- test.yml is listed as an asset on every Releases page, so the word test stays visible to anyone
  downloading by hand. Removing it needs both files on every release for as long as old installs
  exist.
- publish-release.sh:123 builds the previous blockmap name with the current pattern and fails soft.
  If it is not updated, every update becomes a full 156 MB download and the script only prints
  'none'.
- community-release-notes.mjs:24-28 throws on the first plain tag and
  tests/communityReleaseNotes.test.mts:14-18 asserts -test.N on every entry. Both block release
  prep, not players, but both must accept the mixed list before the tag.
- The seven TEST strings are not the only product-name strings: toast.ts:192,203, ToastCard.tsx:49,
  share.ts:34,56, ThanksSetting.tsx:77,88 and build/installer.nsh:336 say 'EQ Legends Companion'
  with no suffix and will disagree with the new name. Owner's call whether they follow.
- The proposed identity unit test cannot import channel.ts (it calls app.setPath at import);
  PROD_DIR_NAME is not exported. It has to read the file as text, as enginePackaging.test.mts reads
  electron-builder.yml.
- Without PowerShell the installer's process check matches only the main exe
  (allowOnlyOneInstallerInstance.nsh:75,99), missing engined.exe inside the install folder; the old
  uninstaller then fails on the busy file and the update aborts. Present today, untested, and the
  first renamed release is a bad time to discover it.
- The official app's installer matches the community folder by path prefix (this repo's template),
  so an official update can close the community app. Level A leaves this as it is.
- Level C only: downgrade then upgrade leaves both folders, the new one wins, and settings changed
  on the old build are dropped without a word.
- Level B only: an old uninstaller that cannot be launched leaves the old folder and old shortcuts
  beside the new ones; one that runs and fails shows a dialog during a silent update.
- Text that will go stale: the release skill's ask line ('Publish GitHub release test.N now'),
  release-test.N branch naming, the e2e runner's TEST_BUILD_SKIPS log text, electron-builder.yml
  header comments, and the owner's community-releases memory note outside the repo.

### Steps, as corrected

1. Owner rules on: the name; depth A, knowing the exe, uninstaller, folders and test.yml keep the
   word test for good unless B is done later; version 0.1.52 onward (one-way); the installer file
   name; whether the un-suffixed 'EQ Legends Companion' strings follow.
2. Add the ask as a row in docs/community/requirements/test-neutering.md; open a work branch and
   worktree off main_community.
3. Level A edits in electron-builder.yml: productName and shortcutName to 'EQ Legends Companion CE';
   new executableName: 'EQ Legends Companion TEST' with a comment saying why it must never change;
   artifactName everquest-companion-ce-Setup-${version}.${ext}. Leave appId, publish url, channel:
   test and package.json name alone.
4. The seven hand-typed names (src/main/windows.ts:388; src/main/tray.ts:170,311,372;
   src/renderer/index.html:37; src/renderer/tray.html:27;
   src/renderer/src/components/TitleBar.tsx:478) and build/installer.nsh:413 to ${PRODUCT_NAME}.
   Leave installer.nsh:187-201 and :418 as they are.
5. Level D edits: package.json version 0.1.52; publish-release.sh:33-36 accepts only plain x.y.z;
   community-release-notes.mjs:24-28 accepts both shapes with plain above -test.N;
   tests/communityReleaseNotes.test.mts orders by the same key; the release skill and RELEASING.md
   wording.
6. scripts/community/publish-release.sh: exe name, title and body to the new name; line 123 to the
   ce pattern with a one-time bridge (if the previous release has no ce-named blockmap, download its
   -test- one and upload a copy named everquest-companion-ce-Setup-<prev>.exe.blockmap).
7. Hard guards in publish-release.sh, run before gh release create and failing when win-unpacked is
   absent under --publish: resources/app-update.yml reads provider generic, the fork's
   latest/download URL, channel: test, updaterCacheDirName: everquest-companion-test-updater;
   win-unpacked holds 'EQ Legends Companion TEST.exe'; test.yml exists and names this version and
   installer; the installer name has no spaces.
8. Staged publishing: publish-release.sh creates the release with --latest=false, and promotion
   becomes a separate owner step (gh release edit community-<v> --latest). Write this into
   RELEASING.md and the release skill.
9. Identity unit test reading electron-builder.yml, package.json and src/main/channel.ts as text:
   appId, no nsis.guid, publish provider, url and channel, executableName, package name,
   PROD_DIR_NAME.
10. Notes commit, regenerate What's new, typecheck, lint, known-reds.sh.
11. Local rehearsal build, inspect the output (exe name, app-update.yml, test.yml, installer name),
    then rehearse on a second Windows account, VM or Sandbox, never the owner's own install:
    published test.51 and published test.20 installed, settings changed, desktop shortcut deleted,
    app pinned to taskbar and Start, app left running; run the new installer with --updated /S
    --force-run, then again closed with --updated /S, then by double-click. Check one Apps entry,
    one folder, Start shortcut renamed, desktop not recreated, pins, settings intact. Repeat once
    with PowerShell blocked.
12. Updater rehearsal on that same account: edit the published test.51 install's
    resources\app-update.yml url to a local feed serving the new test.yml, installer and blockmap;
    confirm in the log that test.yml is fetched, 0.1.52 offered, sha512 passes, it applies on quit,
    and the next launch is up to date with app-update.yml back to latest/download and channel test.
13. Merge to main_community, push, and on the owner's explicit word tag community-0.1.52. CI builds
    and publishes it not-Latest. Confirm 'gh release view' with no tag still shows
    community-0.1.0-test.51 and that the new release holds test.yml, the installer, its blockmap,
    the bridged blockmap and SHA256SUMS.txt.
14. Canary on the CI-built assets: on the test account's published test.51 install, point
    app-update.yml at
    https://github.com/kaltinril/everquest-companion/releases/download/community-0.1.52/ and let the
    real updater take it. If anything is wrong, nobody else has it: fix and ship as 0.1.53.
15. On the owner's word, promote: gh release edit community-0.1.52 --latest. Watch the owner's own
    install (registry says test.50) take it. From here every fault is fixed forward.
16. Afterwards: sweep remaining docs and skill text, update the owner's community-releases memory
    note, and record in docs/community why B and C were not done and that executableName, appId,
    channel and package name are frozen.

### What must be tried on a real machine first

1. Build output check (no install): win-unpacked exe name unchanged;
   win-unpacked/resources/app-update.yml reads generic, the fork URL, channel test,
   updaterCacheDirName everquest-companion-test-updater; test.yml names the new version and
   installer; the publish script's dry run passes and prints the new title and body.
2. Installer half, exactly as the updater runs it: on a machine or Windows account with the
   published test.51 installed, change some settings, move an overlay, delete the desktop shortcut,
   pin the app to the taskbar, leave it running, then run the new installer with --updated /S
   --force-run (the chip path, electron-updater/out/NsisUpdater.js:107-113). Expect: app closes and
   relaunches as CE; one entry in Settings > Apps; one install folder; Start menu shortcut renamed
   with no old one left; desktop shortcut not recreated; pin still launches; every setting and
   overlay position intact.
3. Same again with the app closed first and --updated /S only (the apply-on-quit path).
4. Updater half against a local feed: a throwaway build of today's trunk at 0.1.0-test.51 with only
   publish.url pointed at http://127.0.0.1:<port>/, installed; serve the new build's test.yml,
   installer and blockmap from that port. Expect in the log: test.yml fetched, 0.1.52 offered,
   differential attempt then cache use or full-download fallback, sha512 pass, applied on quit; next
   launch reports up to date with no repeat download.
5. Oldest updating build: repeat the installer half starting from test.20.
6. Interactive paths: double-click the new installer over test.51; fresh install on a clean account
   with and without the official app present (it installs beside it, both run, first-run copy of the
   official settings still works).
7. Downgrade prompt: run the test.51 installer over the new build; the prompt names both versions
   correctly and No leaves the new build intact.
8. Uninstall from Settings > Apps: prompt wording says CE; Yes keeps settings, No removes
   %APPDATA%\everquest-companion-test only.
9. Tooling: notes generator and unit suite green with the mixed list (0.1.52 above 0.1.0-test.51).
10. Only if B is ever built: shortcut and pin outcome, a machine where PowerShell is blocked
    (fallback process check), the folder move, and a missing old uninstaller.
11. Only if C is ever built: migration with real data, a locked file in the old folder (app must run
    on the old folder and retry), both folders present, and a downgrade afterwards.

### Decisions for the owner

- **The name** Options: EQ Legends Companion CE | EQ Legends Companion Community Edition | EverQuest
  Legends Companion CE | EQ Legends Companion (Community). Recommended: EQ Legends Companion CE,
  spelled out as "Community Edition" in the README, release body and Thanks page
- **How deep the rename goes** Options: A: what players see | B: plus exe name and install folder |
  C: plus settings folder with a migration. Recommended: A. Leave the exe name, folders, appId and
  update file name as internal ids; B and C trade real player disruption for names almost nobody
  sees.
- **The version scheme** Options: 0.1.52, continuing the count as plain 0.1.N (already planned in
  MS-STORE.md) | 0.2.0 or 1.0.0 as a fresh start | keep 0.1.0-test.N | a -ce.N tail (only possible
  on a higher core such as 0.2.0-ce.1; 0.1.0-ce.N sorts below test.51 and would never be offered).
  Recommended: 0.1.52 in the same release as the rename, tags community-0.1.52, update file stays
  test.yml. One-way: the old numbering cannot come back.
- **The installer file name on the Releases page** Options:
  everquest-companion-ce-Setup-<version>.exe | keep everquest-companion-test-Setup-<version>.exe.
  Recommended: Rename it; installs follow whatever test.yml names, and the worst case is one full
  download.
- **Brand the exe itself (today Windows reads it as "Electron" by "GitHub, Inc.", because
  electron-builder.yml:206 turns resource editing off)** Options: leave as is | turn resource
  editing on without signing (signExecutable: false instead of signAndEditExecutable: false), as its
  own later release. Recommended: Its own later release, after the rename has landed: it changes the
  build step and the known-reds list (tests/enginePackaging.test.mts:160-175), and needs its own
  build and install test.
- **Publisher and copyright shown in Settings > Apps ("jmoyers", "Copyright 2026 Josh Moyers", from
  package.json:5 and electron-builder.yml:10)** Options: leave both | keep the copyright, change the
  publisher to the fork. Recommended: Leave both for this release; display only, safe to change
  either way, and how the creator is credited is the owner's call.
- **Staged publishing.** Today a tag push builds and publishes as Latest in one run, and installs
  take it silently within hours with no way back (`allowDowngrade` is off). Options: publish
  not-Latest, try it on a real install, then promote on the owner's word | keep the one-step
  release. Recommended: staged, at least for the release that carries the rename.
- **The un-suffixed name.** A few strings say "EQ Legends Companion" with no suffix (toasts, the
  share text, the Thanks page). Options: they follow the new name | they stay. Recommended: follow,
  in the same change.

## Part 3: what the app itself still says (partly built)

Built 2026-11-20 (`requirements/feedback-and-analytics.md`): the first-run usage-data bar is gone,
"Report this" opens a GitHub issue, the Issues address is a link, and the menu row reads "Open
GitHub issue". `TELEMETRY.md` goes with the code removal (Part 4, item 8).

Found by the audit's third sweep. Small, but it is code: it goes through the gate, and some of it
is pinned by tests or clicked by e2e specs.

Shown to players and untrue of this build:

- **A first-run bar says "We collect completely anonymous usage data."** Nothing is collected: the
  analytics address is empty (`src/main/telemetry/net.ts`). The bar shows on every fresh install
  with no original-app settings to import (`features/preferences/TelemetryNotice.tsx`, mounted in
  `App.tsx`). Fix: no bar when no address is compiled in. Several e2e specs click the bar away and
  need a touch.
- **`TELEMETRY.md` says "This build does send."** It is generated from `src/shared/telemetryDoc.ts`
  and pinned by `tests/telemetryDoc.test.mts`, so the fix is in the generator.
- **"Report this" leads nowhere.** The crash screen and the engine-failure banner open a feedback
  dialog whose Send is disabled (`lib/ErrorBoundary.tsx`, `components/EngineLaunchBanner.tsx`).
- **The Issues address is plain text.** The feedback-off note makes the player retype it, though the
  link allowlist already permits this repo (`features/feedback/forkFeedback.ts`, `main/security.ts`).

Shown to players and worded as a stand-in: "Off in the community build" on the menu's Send feedback
row; the Usage analytics caption ("would go to the original developer's server"); the "Community
build" heading in What's new; "this build updates from kaltinril's fork" on the Thanks page; "the
official app" three times in the body `scripts/community/publish-release.sh` writes for every
GitHub release.

Comments only, about 40 places: "TEST build (this branch only, never a PR)" and names of retired
branches in `src/`, `electron-builder.yml` and `build/installer.nsh`. Sweep them with the rename,
which edits the same lines.

Right as it is, kept: the credit to Josh Moyers on the Thanks page and its link to his repo; his
copyright line; the one-time copy of the original app's settings on first launch; the wiki
requests, which name this repo.

## Part 4: decisions waiting on the owner

1. **The rename** (Part 2): the name, how deep it goes, the version scheme (one-way), and staged
   publishing for the release that carries it.
2. **`SECURITY.md`.** It tells readers that updates are checked against a code signature, which is
   not true of this build, and it sends vulnerability reports to the creator's inbox. It needs a
   private channel first: private vulnerability reporting is off on this repo. Options: turn it on
   (one GitHub setting) and rewrite the file for this build; an address of the owner's; a notice at
   the top of the file. Suggested: turn it on, then rewrite.
3. **The app's own text** (Part 3): fix the four untrue statements now, or with the rename.
   Suggested: now; they are independent of the name.
4. **The original's agent skills** under `.claude/skills/`: `linear-board`, `feedback-triage`,
   `explain`, `login`. They drive the creator's Linear board, feedback database and AWS account and
   cannot run here, yet their descriptions tell every agent session to use them ("Use at the start
   of any work session", "use it UNPROMPTED"). Options: delete all four; keep them with a note;
   rewrite `feedback-triage` for this repo's issues and delete the rest. Suggested: the last.
   DECIDED for one of the four, 2026-11-20: `feedback-triage` is deleted (owner: "we don't need
   feedback-triage skill"; its scripts went with the feedback and analytics code). `linear-board`,
   `explain` and `login` are still open; `explain` still names the deleted skill in one line.
5. **`AGENTS.md`.** It still orders a `Co-Authored-By` line on commits (overruled here), work on
   `main`, his Linear tickets, `v*` release tags, and a standing authorization to deploy to his AWS
   account. Options: leave it, with the one pointer line as the only correction; take it over and
   rewrite it for this project (the word-cap test then becomes ours to keep or drop).
6. **The original's GitHub workflows**: `build.yml` (runs on a push to `main`, builds a release on
   any `v*` tag), `pages.yml`, `infra.yml`, and `dependabot.yml`. The trunk has no CI on push, only
   at release-tag time. Options: leave them; point `build.yml` at `main_community` and drop its
   release job; delete them.
7. **What the fork left on the original repo**: 13 pull requests (BRANCHES.md lists them) and issue
   #74, which still says the changes are kept on separate branches for him to take. Options: leave
   them; close or update them (a write on his repo, so only on the owner's word).
8. **Telemetry and feedback code.** DECIDED 2026-11-20: remove the code (owner: "Remove all code
   associated with feedback and usage analytics"). Was: switched off, still in the tree, and every new tab must still be
   added to a waiting list (`NOT_YET_REPORTED`) for a deploy this project cannot make. Options:
   leave it; stop keeping the lists; remove the code (large).
9. **The two signing tests kept red on purpose** (`scripts/community/known-reds.txt`). Options: keep
   them red; make them describe this build's unsigned configuration and empty the list, so
   `npm test` is green on the trunk.
10. **The publisher Windows shows.** `"author": "jmoyers"` in `package.json` is what Settings, Apps
    lists as the publisher. Options: leave it; name the project there (his copyright line stays
    either way; the licence requires it).
11. **`site/`**, the landing page. It downloads the original's installer and is not published from
    this repo. Options: leave it; give the project its own page; delete it.
12. **"Diffs: surgical: never reformat, rename or restructure"** (agent/WORKFLOW.md). It dates from
    when every change had to merge back. Options: keep it as house style; relax it.
13. **What's new.** Two lists (ours, then the original's) and a link to the original's releases.
    Options: keep both; drop the link; one list.
