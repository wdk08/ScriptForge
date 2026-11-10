import { emojiKey, isEmojiCluster } from './emoji.js';
import { FONT_COVERAGE } from './unicode-font-data.js';
// DejaVu Sans Mono has a 1233-unit advance; Courier Prime has 1228 (both /2048).
// Match their advances without changing screenplay geometry or tracking.
export const UNICODE_SCALE = 1228 / 1233;
export const hasGlyph = (family, char, bold = false) => FONT_COVERAGE[family + (bold ? 'bold' : 'normal')].ranges.some(([a,b]) => char.codePointAt(0) >= a && char.codePointAt(0) <= b);
export const needsUnicodeFont = (text, bold = false) => graphemes(text).filter(c=>!isEmojiCluster(c)).some(cluster => [...cluster].some(c => !/[\n\r\t]/.test(c) && !hasGlyph('courier', c, bold)));
export const screenplayFontFamily = (text, bold = false) => needsUnicodeFont(text,bold) ? "'ScriptForge Unicode', 'Courier Prime'" : "'Courier Prime'";
export function unsupportedCharacters(text, bold = false, supportedEmoji = emojiKey) {
 let offset=0;const missing=[];
 for(const cluster of graphemes(text)){if(supportedEmoji(cluster)){offset+=cluster.length;continue;}for(const char of cluster){if(char!=='\n' && char!=='\r' && !hasGlyph('courier',char,bold) && !hasGlyph('unicode',char,bold))missing.push({char,codePoint:`U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')}`,offset});offset+=char.length;}}
 return missing;
}
export const graphemes = text => [...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(item=>item.segment);

export function applyScreenplayFont(element,text,bold=false,size=16){element.style.fontFamily=screenplayFontFamily(text,bold);element.style.fontSize=`${size*(needsUnicodeFont(text,bold)?UNICODE_SCALE:1)}px`;}
