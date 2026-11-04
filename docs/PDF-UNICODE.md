# Unicode PDF export

Courier Prime remains the screenplay font for text it covers. Paragraphs requiring additional glyphs use the bundled, unmodified DejaVu Sans Mono 2.37 fallback. The fallback is scaled by 1228/1233 to match Courier Prime's actual advance. Both fonts are embedded and subset in PDF output.

The editor, continuation markers, title fields, DOM measurer and PDF select the same fallback. Fixed margins, line height, scene-number gutters and page-break rules remain shared. Plain JavaScript font coverage tables are tied to SHA-256 hashes of the exact TTF files.

jsPDF does not apply OpenType GPOS positioning. Combining marks therefore use zero advances and explicit anchoring. PDF 1.4 ActualText tags preserve the original code-point sequence for selection, search and extraction. No screenplay or Fountain text is normalized or rewritten by export.

The regression fixture covers straight and curly quotes/apostrophes, em/en dashes, ellipses, accented Latin letters, decomposed accents, Greek/Cyrillic letters, check marks, arrows and hearts. Exported text is independently extracted with Poppler. Native release validation generates a PDF on each supported platform and verifies all three files before publication.

Standard Unicode 17 emoji, including supported skin tones, flags, variation selectors and ZWJ sequences, use bundled Twemoji 17.0.3 artwork. Each grapheme occupies two screenplay cells in both DOM measurement and PDF; the surrounding Courier text and 16px line height are unchanged. PDFs embed color images at 144px resolution with invisible text carriers and PDF ActualText tags for searchable/copyable original sequences in readers supporting ActualText. Export metadata retains attribution. No network is used at export time.

Coverage is finite. Unrecognized emoji sequences or glyphs outside the bundled fonts still produce a precise diagnostic; no placeholders or text substitutions are inserted. Text-presentation selectors keep text presentation. Bold/italic runs use the existing Fountain inline AST and real embedded Courier/DejaVu font faces, with the same measurement as the editor. The live document is never modified for export.

## Testing

- `npm test`: font/coverage hashes, Unicode diagnostics, Tab classification, undo/redo, and existing model regressions.
- `npm run test:browser`: generated PDFs, exact extraction, layout and real keyboard/caret behavior. Install Poppler (`brew install poppler` or `apt-get install poppler-utils`), or set `PDFTOTEXT` to its `pdftotext` binary. CI installs Poppler before these tests.
- `npm run test:web`: the production static browser application, including the same Unicode PDF proof.
- Native smoke checks include the cue Tab transaction and save `test-results/native-unicode.pdf`; the release's `pdf-proof` job extracts text independently from all three platform outputs.

Third-party font conditions and upstream provenance are in `assets/fonts/DejaVu-LICENSE.txt` and `assets/fonts/README.md`.
