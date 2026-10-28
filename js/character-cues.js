import { characterIdentity } from './table-read-model.js';
import { hasScenePrefix } from './scene-locations.js';
import { isCommonTransition } from './transitions.js';
export const cueIdentity = text => characterIdentity(text).name;
export function extendedCue(text) {
  const value = text.trim().replace(/^@/, '').replace(/\s*\^$/, '');
  const extension = value.match(/(?:\s*\([^()\n]+\))+$/u);
  if (!extension) return false;
  const base = value.slice(0, extension.index).trim();
  return base.length > 0 && base.length <= 45 && base.split(/\s+/).length <= 5
    && /\p{L}/u.test(base) && !/[.!?:;,()]/.test(base)
    && !hasScenePrefix(base) && !isCommonTransition(base)
    && !(base !== base.toUpperCase() && /^(?:a|an|the|he|she|they|it|we)\b/i.test(base))
    && !/\b(?:walks?|runs?|looks?|sits?|stands?|enters?|exits?|leaves?|turns?|watches?|opens?|closes?|smiles?|nods?|holds?|takes?|moves?|says?|pauses?|waits?)\b/i.test(base);
}
