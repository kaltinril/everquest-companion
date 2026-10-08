# Microsoft Store: free signing by publishing there

A plan, in phases, for offering the community build through the Microsoft Store as well as the
fork's GitHub Releases page. Nothing here is built yet. It lives on `community_release_rules` beside
[RELEASING.md](RELEASING.md), because it is about how the build reaches players.

## Where this came from, and whether it is true

A player suggested it: publish on the Microsoft Store and Microsoft signs the app for free, at the
cost of setting up a Partner account, writing the listing, and waiting for each version to be
scanned. Checked on 2026-10-08:

| Claim | Verdict |
|---|---|
| Microsoft signs it for you | **True for an MSIX package.** The Store re-signs an MSIX after certification; there is no certificate to buy or renew, and players see no SmartScreen warning. **Not true for an EXE or MSI**, which the Store only links to and which we would have to sign ourselves with a paid certificate. So this plan means building an MSIX, not submitting today's installer. |
| Setting up the account | **True, and now free for an individual.** Since September 2025 individual registration costs nothing; Microsoft verifies the person with a government ID and a selfie. A company account still costs money. |
| Listing work | **True.** Description, screenshots, an age rating questionnaire, a privacy policy link, and a reason for every restricted capability. |
| Each version is scanned | **True.** Every submission goes through certification, typically hours, sometimes a day or more. The Store channel will trail the GitHub page by that much. |
| Painless install for players | **True.** One click from the Store, no SmartScreen, and the Store keeps it updated. |

Sources:
[code signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options),
[free individual registration](https://blogs.windows.com/windowsdeveloper/2025/09/10/free-developer-registration-for-individual-developers-on-microsoft-store/),
[choosing a distribution path (MSIX vs MSI/EXE)](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/choose-distribution-path),
[electron-builder AppX target](https://www.electron.build/docs/appx),
[flexible virtualization](https://learn.microsoft.com/en-us/windows/msix/desktop/flexible-virtualization),
[Store policies, section 10.1](https://learn.microsoft.com/windows/uwp/publish/store-policies).

## What changes for this app (read before Phase 1)

These are the facts that make an MSIX of this app different from the NSIS installer. Each is either
settled by a ruling in Phase 0 or tested in Phase 2.

1. **A third build identity.** The Store package has its own identity (name, publisher) reserved in
   Partner Center. It is a separate app from the GitHub TEST build, as that one is from the official
   app.
2. **Updates come from the Store, never from our feed.** Store apps must be updated by the Store.
   The Store build turns the app's own updater off (Electron sets `process.windowsStore` in an
   AppX/MSIX package, which is the switch). The GitHub build keeps updating itself.
3. **Version numbers.** MSIX versions are four numbers, the fourth reserved by the Store (0), and
   each submission must be higher than the last. electron-builder turns `0.1.0-test.20` into
   `0.1.0.x` for every test build (it drops the `-test` part), so the Store build needs its own
   mapping, for example `0.1.<N>.0` for test.N.
4. **Settings live somewhere else.** A packaged app's writes under `%APPDATA%` are virtualized into
   the package's private folder and deleted on uninstall, unlike the NSIS build, which keeps them.
   Two ways out, an owner ruling: accept separate settings (a player moving from the GitHub build
   would start again unless the first-run copy reads the real folder, which needs testing), or
   declare `%APPDATA%\everquest-companion-test` unvirtualized (the `unvirtualizedResources`
   restricted capability, Windows 11 or late Windows 10, another written justification) so both
   builds share one settings folder.
5. **Full trust.** The app spawns its own engine, reads the game's logs under `C:\Users\Public`,
   and moves the log into `Logs\companion-archive`. All of that needs `runFullTrust`, which
   electron-builder always declares; Partner Center asks for a justification in a short text box.
6. **The name.** Store policy 10.1.1 forbids a listing that misleads about its relationship to
   other products or reuses another product's name. "EverQuest" is Daybreak's trademark, and the
   app's name carries "EQ". The listing must say plainly that it is an unofficial fan tool, not
   affiliated with or endorsed by Daybreak, and credit the original author. A rejection on naming
   is possible; the remedy is a clearer title or written permission from Daybreak.
7. **Whose name is on it.** An individual account publishes under the verified person's name, shown
   on the listing as the publisher. That is the owner's call (Phase 0).

## Phases

Every phase ends in a state that can stop: nothing reaches players before Phase 5.

### Phase 0: rulings (owner, no code)

- Publish on the Store at all, alongside the GitHub page (recommended: yes, both).
- Individual account under the owner's name, or a company account (costs money).
- The listing title (a suggestion: "Companion for EQ Legends (unofficial)"), and whether to ask
  Daybreak for permission first.
- Settings: separate per build, or shared through an unvirtualized folder (item 4 above).

### Phase 1: account and name (owner, about an hour, no code)

- Register at storedeveloper.microsoft.com with a personal Microsoft account; complete ID and selfie
  verification.
- Reserve the app name in Partner Center.
- Copy the identity values from Product management, Product identity: Package/Identity/Name,
  Package/Identity/Publisher, and PublisherDisplayName. They go into Phase 2's config, exactly.

### Phase 2: a Store build that runs locally (code, about half a day)

- **Touches:** a Store build config beside the TEST one on `test-neutering` (an `appx` target with
  the Phase 1 identity values and the version mapping of item 3), tile images generated from
  `build/icon.png` into `build/appx/` (Square44x44Logo, Square150x150Logo, StoreLogo,
  Wide310x150Logo; electron-builder does not make them from the .ico), and the updater turned off
  when `process.windowsStore` is true.
- **Check, on a Windows machine with Developer Mode and a local test certificate:** it installs,
  launches, finds the logs, starts its engine, reads a dump, archives a log into
  `Logs\companion-archive` and puts it back, and survives an uninstall and reinstall. Record where
  the settings ended up.
- **Undo:** delete the config; nothing else depends on it.

### Phase 3: settings across builds (code, small; depends on the Phase 0 ruling)

- Separate settings: make sure the first-run copy reads the real `%APPDATA%` folders of the TEST and
  official apps from inside the package, and copies them in.
- Shared settings: declare the TEST settings folder unvirtualized and test that both builds read
  and write the same files.

### Phase 4: the listing (owner and agent, a few hours)

- Description and feature list from the release notes, with the unofficial-and-not-affiliated line
  and the original author credited.
- Screenshots of the main tabs.
- A privacy policy page: the app reads the game's local files, sends nothing anywhere (telemetry and
  feedback are off in the community build), and stores everything on the player's machine. It can
  be a page in this repository.
- Age rating questionnaire; category Utilities or Games companion.
- The `runFullTrust` justification (and `unvirtualizedResources`, if ruled): short, it gets cut off.

### Phase 5: first submission (owner clicks submit)

- Upload the MSIX, submit, wait for certification. Answer any rejection (naming is the most likely)
  and resubmit.
- Once live, add a Store step to RELEASING.md: after the GitHub release, build the Store package of
  the same commit and submit it. The GitHub page stays the fastest channel.

## What it costs and what it does not fix

- Money: none for an individual account. Time: certification on every release, and keeping a second
  build config working.
- It does not sign the GitHub installer. Players who download from GitHub still see SmartScreen
  until the GitHub build is signed some other way (code signing is shelved; see RELEASING.md).
