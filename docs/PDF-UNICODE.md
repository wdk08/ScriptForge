# Unicode PDF export

Courier Prime remains the screenplay font for text it covers. Paragraphs requiring additional glyphs use the bundled, unmodified DejaVu Sans Mono 2.37 fallback. The fallback is scaled by 1228/1233 to match Courier Prime's actual advance. Both fonts are embedded and subset in PDF output.

The editor, continuation markers, title fields, DOM measurer and PDF select the same fallback. Fixed margins, line height, scene-number gutters and page-break rules remain shared. Plain JavaScript font coverage tables are tied to SHA-256 hashes of the exact TTF files.

jsPDF does not apply OpenType GPOS positioning. Combining marks therefore use zero advances and explicit anchoring. PDF 1.4 ActualText tags preserve the original code-point sequence for selection, search and extraction. No screenplay or Fountain text is normalized or rewritten by export.

The regression fixture covers straight and curly quotes/apostrophes, em/en dashes, ellipses, accented Latin letters, decomposed accents, Greek/Cyrillic letters, check marks, arrows and hearts. Exported text is independently extracted with Poppler. Native release validation generates a PDF on each supported platform and verifies all three files before publication.

Coverage is finite. Color emoji and glyphs outside both bundled fonts produce an error naming the character, Unicode code point, element/title field, line and column. The editor and Fountain content remain intact.

## Testing

- `npm test`: font/coverage hashes, Unicode diagnostics, Tab classification, undo/redo, and existing model regressions.
- `npm run test:browser`: generated PDFs, exact extraction, layout and real keyboard/caret behavior. Install Poppler (`brew install poppler` or `apt-get install poppler-utils`), or set `PDFTOTEXT` to its `pdftotext` binary. CI installs Poppler before these tests.
- `npm run test:web`: the production static browser application, including the same Unicode PDF proof.
- Native smoke checks include the cue Tab transaction and save `test-results/native-unicode.pdf`; the release's `pdf-proof` job extracts text independently from all three platform outputs.

Third-party font conditions and upstream provenance are in `assets/fonts/DejaVu-LICENSE.txt` and `assets/fonts/README.md`.
