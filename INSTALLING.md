# Installing ScriptForge 1.0.0

ScriptForge is distributed directly through the official GitHub Releases page:
https://github.com/wdk08/ScriptForge/releases . Download only an approved published
release matching your computer. Until publication is approved, no public installer
is claimed available. Validation-workflow artifacts are test builds, not releases.

## Signing status

| Platform | What the download provides |
| --- | --- |
| Apple Silicon / Intel Mac | Ad hoc code signature for binary integrity, no Apple Developer ID identity, no Apple notarization. |
| Windows x64 | NSIS per-user installer and app without an Authenticode publisher signature; prompts may show Unknown publisher. |
| In-app updates | Tauri cryptographic signatures and version verification are required on both platforms. These do not make Apple or Windows trust the publisher. |

This release approach needs no paid signing membership/certificate. It carries
additional installation friction and will not work on every security policy.
The owner explicitly selected it on October 19, 2026. No script disables OS
security, removes quarantine attributes or adds trust exceptions automatically.

## Mac installation

1. Choose the Apple Silicon (aarch64) or Intel (x86_64) DMG.
2. Mount the DMG and copy ScriptForge into Applications (or a writable personal
   Applications folder). Eject the image; launch the copied app, not the DMG copy.
3. Expect a warning that the developer cannot be verified or Apple cannot check
   the app. If you trust the official download, try opening it, then use System
   Settings → Privacy & Security → Open Anyway, and confirm the app-specific prompt.
4. If that option is unavailable on a managed Mac, contact its administrator.
   An ad hoc signature does not establish a trusted developer identity or satisfy
   notarization. Do not disable Gatekeeper globally or bypass a malware warning.

Exact wording and exceptions depend on macOS/policy. A warning that the app is
actually damaged or will harm the computer warrants investigating the download;
do not assume every warning is harmless merely because this build is unnotarized.

Apple's supported instructions: https://support.apple.com/en-us/102445 .
Tauri's ad hoc signing explanation: https://v2.tauri.app/distribute/sign/macos/ .

## Windows installation

1. Download the x64 NSIS setup executable and run it under your own Windows account.
   The per-user installation does not normally need administrator elevation.
2. The browser/SmartScreen may warn that the download or publisher is unrecognized.
   On personal devices an app-specific More info → Run anyway option may appear.
   Use it only if you trust the official file; it is not guaranteed to be available.
3. Defender, Smart App Control, WDAC/AppLocker or organization policy may block an
   unsigned installer or app outright. Smart App Control can reject unsigned apps;
   a SmartScreen exception does not override it. This build cannot promise support
   under those restrictions. Do not turn off antivirus, Smart App Control or an
   organization's protections just to install it; ask the administrator or use an
   appropriate supported alternative such as the browser version/source build.
4. WebView2 is required. The installer may download Microsoft's runtime if absent,
   so a first installation can need Internet access even though writing is local.

Microsoft's explanation: https://support.microsoft.com/en-us/windows/security/threat-malware-protection/smart-app-control-frequently-asked-questions .
Tauri's Windows distribution notes: https://v2.tauri.app/distribute/sign/windows/ .

## Verify a download

Each installer/updater package has a companion .sha256 file. Keep the downloaded
installer and matching checksum in the same directory. On Mac use
`shasum -a 256 -c <filename>.sha256`; on Windows use
`Get-FileHash -Algorithm SHA256 .\<filename>` and compare with its checksum file.
Matching values detect corruption; a hash downloaded from the same site does not
independently certify publisher identity or protect against compromise of that site.
Official in-app updates additionally verify their Tauri signature before install.
Never disable signature/version verification to fix an update failure.

## Updates and data

The first updater-enabled version requires manual installation over a development
build. Replace only the app, keeping its data and screenplay folder. Do not clear
IndexedDB, backups, imported voices or preferences to resolve installation problems.

Later updates still lack publisher certification/notarization and may encounter
OS prompts or policy blocks. Tauri signature verification alone does not prove
installation will succeed. If installation/restart fails, retain recovery and
backups and follow the manual replacement route; do not remove your data. If a
file-save error appears, resolve it before updating. Actual installed-version
updating must be tested separately on Mac and Windows before claiming success.

The complete GPLv3 source archive and notices are supplied beside every official
binary release. See SOURCE_CODE.md. ScriptForge's GPL does not license your scripts
or private imported voices. No voice models are bundled with the installer.
