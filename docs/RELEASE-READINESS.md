# Public release readiness

This records preparation, not a claim that an update has shipped.

## Locally configured

- First official version 1.0.0, main branch, repository wdk08/ScriptForge.
- Existing app identifier com.scriptforge.desktop retained.
- Official Tauri v2 updater, HTTPS GitHub metadata, version-bound signature verification and default newer-only comparison.
- Owner's public verification key embedded; private key/password remain outside source/packages.
- Native once-per-launch state, manual Help check, one About dialog using actual native version, styled dialogs and real/indeterminate progress.
- Verified download/install phases, Windows installer exit handling, macOS restart deferral, and save/recovery/preference barriers.
- Manual release workflow for both macOS architectures and Windows x64, signed updater artifacts, Mac ad hoc signature/architecture checks and unsigned Windows status checks.
- Secrets/user data/historical validation excluded. Curated test fixtures anonymized; third-party notices retained.
- Initial commit identity configured locally as wdk08 with the owner's approved GitHub no-reply address; global Git settings unchanged.

## Still required before publication

- Owner approval to push the reviewed source; separate approval for initial release publication. No upload is authorized by the preparation request.
- Validate the new GPLv3 source/notice packaging in the approved cross-platform workflow. The owner authorized GPL-3.0-only for original code/artwork. Piper is rebuilt from pinned sources; actual source archive and voice tests are required. See docs/LICENSING-REVIEW.md.
- Owner reports both updater secrets configured; the approved build must verify they match the embedded public key. No paid Apple/Windows credentials are required under the owner-selected ad hoc/unnotarized Mac and unsigned Windows policy. Repository security settings are not changed automatically.
- Review the initial commit inventory before approving a push. No destructive Git operation is required.
- Execute Intel/Windows CI builds and verify actual signatures/installers on those platforms. Apple Silicon compilation alone proves neither.
- Verify public metadata/binary access after an approved release exists.
- Approve an isolated test update channel if needed; perform a real installed-version download/install/restart/data-preservation test on macOS and Windows. No end-to-end update success is claimed yet.

## Audit boundaries

.gitignore excludes dependencies/build outputs, .env/private key/certificate files, local grants, databases, local screenplay folders, recovery/backups and historical validation/. Curated screenplay/media fixtures remain included. No private signing key is read by the public-key helper. No existing Git history was present. GPL-3.0-only is now explicitly authorized for original work, with third-party licenses retained. The original commit is preserved.

The audit prints filenames/categories rather than matched secret values. Pattern scanning supplements manual review; it cannot guarantee detection of every sensitive item. Third-party license obligations remain separate and mandatory.

## Licensing and next steps

Local GPL metadata, full license/notices, packaged legal UI, traceable Piper source build and source-release workflow gates have been implemented. No functionality was removed. No voice weights are bundled. Source archives are generated locally before any approved upload. See docs/PLATFORM-VALIDATION.md for the owner-confirmed choice to omit paid publisher credentials and the remaining separate Intel/Windows/real-installed-update checks. Nothing in local licensing preparation proves a public or installed update has succeeded.
