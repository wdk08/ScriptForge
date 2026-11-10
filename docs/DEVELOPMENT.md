# ScriptForge Dev

From a checkout of ScriptForge, install the locked dependencies:

```sh
npm ci
```

Use Node 20.19+ or 22.12+ (Node 22 LTS recommended), npm, and for native development the existing Rust toolchain and Xcode Command Line Tools. Vite is the only new direct development dependency; production builds retain their existing pipeline.

## Browser development

```sh
npm run dev:browser
```

Open **http://127.0.0.1:5179/**. Both the homepage and editor load directly from source. Use this for planning boards and rapid frontend work. Always use this exact origin to see the same Dev recovery data. A purple **ScriptForge Dev** badge identifies the environment.

CSS updates use hot module replacement without reloading the page. Plain JavaScript modules and HTML changes automatically reload; there is no framework-level state-preserving JavaScript HMR. Save/recover work across reloads as usual. Avoid changing source during active IME composition or before recovery finishes saving; never use your only copy of a screenplay as development input.

Browser Dev uses isolated IndexedDB recovery, preferences, backup snapshots, writing statistics, and imported voices. Open/import reads a copy; writable filesystem handles and the old local saving helper are disabled. Export explicitly downloads a copy. Browser recovery is not a separately saved Fountain file. Use native Dev below to test disk autosaving.

The fixed port fails rather than silently moving to another origin. The server binds only loopback and does not expose the original checkout, native sources, local grants, or release configuration. Do not forward it publicly.

## Native macOS development — no installer

```sh
npm run dev:mac
# Equivalent: npm run desktop:dev
```

This runs `tauri dev` with `src-tauri/tauri.dev.conf.json`. It launches **ScriptForge Dev** directly as a debug executable. The first launch compiles Rust; later frontend edits need no Rust compilation. It never packages a DMG or installer. The browser and native app can share the running Vite server. If Vite is not running, Tauri starts it for you.

Native Dev has identifier **com.scriptforge.dev**, a separate application-data directory and, on macOS 14+, an explicit independent WebKit data-store identifier. The native dev URL differs from production's app origin. All application databases also have a `scriptforge-dev-` prefix. Browser Dev and native Dev use different browser profiles, so their test data is independent.

On macOS, native files are under:

```
~/Library/Application Support/com.scriptforge.dev/
  file-grants.json
  backups/
  sandbox/screenplays/
  sandbox/exports/
```

Native Dev writes managed screenplays to `sandbox/library` under its own application data directory. External Fountain files are imported as separate library copies. Existing Dev references can only be read inside the old Dev screenplay sandbox; symlink escapes are rejected. PDF/Fountain exports create unique copies inside `sandbox/exports`. Production's `Documents/ScriptForge`, file grants and backups are never automatically reused. Dev does not migrate production recovery, preferences, statistics or voices.

Production update checks are disabled in both the frontend and native backend; the Dev override has no updater endpoints/key. Production identifiers, signing, updater settings and release workflows are unchanged. Raw interactive `tauri dev` without the Dev override fails closed rather than starting with the production identity.

The native process is an unbundled debug executable, so some OS process/menu labels may still use the binary name `scriptforge`. The window title, app-data identity and visible badge identify Dev.

## Changes and restarts

| Change | What happens |
|---|---|
| CSS | Hot update; current page/editor stays open |
| JavaScript or HTML | Automatic frontend reload; recovery may be offered |
| Images, models or other static assets | Reload the page if the resource is cached/already loaded |
| Rust source | Tauri automatically recompiles and relaunches the debug app |
| Tauri config, capabilities, environment flags | Stop and restart `npm run dev:mac` to refresh merged settings |
| Vite config or `scripts/dev-runtime.js` | Restart Vite; restart native Dev if it owned that server |
| Dependencies | Stop Dev, run `npm ci` after lockfile changes, then restart |

Use Ctrl+C in the terminal that owns the process. If native Dev reuses a separately started Vite server, stop each in its own terminal. Nothing is installed over the production application.

## Checks

```sh
npm test
npm run check
cargo test --manifest-path src-tauri/Cargo.toml
# Optional actual native Dev smoke check; creates synthetic Dev-only data and exits the app:
SCRIPTFORGE_DEV_CHECK=1 npm run dev:mac
```

The opt-in check logs `SCRIPTFORGE_DEV_CHECK` JSON after creating, reopening, and exporting a synthetic screenplay using the isolated native library. The fixture is archived in Dev and its PDF remains in the Dev exports directory for inspection.

Do not run `desktop:build` or `desktop:release` for normal development; those remain packaging/release commands.
