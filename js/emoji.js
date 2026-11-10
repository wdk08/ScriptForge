import { EMOJI } from './emoji-data.js';
export function emojiKey(text) {
 if (!/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(text) || text.includes('\ufe0e')) return null;
 const codes=[...text].map(c=>c.codePointAt(0).toString(16));
 const exact=codes.join('-'), normalized=codes.filter(c=>c!=='fe0f').join('-');
 // Text-presentation symbols remain typography unless explicitly requested as emoji.
 if (!/\p{Emoji_Presentation}|\ufe0f|\u20e3/u.test(text)) return null;
 return EMOJI.has(exact)?exact:EMOJI.has(normalized)?normalized:null;
}
const artworkBase=new URL('../assets/emoji/svg/',import.meta.url);
// Vite may normalize a directory asset URL without its trailing slash.
artworkBase.pathname=artworkBase.pathname.replace(/\/?$/,'/');
export const emojiURL = key => new URL(`${key}.svg`,artworkBase).href;
export const EMOJI_WIDTH = 2*(16*1228/2048-.3);
const nativeImages = new Map();
const fallbackImages = new Map();
const artworkSize = 144;

function nativeFont() {
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  if (/^win/i.test(platform)) return '"Segoe UI Emoji", sans-serif';
  if (/mac|iphone|ipad/i.test(platform)) return '"Apple Color Emoji", sans-serif';
  return '"Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
}

function rasterizeNative(text) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = artworkSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const size = 100;
  ctx.font = size + 'px ' + nativeFont();
  const metric = ctx.measureText(text);
  // A missing compound often renders as several independent glyphs. Use a
  // bundled image when the platform cannot shape it as a single emoji cell.
  if (!metric.width || metric.width > size * 1.55) return null;
  const left = metric.actualBoundingBoxLeft;
  const right = metric.actualBoundingBoxRight;
  const ascent = metric.actualBoundingBoxAscent;
  const descent = metric.actualBoundingBoxDescent;
  if (![left, right, ascent, descent].every(Number.isFinite) || left + right <= 0 || ascent + descent <= 0) return null;
  const scale = (artworkSize - 4) / Math.max(left + right, ascent + descent);
  ctx.translate(artworkSize / 2, artworkSize / 2);
  ctx.scale(scale, scale);
  ctx.fillText(text, (left - right) / 2, (ascent - descent) / 2);
  const pixels = ctx.getImageData(0, 0, artworkSize, artworkSize).data;
  // Refuse monochrome placeholder glyphs. Bundled fallback also covers native
  // glyphs whose artwork is intentionally monochrome and cannot be verified.
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] > 128 && Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) -
      Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 18) return canvas.toDataURL('image/png');
  }
  return null;
}

async function bundledImage(key) {
  if (!fallbackImages.has(key)) {
    const image = new Image();
    image.src = emojiURL(key);
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = artworkSize;
    canvas.getContext('2d').drawImage(image, 0, 0, artworkSize, artworkSize);
    fallbackImages.set(key, canvas.toDataURL('image/png'));
  }
  return fallbackImages.get(key);
}

export async function prepareEmoji(texts) {
  const images = new Map(), fallback = new Set();
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  for (const text of texts) for (const { segment } of segmenter.segment(text)) {
    if (images.has(segment) || !isEmojiCluster(segment)) continue;
    if (!nativeImages.has(segment)) {
      let image;
      try { image = rasterizeNative(segment); } catch { /* Canvas is restricted on this platform. */ }
      // Keep session memory bounded when exporting many unrelated screenplays.
      if (nativeImages.size >= 256) nativeImages.delete(nativeImages.keys().next().value);
      nativeImages.set(segment, image || null);
    }
    const native = nativeImages.get(segment);
    if (native) images.set(segment, native);
    else {
      const key = emojiKey(segment);
      if (!key) continue;
      images.set(segment, await bundledImage(key));
      fallback.add(segment);
    }
  }
  return { images, fallback };
}

// Native editor presentation is independent of the finite PDF artwork catalog.
export function isEmojiCluster(text){return !text.includes('\ufe0e') && (/\p{Emoji_Presentation}/u.test(text) || (/[\ufe0f\u20e3\u200d]/u.test(text) && /\p{Extended_Pictographic}|[0-9#*]/u.test(text)));}
