# Security

EQ Legends Companion is a desktop app that reads your EverQuest log file and shows
you what happened. This document is an honest description of what it touches, what
it does not, and how you can verify that the copy you installed is the one we built.

## Reporting a vulnerability

Email **[jmoyers+eqc@gmail.com](mailto:jmoyers+eqc@gmail.com)** — that inbox reaches the
person who maintains this project directly and privately, so a vulnerability can be confirmed
and fixed before anything is public. Put enough to reproduce it in the mail; don't file it in
a public issue.

If you'd rather use GitHub, [private security advisories](https://github.com/jmoyers/everquest-companion/security/advisories/new)
are an optional second channel when they're available on the repo — but the email above is the
one that's always open, so prefer it if you're unsure.

This is a small hobby project maintained by one person. There is no bounty and no
guaranteed response time, but reports are taken seriously and credited unless you
ask otherwise.

## What the app touches

**On your machine**

| Thing                                              | Access                                 |
| -------------------------------------------------- | -------------------------------------- |
| Your EverQuest log file(s)                          | **read-only**, never modified, never uploaded |
| `%APPDATA%\everquest-companion\`                    | read/write — your settings and progress |
| `%LOCALAPPDATA%\Programs\everquest-companion\`      | the install directory                   |
| Windows registry (`HKCU`, uninstall entry)          | written by the installer only           |

The app installs **per-user**. It never asks for administrator rights, and there is
no UAC prompt at install, update, or uninstall time — the installer is built with
`perMachine: false`, so it has no elevation manifest at all.

Your log file is the only game data it reads, and it is opened read-only. Log
contents are parsed locally and never leave your machine. The one opt-in exception
is the loot submission below, which sends drop records you choose to share, never
log lines.

**Over the network** — all HTTPS. Everything the app does on its own from a
third-party host is a read-only GET:

| Host                                             | Why                                                   |
| ------------------------------------------------ | ----------------------------------------------------- |
| `github.com` / `objects.githubusercontent.com`   | update checks and installer downloads                  |
| `wiki.project1999.com`                           | item lookups + item icons                              |
| `eqlwiki.com`                                    | item lookups + item icons                              |
| `peonping.github.io`, `raw.githubusercontent.com`| the optional sound-pack registry and pack downloads     |

**One opt-in send.** If you save an eqlwiki bot password and choose a way to send,
the app posts your loot drops (item, quantity, mob, zone, server and time), under your
wiki account, to the wiki's drop database at `eqlwiki.com`. It is off by default and
sends nothing until you turn it on. The app has no usage analytics, no crash reporting
and no feedback upload: that code and the servers it used were removed.

Remote images are fetched only from an exact hostname allowlist
(`wiki.project1999.com`, `eqlwiki.com`), HTTPS only, default port only, no embedded
credentials, and are cached on disk after content sniffing.

## What the app never does

- No account and nothing stored that identifies you. The one credential it can hold is
  the eqlwiki bot password for the opt-in loot submission, encrypted with Windows'
  per-user protection (Electron `safeStorage`).
- **No analytics, no crash dumps, no session recording, no click stream.**
- **Nothing about your logs is uploaded.** The only gameplay data that can leave your
  machine is the opt-in loot submission described above.
- It does not write to, inject into, or otherwise touch the EverQuest client.
- It does not run with administrator privileges.
- It does not accept an update feed URL from settings, from the UI, or from any
  file on disk. The update source is compiled in.

## How updates are verified today

1. The app polls **only** the GitHub Releases of this repository, over HTTPS. The
   feed location is fixed at build time (`electron-builder.yml`); nothing in the
   settings store or the renderer process can point it elsewhere.
2. The feed (`latest.yml` / `main.yml`) carries a **SHA-512** for the installer.
   `electron-updater` streams the download through a digest transform and aborts
   with `ERR_CHECKSUM_MISMATCH` on any mismatch. The same check is applied to
   differential (block-map) downloads and re-applied to an already-staged
   installer before it is ever run.
3. Downgrades are refused (`allowDowngrade = false`), so a re-published or
   rolled-back release cannot walk an installation backwards.
4. Every release also ships **`SHA256SUMS.txt`** so you can verify a manual
   download yourself, independently of GitHub's TLS:

   ```powershell
   certutil -hashfile everquest-companion-Setup.exe SHA256
   ```

   ```sh
   sha256sum -c SHA256SUMS.txt
   ```

## Code signing and the update trust chain

**Release builds are code-signed** ("Joshua Moyers", via Azure Artifact Signing;
CI injects the signing arguments on tagged releases — see `.github/workflows/`).
Two consequences:

1. SmartScreen: signed installers should not warn. If a warning appears while the
   certificate's reputation is new, *More info → Run anyway* — and the signature
   details on the exe are checkable either way (right-click → Properties →
   Digital Signatures).

2. The update path: `electron-updater` verifies more than transport integrity.
   Every download is checked byte-for-byte against the sha512 in the release
   feed, AND (because `publisherName` is set in electron-builder.yml) the
   downloaded installer's Authenticode publisher must match "Joshua Moyers" or
   the update fails with `ERR_UPDATER_INVALID_SIGNATURE` before anything runs.
   A compromised GitHub account alone is therefore no longer sufficient to ship
   a malicious update to existing installs: the attacker would also need the
   Azure signing identity. (Historical note: builds before v0.1.8 were unsigned
   and did not verify publisher identity; they will update to signed builds,
   and from then on the verification applies.)

- **Release-pipeline hardening.** CI publishes only from a pushed `v*` tag;
  only that one job holds a repository-write token (every other path runs read-only);
  all third-party GitHub Actions are pinned to commit SHAs; dependency install
  scripts are disabled (`.npmrc`, `ignore-scripts=true`) so a compromised npm
  package cannot execute code inside the release job.

For out-of-band certainty about a specific download, check it against
`SHA256SUMS.txt` on the release page and against the hash printed in the public
build log for that tag.

## Supply chain

- Dependencies are installed with `npm ci` from a committed lockfile; every entry
  carries a `sha512` integrity hash and resolves to `registry.npmjs.org`.
- `ignore-scripts=true` — no dependency's install hook executes on a developer
  machine or in CI. See `.npmrc`.
- All GitHub Actions are pinned to full commit SHAs, not mutable tags.
- Dependabot watches npm and Actions weekly (`.github/dependabot.yml`).
- The tree currently reports **zero** known vulnerabilities — `npm audit` and
  `npm audit --omit=dev` both say `found 0 vulnerabilities`. See
  [Known dependency advisories](#known-dependency-advisories) for why the plain
  `npm audit` number is the one that matters here.

## Known dependency advisories

**There are none open right now.** This section exists to say how they are judged
when there are, because the default reading of the numbers is wrong for this
project in one specific way.

**`--omit=dev` is not the runtime.** npm and Dependabot classify a package by
which block of `package.json` it sits in, and `electron` sits in
`devDependencies` — that is correct for how it is *installed* (it is not
`require`d from the packaged app's `node_modules`; it *is* the packaged app). The
consequence is that `npm audit --omit=dev` hides every Chromium advisory in the
thing users actually run. So the number quoted above is the plain `npm audit`,
and an electron advisory is treated as a **shipping** vulnerability regardless of
which block it was found in. `vite`, `esbuild`, `electron-builder` and friends
genuinely are build-time only: nothing they contain is copied into the installer.

**Electron is held to the supported line, not to the minimum patch.** Electron
takes Chromium security fixes on the newest three majors only. Pinning to the
exact version an advisory names would park us on a line that has stopped
receiving them, so the target is the current supported major even when that is a
larger jump. Majors are still hand-driven (`.github/dependabot.yml` ignores
`electron` / `electron-builder` majors on purpose) and are verified by building
and packaging, not by reading a changelog: `npm test`, `npm run test:e2e`
against a real boot, and `npm run dist:dir` through to a launchable
`win-unpacked`.

**Unreachable is stated, not assumed.** Where an advisory does not apply, the
reason is written down with the fix rather than used to skip it — for example
`GHSA-7g7r-gx96-252g` (`app-builder-lib`) is an `AppImage` `AppRun` bug, and
`electron-builder.yml` builds exactly one target, Windows `nsis` `x64`. It was
upgraded anyway. "Not reachable" is a note in the commit, not a reason to leave
a version behind.

## Scope

In scope: anything that lets someone else read your data, run code on your machine
through this app, or tamper with an update. Out of scope: SmartScreen warnings on
unsigned builds (known, documented above), and anything requiring an attacker who
already has code execution on your machine.
