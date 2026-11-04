import { EMOJI } from './emoji-data.js';
export function emojiKey(text) {
 if (!/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(text) || text.includes('\ufe0e')) return null;
 const codes=[...text].map(c=>c.codePointAt(0).toString(16));
 const exact=codes.join('-'), normalized=codes.filter(c=>c!=='fe0f').join('-');
 // Text-presentation symbols remain typography unless explicitly requested as emoji.
 if (!/\p{Emoji_Presentation}|\ufe0f|\u20e3/u.test(text)) return null;
 return EMOJI.has(exact)?exact:EMOJI.has(normalized)?normalized:null;
}
export const emojiURL = key => new URL(`../assets/emoji/svg/${key}.svg`, import.meta.url).href;
export const EMOJI_WIDTH = 2*(16*1228/2048-.3);
const images=new Map();
export async function prepareEmoji(texts) {
 const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
 for(const text of texts)for(const {segment} of segmenter.segment(text)) {
  const key=emojiKey(segment);if(!key||images.has(key))continue;
  const image=new Image();image.src=emojiURL(key);await image.decode();
  const canvas=document.createElement('canvas');canvas.width=canvas.height=144;
  canvas.getContext('2d').drawImage(image,0,0,144,144);images.set(key,canvas.toDataURL('image/png'));
 }
 return images;
}
