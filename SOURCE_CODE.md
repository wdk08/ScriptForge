# Source code and license

ScriptForge is Copyright (C) 2026 wdk08 and licensed under GPL version 3 only.
You may modify and redistribute it under that license. It comes without
warranty. Read `LICENSE`, `COPYRIGHT` and `THIRD_PARTY_NOTICES.md`.

For each official installer/updater version, obtain the matching
`ScriptForge-X.Y.Z-source.tar.gz` and SHA-256 file beside that version's binaries:

https://github.com/wdk08/ScriptForge/releases

The release source archive includes the app's preferred source, build/install
scripts, exact locked Cargo sources, readable npm dependency sources/notices,
Piper/eSpeak sources and data inputs, and pinned ONNX Runtime/jsPDF upstream
source releases and build recipes. `BUILD.md` explains rebuilding and installing
modified versions. A GitHub auto-generated source zip alone is not our complete
corresponding-source package. Each release archive must match its binary build.

The official repository is https://github.com/wdk08/ScriptForge . Before an
approved release is published, no public source archive or installer is claimed
to be available. Local development copies can create a review archive using
`npm run release:source`; that command never uploads it.

For GitHub downloads, use GPLv3 section 6(d): offer matching source at no charge,
without extra login/payment restrictions, from the same release as the binaries.
Keep source available for as long as the binaries are offered, and retain old
source packages for already distributed versions. Do not substitute a promise
to email source or a moving upstream branch for matching source. If distributing
via another channel, arrange an appropriate GPL section 6 source mechanism for
that channel rather than assuming a GitHub link covers every situation.

Official signing authenticates official updates. You do not need the project's
private updater key, Apple certificate or Windows certificate to build or install
a modified copy. Local preview builds use ad hoc signing on macOS and manual
installation. Use your own identity, updater key and endpoint when distributing
a fork; do not use the official update identity for a different product. No
anti-tampering restriction is imposed on your own installed builds. User-product
installation information under GPLv3 section 6 must be supplied where applicable;
do not sell locked hardware containing this software without reviewing that duty.

This license applies to software, not your screenplay or private imported voices
simply because you edit/use them in ScriptForge. Fonts retain OFL; imported models
and system voices have their own terms. No App Store distribution is configured.
