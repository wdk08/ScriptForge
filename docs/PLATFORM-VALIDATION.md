# Remaining platform and installed-update validation

Status October 19, 2026: the owner reports both Tauri updater secrets configured
and explicitly chose **no paid Apple/Windows publisher credentials**. ScriptForge
uses ad hoc/unnotarized macOS apps and unsigned Windows apps/installers. Updater
signatures and signed-version verification remain mandatory. This choice removes
the paid-signing prerequisite; it does not remove OS policy/installation friction.
See INSTALLING.md. The existing initial commit is preserved. No source push,
workflow dispatch, release/draft upload or publication is authorized by this file.

## 1. Confirm the updater secrets through the approved build

The existing production public key stays unchanged. The workflow requires
TAURI_SIGNING_PRIVATE_KEY and TAURI_SIGNING_PRIVATE_KEY_PASSWORD, signs actual
update packages and verifies them with the official plugin and embedded public
key. No secret value is displayed or fetched by the audit. Local GitHub CLI is
not authenticated, so the owner's setup is recorded as reported, not as tested.
Do not generate another production key, send secrets in chat, or purchase platform
certificates for this route. No APPLE_* or WINDOWS_* secret is needed.

## 2. Run build-only validation after explicit approval

After approval to push a reviewed commit, dispatch **Validate desktop builds** on
that exact main SHA. It has contents:read, no release-writing job and no automatic
push trigger. Separate approval is needed to upload its validation artifacts.

- Apple Silicon: macos-15 / aarch64-apple-darwin.
- Intel: macos-15-intel / x86_64-apple-darwin.
- Windows: windows-latest / x86_64-pc-windows-msvc.

Each target builds on its matching CPU, runs Rust tests, verifies actual signed
updater bytes/version and validates the selected platform-signing status. Packaged
save/reopen checks use synthetic temporary libraries. Corresponding source and
installers/checksums are retained as matching Actions artifacts for 14 days. Do
not distribute the validation binaries without their source/notices. An automatic
GUI test failing on a hosted runner needs diagnosis, not silently skipping it.
No real Intel/Windows result is claimed until that workflow actually executes.

## 3. Test browser-downloaded installation on real devices

Download validation installers using your own GitHub account, with their source
and checksum artifacts. The Actions zip must be extracted first. Later repeat
with actual public GitHub downloads; quarantine/reputation may differ from locally
built files. Record OS/CPU, commit, package hash, prompts and result separately.

On Intel Mac and Apple Silicon:

1. Confirm the DMG architecture matches; compare the checksum.
2. Install the app in a writable Applications location, eject the DMG and launch
   the installed copy. Confirm the ad hoc signature remains intact. No Developer
   ID/notarization success is expected or claimed.
3. Observe Gatekeeper. If the app is trusted and policy permits, follow Apple's
   app-specific Privacy & Security → Open Anyway flow in INSTALLING.md. Do not
   remove quarantine attributes or turn off Gatekeeper globally.
4. Test Fountain import, same-file saving, title/rename/conflict handling, PDF,
   pagination/settings, imported Piper and system voices, recovery and backups.
5. Quit/reopen and verify About, folder permissions, content and saved settings.

On Windows x64:

1. Verify setup/app Authenticode status is NotSigned, as intended; compare hashes.
2. Test the per-user NSIS installation under a standard account with WebView2.
3. Record SmartScreen/Unknown publisher prompts. An app-specific Run anyway option
   may be available. Smart App Control or organization policy may block the app
   completely; do not disable those protections. Record that platform limitation.
4. Repeat the same editor, saving, audio, PDF and restart/data checks.

Hosted native smoke tests do not establish how a quarantined Internet download
will behave. Neither updater signatures nor checksums certify publisher identity.

## 4. Real installed-version update test

Do not publish a fake 1.0.1 solely for testing. Prepare two local builds on an
isolated test identity/storage, with a throwaway updater key and test endpoint;
version A must be lower than B. Alternatively use an explicitly approved isolated
prerelease channel. Keep production config/key/endpoint and real user data intact.
A local harness still needs review/implementation; no test release is created by
the validation workflow and no real installed update has been performed yet.

Run on both Mac architectures and Windows:

1. Install A in an isolated location/account; create synthetic script, title,
   margins, voice assignments, profile, folder grant and native backup.
2. Leave pending edits. Offer signed B metadata/package and verify discovery,
   once-per-launch checking, notes, Later, manual checking and real progress.
3. Test bad/missing signatures, signed-version mismatch, offline/interrupted
   download and metadata failures. Never weaken production signature/TLS checks.
4. Cause a save failure; installation must be blocked and editing remain available.
5. Recover saving, install B and inspect OS prompts. On Mac, postpone restart,
   edit again, then restart and verify that second edit. On Windows, verify saving
   before the installer exits the old app. Unsigned-policy blocks remain possible.
6. Compare exact Fountain/recovery/settings/backups/voices/grants, confirm B in
   About and record actual install/restart success or failure. A passing mock,
   signature-only check or ordinary process reopen is not an installed update.

If the OS refuses a tested update, report the limitation and test manual app
replacement with data retained. Do not claim automatic updating works everywhere.

## 5. Prepare a release draft only with separate approval

After build validation and review, an approved **Official release** run with
Publish off creates the draft, matching source, installers, updater signatures,
checksums and latest.json. Its matrix checks ad hoc/unsigned status rather than
requiring paid certificates. A draft does not exercise stable public discovery.
Never overwrite/delete an existing draft/tag blindly; inspect failed runs.

Publishing v1.0.0 remains a separate explicit approval. Verify public metadata,
binary/source/checksum access after that approval; no public reachability is
claimed before publication. No test should reset the user's real application data.

Primary documentation:
- https://v2.tauri.app/distribute/sign/macos/
- https://v2.tauri.app/distribute/sign/windows/
- https://docs.github.com/en/actions/reference/runners/github-hosted-runners
- https://support.apple.com/en-us/102445
- https://support.microsoft.com/en-us/windows/security/threat-malware-protection/smart-app-control-frequently-asked-questions
