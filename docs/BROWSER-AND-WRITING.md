# ScriptForge 1.1: browser app and writing statistics

## Shared application

The web and Tauri builds use the same structured document, editing/history,
Fountain, pagination, PDF, character, Table Read and voice-library modules.
`build:web` publishes only an explicit frontend/license asset list into `dist/web`.
It excludes native executables, credentials, grants, screenplay data and development
folders. Native storage, backups and signed updates remain desktop features.

Run `npm ci`, `npm run build:web`, then `npm run preview:web`.
Visit **http://localhost:4174/ScriptForge/**. This preview deliberately uses the
GitHub Pages project subdirectory and has no local filesystem helper/backend.
Opening `editor.html?id=…` or refreshing it works without server-side routes.
Use `npm run test:web` for production browser tests (install Playwright Chromium
first). An installed Chrome can be used with `SCRIPTFORGE_TEST_BROWSER=chrome`.

Browser recovery and version-history snapshots are local IndexedDB data. They are
not cloud sync and can disappear when site data is cleared or storage is evicted.
Export Fountain for an independent portable backup, or PDF for a presentation copy.
A browser download is a separate copy, not a persistent autosave grant. Linked-file
and folder saving use the File System Access API where supported; permission can
expire. Safari and other browsers without that API retain recovery and exports;
the installed app provides native folder saving. The hosted app does not call the
localhost saving helper. Changing from localhost to GitHub Pages does not migrate
browser data; export/import screenplays explicitly.

Browser speech voices depend on the device and may require internet. Compatible
imported Piper models run locally using the existing single-threaded WASM worker;
large voices consume browser storage/memory. Model import compatibility checks and
voice assignment persistence remain in the existing Voice Library. Voice models
are not included in the web distribution. Speech playback may require a gesture.

The Download menu fetches only GitHub's latest stable published release. It matches
macOS ARM/Intel DMGs and Windows x64 EXEs, rejecting missing/ambiguous matches and
unexpected hosts. If GitHub is unavailable/rate-limited it offers a visible error
and the public release page. Desktop windows do not display this menu.

## Writing-session semantics

Opening a screenplay begins a segment. Home alone does not begin a session.
Home and application close pause tracking. Reopening within 30 minutes of pause
resumes the overall session; later reopening begins another. Switching scripts
creates another segment in the same session. Aggregation uses document IDs, not
filenames/titles. Imported copies with new IDs are independent screenplays.

Active screenplay time counts visible, engaged editor time until five minutes of
inactivity. Editing time is the portion within 30 seconds after a document edit.
These are explicit activity windows, not a claim to measure thought or continuous
keystrokes. Settings, other dialogs, background windows and suspended/system-sleep
intervals are excluded. Elapsed span includes pauses between segments; active time
never includes those pauses. Daily time is divided at local midnight; the view
shows the last seven days and a rolling weekly total.

Counts exclude title-page/hidden metadata and use the existing inline-text projection.
Gross words added/deleted compare word inventories, avoiding inflation from element
reordering and per-character keystrokes within a typing burst. The burst settles
after one second or a checkpoint. Words typed count new word starts in insert
commands, excluding paste and undo/redo. Undo/redo change net totals, pages and
scene deltas, while leaving historical gross activity unchanged. Cut/paste within
30 minutes credits matching moved words back to their original segment rather
than reporting new writing. This credit is persisted with the session.

Net words/pages and scene counts compare segment baselines with final document
snapshots. Pages come from the actual editor paginator, never words-per-page.
Scene IDs distinguish creation/removal from renaming. A created scene that is
undone is absent from net scene totals. Daily added/deleted totals are gross
activity; net document deltas are shown for sessions/screenplays.

A separate `scriptforge-writing` IndexedDB database stores transactional session
checkpoints. Heartbeats run every ten seconds; saves also occur on pause, lifecycle
changes and statistics viewing. A crash can lose up to the last heartbeat's
uncommitted statistics but never invents closed time or alters screenplay recovery.
Clock discontinuities and long timer gaps are excluded. A renewable atomic lease
prevents concurrent windows from recording duplicate sessions; a competing window
shows a warning and retries. After a crash the lease can take up to 55 seconds to
expire. Screenplay editing/saving remains independent of statistics availability.
Clearing statistics requires confirmation and does not delete documents or voices.

## Enable GitHub Pages after deployment approval

1. In repository **Settings → Pages**, choose **GitHub Actions** as the source.
2. Under **Actions**, run **Browser app on GitHub Pages** from the reviewed main.
3. The workflow runs unit/syntax/static-web and production-browser checks, uploads
   the frontend artifact, then deploys through the protected `github-pages` environment.
4. The expected project URL is **https://wdk08.github.io/ScriptForge/**.

The Pages workflow has only a manual trigger. Source pushes do not deploy it or
trigger desktop release workflows. Native release/signing workflows remain separate.
