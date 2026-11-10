import { prepareEmoji } from './emoji.js';
import { inlineUnits } from './inline-layout.js';
import { pdfTextWriter, validatePDFCharacters } from './pdf-unicode.js';
import { needsUnicodeFont, UNICODE_SCALE } from './unicode-fonts.js';
import { elementLayout } from './right-margins.js';
import { isDesktop, exportDesktop } from './desktop.js';
import { titlePageFields, titleContactLayout } from './title-page.js';
import { createMeasurer, layoutUnits, paginate, PAGE } from './pagination.js';
import { fountainFilename } from './files.js';
import { parseInline } from './inline.js';
import { transitionClass } from './transitions.js';
import { FORMAT, elementColumn, ensureScreenplayFonts, fontBaseline } from './screenplay-format.js';
let library;
async function pdfLibrary() {
  if (!library) library = new Promise((resolve, reject) => {
    if (window.jspdf) { resolve(window.jspdf.jsPDF); return; }
    const script = document.createElement('script'); script.src = new URL('../vendor/jspdf.umd.min.js', import.meta.url).href;
    script.onload = () => window.jspdf ? resolve(window.jspdf.jsPDF) : reject(new Error('PDF library could not be loaded.'));
    script.onerror = () => reject(new Error('PDF export could not load its local library.')); document.head.append(script);
  }).catch(error => { library = null; throw error; });
  return library;
}
const printable = new Set(['titleField', 'scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'centered', 'lyric', 'whitespace', 'pageBreak']);
export function printableDocument(document) {
  const doc = structuredClone(document);
  const plain = nodes => nodes.map(node => ['note', 'boneyard'].includes(node.type) ? '' : node.children ? plain(node.children) : node.text).join('');
  doc.elements = doc.elements.filter(el => printable.has(el.type)).map(el => {
    const units=inlineUnits(el.text).filter(u=>!u.raw);let at=0;
    const inlineStyles=[];for(const u of units){const start=at;at+=u.text.length;if(!u.bold&&!u.italic&&!u.underline)continue;
      const previous=inlineStyles.at(-1);if(previous&&previous.end===start&&previous.bold===!!u.bold&&previous.italic===!!u.italic&&previous.underline===!!u.underline)previous.end=at;
      else inlineStyles.push({start,end:at,bold:!!u.bold,italic:!!u.italic,underline:!!u.underline});
    }
    return {...el,text:plain(parseInline(el.text)),inlineStyles};
  });
  return doc;
}
async function fontData(name, family = 'CourierPrime') {
  const response = await fetch(new URL(`../assets/fonts/${family}${name ? `-${name}` : ''}.ttf`, import.meta.url));
  if (!response.ok) throw new Error('PDF export could not load its local Courier font.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export async function createScreenplayPDF(document) {
  const [PDF, regular, bold, unicode, unicodeBold,italic,boldItalic,unicodeItalic,unicodeBoldItalic] = await Promise.all([pdfLibrary(), fontData('Regular'), fontData('Bold'), fontData('', 'DejaVuSansMono'), fontData('Bold', 'DejaVuSansMono'),fontData('Italic'),fontData('BoldItalic'),fontData('Oblique','DejaVuSansMono'),fontData('BoldOblique','DejaVuSansMono'), ensureScreenplayFonts()]);
  const doc = printableDocument(document);
  const title = titlePageFields(doc);
  const { images: emojiImages, fallback } = await prepareEmoji([...doc.elements.map(el=>el.text),...Object.values(title)]);
  validatePDFCharacters(doc, title, emojiImages);
  const measure = window.document.createElement('div'); measure.className = 'measurement pdf-measure'; measure.setAttribute('aria-hidden', 'true'); window.document.body.append(measure);
  let pages, baseline, boldBaseline, unicodeBaseline, unicodeBoldBaseline;
  try {
    pages = paginate(layoutUnits(doc, createMeasurer(measure)));
    baseline = fontBaseline(measure); boldBaseline = fontBaseline(measure, FORMAT.fontSize, FORMAT.lineHeight, true);
    unicodeBaseline = fontBaseline(measure, FORMAT.fontSize*UNICODE_SCALE, FORMAT.lineHeight, false, 'ScriptForge Unicode');
    unicodeBoldBaseline = fontBaseline(measure, FORMAT.fontSize*UNICODE_SCALE, FORMAT.lineHeight, true, 'ScriptForge Unicode');
  } finally { measure.remove(); }
  const pdf = new PDF({ unit: 'pt', format: 'letter', compress: true, putOnlyUsedFonts: true });
  // ActualText for combining clusters is standardized in PDF 1.4.
  pdf.__private__.setPdfVersion('1.4');
  pdf.addFileToVFS('CourierPrime-Regular.ttf', regular); pdf.addFont('CourierPrime-Regular.ttf', 'CourierPrime', 'normal');
  pdf.addFileToVFS('CourierPrime-Bold.ttf', bold); pdf.addFont('CourierPrime-Bold.ttf', 'CourierPrime', 'bold');
  pdf.addFileToVFS('DejaVuSansMono.ttf', unicode); pdf.addFont('DejaVuSansMono.ttf', 'ScriptForgeUnicode', 'normal');
  pdf.addFileToVFS('DejaVuSansMono-Bold.ttf', unicodeBold); pdf.addFont('DejaVuSansMono-Bold.ttf', 'ScriptForgeUnicode', 'bold');
  for(const [filename,family,style,data]of [
    ['CourierPrime-Italic.ttf','CourierPrime','italic',italic],['CourierPrime-BoldItalic.ttf','CourierPrime','bolditalic',boldItalic],
    ['DejaVuSansMono-Oblique.ttf','ScriptForgeUnicode','italic',unicodeItalic],['DejaVuSansMono-BoldOblique.ttf','ScriptForgeUnicode','bolditalic',unicodeBoldItalic]
  ]){pdf.addFileToVFS(filename,data);pdf.addFont(filename,family,style);}
  // jsPDF otherwise truncates each TTF advance to an integer in 1/1000 em,
  // accumulating a measurable drift across a full line. Preserve the real widths.
  for (const face of ['CourierPrime','ScriptForgeUnicode']) for (const style of ['normal', 'bold','italic','bolditalic']) {
    pdf.setFont(face, style);
    const metadata = pdf.getFont().metadata;
    // OpenType shaping makes combining marks non-advancing in the browser.
    // jsPDF does not apply GPOS, so mirror that advance explicitly.
    const marks = new Set(Object.entries(metadata.cmap.unicode.codeMap).filter(([code]) => /\p{M}/u.test(String.fromCodePoint(Number(code)))).map(([,glyph])=>glyph));
    const advance = metadata.widthOfGlyph.bind(metadata);
    metadata.widthOfGlyph = glyph => marks.has(glyph) ? 0 : advance(glyph);
    const glyphs = [...new Set(Object.values(metadata.cmap.unicode.codeMap))];
    metadata.Unicode.widths = glyphs.flatMap(glyph => [glyph, [metadata.widthOfGlyph(glyph)]]);
  }
  pdf.setProperties({ title: doc.title, creator: 'ScriptForge',subject:fallback.size ? 'Emoji fallback artwork: Twemoji 17.0.3, Twitter, Inc. and contributors; CC BY 4.0 https://creativecommons.org/licenses/by/4.0/ https://github.com/jdecked/twemoji' : 'ScriptForge screenplay' });
  const byId = new Map(doc.elements.map(el => [el.id, el]));
  const scale = .75;
  pdf.setFont('CourierPrime', 'normal'); pdf.setFontSize(12);
  const {draw,wrap} = pdfTextWriter(pdf,emojiImages);
  const titleLines = wrap(title.title.toUpperCase(), 444);
  draw(titleLines, 306, 240, { align: 'center', baseline: 'top', lineHeightFactor: 1.25 });
  const creditY = 240 + titleLines.length * 15 + 36;
  const creditLines = wrap(title.credit, 444);
  draw(creditLines, 306, creditY, { align: 'center', baseline: 'top', lineHeightFactor: 1.25 });
  draw(wrap(title.author, 444), 306, creditY + creditLines.length * 15 + 15, { align: 'center', baseline: 'top', lineHeightFactor: 1.25 });
  const contact = [title.address, title.phone, title.email].filter(Boolean).join('\n');
  if (contact) {
    const layout = titleContactLayout(PAGE.width, PAGE.height, scale, contact);
    const lines = layout.lines;
    const top = layout.bottom - lines.length * layout.lineHeight;
    lines.forEach((line, index) => {
      draw(line, layout.x, top + index * layout.lineHeight, { align: 'left', baseline: 'top' });
    });
  }
  pages.forEach((page, index) => {
    pdf.addPage('letter', 'portrait');
    pdf.setFont('CourierPrime', 'normal'); pdf.setFontSize(12);
    pdf.setCharSpace(0);
    if (index > 0) draw(`${index + 1}.`, FORMAT.pageNumberX * scale, (FORMAT.pageNumberY + baseline) * scale, { baseline: 'alphabetic' });
    let y = FORMAT.top;
    for (const item of page.items) {
      y += item.gap;
      const marker = (text, col, rowY) => {
        pdf.setFont('CourierPrime', 'normal'); pdf.setFontSize(12); pdf.setCharSpace(FORMAT.letterSpacing * scale);
        draw(text.toUpperCase().replace(/\n$/, ''), elementColumn('character', item.kind === 'dual', col).left * scale, (rowY + (needsUnicodeFont(text)?unicodeBaseline:baseline)) * scale, { baseline: 'alphabetic',tracking:FORMAT.letterSpacing*scale });
      };
      item.headers.forEach((lines, col) => lines.forEach((line, row) => marker(line.text, col, y + row * PAGE.lineHeight)));
      y += item.headerHeight;
      item.columns.forEach((lines, col) => lines.forEach((line, row) => {
        const model = byId.get(line.id), dual = item.kind === 'dual';
        let text = (line.displayText ?? model.text.slice(line.start, line.end)).replace(/\n$/, '');
        if (['scene', 'character', 'transition'].includes(model.type)) text = text.toUpperCase();
        const bold = model.type === 'scene' && doc.settings?.boldSceneHeadings === true;
        pdf.setFont('CourierPrime', bold ? 'bold' : 'normal'); pdf.setFontSize(12);
        pdf.setCharSpace(FORMAT.letterSpacing * scale);
        const column = elementLayout(model, dual, col, doc.settings);
        let x = column.left, width = column.width;
        if (model.type === 'parenthetical' && line.start === 0 && text.startsWith('(')) x -= FORMAT.parentheticalHang;
        
        const unicode = needsUnicodeFont(model.text,bold);
        const rowBaseline = unicode ? (bold ? unicodeBoldBaseline : unicodeBaseline) : (bold ? boldBaseline : baseline);
        const textY = (y + row * PAGE.lineHeight + rowBaseline) * scale;
        let align = 'left';
        if (model.type === 'transition' && !transitionClass(model)) { align = 'right'; x += width; }
        if (model.type === 'centered' || model.type === 'titleField') { align = 'center'; x += width / 2; }
        if (model.type === 'scene' && doc.settings?.sceneNumbers === true && line.start === 0 && model.sceneNumber) {
          draw(model.sceneNumber, FORMAT.sceneNumberLeft * scale, textY, { bold, baseline: 'alphabetic', tracking:FORMAT.letterSpacing*scale });
          draw(model.sceneNumber, FORMAT.sceneNumberRight * scale, textY, { bold, align: 'right', baseline: 'alphabetic', tracking:FORMAT.letterSpacing*scale });
        }
        if (text) draw(text, x * scale, textY, { align, baseline: 'alphabetic', bold, family:unicode?'unicode':'courier', styles:model.inlineStyles?.filter(s=>s.end>line.start&&s.start<line.end).map(s=>({...s,start:Math.max(0,s.start-line.start),end:Math.min(text.length,s.end-line.start)})),italic:model.type==='lyric', tracking:FORMAT.letterSpacing*scale });
      }));
      item.more.forEach((more, col) => { if (more) marker('(MORE)', col, y + item.bodyHeight); });
      y += item.bodyHeight + item.moreHeight;
    }
  });
  return { blob: pdf.output('blob'), emojiFallback: [...fallback], pages: pages.length + 1, name: fountainFilename(doc.title).replace(/\.fountain$/, '.pdf') };
}
export async function exportPDF(document) {
  const result = await createScreenplayPDF(document);
  if (isDesktop()) { await exportDesktop(result.blob, result.name); return result; }
  const url = URL.createObjectURL(result.blob), link = window.document.createElement('a');
  link.href = url; link.download = result.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  return result;
}
