# ScriptForge

A local screenplay writing room for drafting, formatting, saving, and reading scripts aloud. The editor stores a structured screenplay document, rather than screenplay HTML.

## Features

- Fountain import/export and PDF export with editable title pages.
- Automatic pagination, smart Return/Tab, screenplay formatting, undo/redo, and keyboard shortcuts.
- Dual dialogue, continuation markers, scene numbering and individual right margins.
- Scene navigation, location autocomplete, character renaming, find/replace and statistics.
- Local folder saving, recovery snapshots and independent version-history backups.
- Table reads with browser voices and compatible imported Piper ONNX models.
- Focus Mode, Light Mode and Dark Mode.
- Desktop Help → Check for Updates and About ScriptForge with the installed version.

The desktop updater checks asynchronously once per launch. Installation is user initiated and uses official Tauri signature/signed-version verification. It checks that work is safely saved before installing or restarting. Browser sessions do not install desktop updates.

## Installation

Download published installers from [GitHub Releases](https://github.com/wdk08/ScriptForge/releases): Apple Silicon Mac (aarch64 DMG), Intel Mac (x86_64 DMG), or Windows x64 (NSIS setup executable).

The downloads use ad hoc/unnotarized Mac signing and no Windows publisher signature. Expect OS warnings and possible policy blocks; read [installation instructions and limitations](INSTALLING.md). In-app update signatures remain required and do not confer publisher trust.

The first official version is **1.0.0**. Desktop targets are macOS 12+ and Windows x64. Release validation requires native tests, signed-package verification, packaged save/reopen checks and a real installed update on each supported architecture. See [platform validation](docs/PLATFORM-VALIDATION.md) for test scope and OS-policy limitations. If no installers appear, a public release has not yet been published.

Older development installations without an updater need a manual first installation. Replace the application only; keep its data and your screenplay folder. A development version numerically higher than 1.0.0 will not be downgraded by the updater.

## Saving and data

Choose **Screenplay Folder** for new Fountain files. Existing linked files continue saving in their original locations. Autosave updates the linked file; Export creates a separate copy. Resolve save/permission/conflict warnings before updating.

Screenplay files live in selected external folders. Native grants and backups use the operating system's app-data directory for `com.scriptforge.desktop`; recovery, preferences, imported models and table-read settings use WebView IndexedDB. These locations are separate from replaceable application assets. Keep independent device backups; recovery does not protect against device loss or clearing application/browser data.

## Development

Requirements: Node.js 20+, npm, Rust 1.90+, and [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/). macOS requires Xcode Command Line Tools. Windows requires MSVC build tools, Windows SDK and WebView2.

```sh
npm ci
npm start
```

Open [localhost:4173](http://localhost:4173), rather than opening HTML files directly. Browser folder access depends on browser support; desktop builds use native picker-granted file access.

```sh
npm run desktop:dev
npm run desktop:build
```

The local build uses `tauri.local.conf.json`: ad hoc macOS signing and no signed updater archives. It is a development preview without updater archives. Official downloads also lack certified publisher signatures/notarization, while their updater archives are cryptographically signed. Outputs are in `src-tauri/target/release/bundle/`. See [RELEASING.md](RELEASING.md) for the approved distribution and validation workflow.

```sh
npm test
npm run check
npm run desktop:test
npm run test:browser -- --workers=2
npx playwright test --config=playwright.webkit.config.js --workers=2
npm run release:check
npm run audit:public
```

Install Playwright browsers first. Optional real Piper tests require `SCRIPTFORGE_PIPER_MODEL` and `SCRIPTFORGE_PIPER_CONFIG` pointing to a licensed compatible model/config pair; no voice weights are bundled. CI uses `playwright.ci.config.js` for its Chromium installation. There is no separate TypeScript/lint pipeline: `check` syntax-checks JavaScript, and Cargo validates Rust.

Packaged macOS tests use `npm run desktop:smoke` and `npm run desktop:stress -- --drafting --isolated-app` with temporary files/libraries. They do not reset the real library. Diagnostics are disabled in ordinary launches.

## Updates and troubleshooting

Use Help → Check for Updates for a manual result. Automatic network failures are quiet. Notes are plain text; unknown download sizes use indeterminate progress. A failed signature, download, save or installation keeps the session open and permits retry.

On macOS, installation may finish before restart; Restart Later lets you continue editing. Restart Now repeats the save barrier for subsequent edits. On Windows, download/verification precedes Install and Restart; installation saves work and launches the installer, which closes the app.

Resolve file warnings, reconnect permissions, or Export a safety copy if saving fails. Do not clear application data/recovery to troubleshoot updates. Before the first public release the update endpoint may be unavailable. Up-to-date confirmation is shown only for a manual check.

## Source and third-party notices

ScriptForge is Copyright (C) 2026 wdk08 and free software under **GPL version 3 only**. You may modify and redistribute it under that license; it comes without warranty. See [LICENSE](LICENSE), [COPYRIGHT](COPYRIGHT), [third-party notices](THIRD_PARTY_NOTICES.md) and [source availability](SOURCE_CODE.md). Your screenplays and imported voice models do not become GPL merely by using the app.

Piper and Table Reads remain available. The speech runtime is rebuilt from pinned, included Piper/eSpeak sources. Third-party code retains its notices, and unmodified Courier Prime fonts remain OFL-1.1. No voice weights are bundled. Every official binary release must include its matching source archive and retained dependencies/build instructions. See [licensing review](docs/LICENSING-REVIEW.md).

Release publication is manual and approval controlled. See [RELEASING.md](RELEASING.md) and [release readiness](docs/RELEASE-READINESS.md).

## Browser app and Writing Statistics (1.1)

The same editor can be built as a static app: `npm run build:web`, then
`npm run preview:web` and open http://localhost:4174/ScriptForge/.
See [browser hosting and writing statistics](docs/BROWSER-AND-WRITING.md) for
local storage/backup limitations, metric definitions and manual Pages deployment.
