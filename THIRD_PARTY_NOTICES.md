# Third-party notices — ScriptForge 1.0.0

ScriptForge's original work is Copyright (C) 2026 wdk08, GPL-3.0-only.
Third-party components retain their own authorship, notices and licenses. This
file is an index, not a replacement for those licenses. No voice model is
bundled or downloaded automatically by the application.

| Component / actual bundled files | Terms and retained notices |
| --- | --- |
| Piper phonemizer source (wide-video fork, commit `cfff8e52ebaea37c7e953ae2d06b174acb827ac4`); `vendor/piper/piper_phonemize.{js,wasm,data}` | Michael Hansen, MIT for Piper code; combined runtime includes GPL eSpeak NG. `vendor/piper/LICENSE-piper-phonemize`. Locally rebuilt from included sources; no longer copied from an untraceable npm binary. |
| eSpeak NG `0f65aa301e0d6bae5e172cc74197d32a6182200f`, compiled into the phonemizer and its dictionary/phoneme data | GPL-3.0-or-later; distributed with the GPLv3 ScriptForge combination. `vendor/piper/COPYING-espeak-ng`, `COPYING.APACHE`, `COPYING.BSD2`, `COPYING.UCD`; full upstream source and original notices in `third-party/piper-source/espeak-ng.tar.gz`. |
| uni-algo (included header, 0.8.1 / Unicode 15) and nlohmann/json 3.11.2 | MIT/public-domain options for uni-algo, MIT for JSON and embedded notices; `vendor/piper/LICENSE-uni-algo`, `LICENSE-json`; full headers and notices in the Piper source archive. |
| Sonic configure dependency, pinned `fbf75c3d6d846bad3bb3d456cbc5d07d9fd8c104` | Apache-2.0; source/LICENSE included. Speech-rate Sonic backend remains disabled, as in the previous runtime. |
| Emscripten 3.1.47 generated loader/system support | MIT / University of Illinois-NCSA; `vendor/piper/LICENSE-emscripten`; build toolchain and the exact SDK header workaround documented in `scripts/build-piper.mjs`. |
| ONNX Runtime Web 1.22.0, `vendor/onnx/*.{mjs,wasm}` | Microsoft, MIT; `vendor/onnx/LICENSE` and full upstream `ThirdPartyNotices.txt`. Official source and build/dependency recipes included in the source release. Only WebAssembly execution is shipped, not native MKL, CUDA, TensorRT or other optional execution providers described by the broad upstream notice. |
| jsPDF 4.2.1, `vendor/jspdf.umd.min.js` | MIT and preserved embedded contributor notices, including bundled subcomponents. `vendor/jsPDF-LICENSE.txt` and upstream source release. |
| Courier Prime 1.203, four `assets/fonts/*.ttf` | Copyright 2013 Quote-Unquote Apps. SIL OFL-1.1, Reserved Font Name Courier Prime. Unmodified; keep `assets/fonts/OFL.txt`. These fonts are aggregated under OFL, not relicensed under GPL. |
| Tauri, updater/dialog plugins, Rust/npm transitive dependencies | See `vendor/licenses/packages.json` (529 locked package records, including build/test and other-platform packages) and its content-addressed `texts/` directory for full retained notices. Original source is included in the release source bundle. |
| System WebView, browser TTS voices | Provided by the operating system/browser, not redistributed or relicensed by ScriptForge. No right to redistribute those voices is granted. |

The locked graph uses permissive licenses (MIT, Apache-2.0, BSD, ISC, Zlib,
Unicode and related reviewed licenses), plus MPL-2.0 files. Apache-2.0 is
compatible with GPLv3. For MPL components (`cssparser`, `cssparser-macros`,
`dtoa-short`, `option-ext`, `selectors`) we retain MPL notices and exact source
in the source bundle. Their inspected source has no attached Exhibit B
incompatibility notice; GPL combination follows MPL section 3.3, additionally
making those portions available under GPLv3 while preserving MPL source rights.
A copy of Exhibit B inside the unmodified license text is not an attached notice.
Optional license alternatives are recorded by `scripts/license-inventory.mjs`;
MIT is selected instead of optional LGPL terms where the upstream offers it.

The npm `@diffusionstudio/piper-wasm` 1.0.0 package declares MIT, but that label
cannot override eSpeak NG's GPL. It remains a locked historical/build reference;
its precompiled speech binaries are no longer used or recopied. Do not revert
to them when refreshing runtime assets. See `vendor/TTS-NOTICES.md`.

Imported voices/models are user data, outside this distribution and the app's
GPL grant. Each model/config/dataset may have separate copyright, attribution,
commercial-use, consent or redistribution conditions. An ONNX extension does
not establish licensing rights. Never bundle or offer a new voice without
reviewing its model card, weight license and dataset terms. The optional Lessac
low test fixture lives only in temporary test storage; its upstream model card
links separate Lessac dataset terms and is not evidence of permission to bundle
or commercially redistribute that voice.

See `SOURCE_CODE.md`, `docs/SOURCE-BUILD.md` and `docs/LICENSING-REVIEW.md` for
source availability, build instructions, compatibility scope and limitations.
