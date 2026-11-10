const listeners = new Set();
const storageKey = 'scriptforge-writing-preferences-v1';
const defaults = { transitions: [], tags: [], deletionPages: 2 };
let preferences = read();

function read() {
  try {
    const data = JSON.parse(globalThis.localStorage?.getItem(storageKey) ?? '{}');
    const next = { ...defaults, ...data };
    for (const kind of ['transitions', 'tags']) {
      next[kind] = Array.isArray(next[kind]) ? next[kind].filter(value => typeof value === 'string') : [];
    }
    if (!Array.isArray(next.profanityGroups) || next.profanityGroups.some(group =>
      !group || typeof group.name !== 'string' || !Array.isArray(group.variations) ||
      group.variations.some(variant => typeof variant?.text !== 'string'))) delete next.profanityGroups;
    return next;
  } catch {
    return { ...defaults };
  }
}

globalThis.addEventListener?.('storage', event => {
  if (event.key === storageKey || event.key === null) {
    preferences = read();
    for (const listener of listeners) listener();
  }
});

export const writingPreferences = () => preferences;

export function saveWritingPreferences(changes) {
  const next = { ...read(), ...changes };
  globalThis.localStorage.setItem(storageKey, JSON.stringify(next));
  preferences = next;
  for (const listener of listeners) listener();
}

export function watchWritingPreferences(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const ruleKey = text => text.trim().replace(/[^\S\r\n]+/gu, ' ').replace(/[‘’]/g, "'").toUpperCase();

export function normalizeWritingRule(kind, text) {
  if (typeof text !== 'string' || /[\r\n]/u.test(text)) throw new Error('Enter one complete line.');
  const value = ruleKey(text);
  if (!value || value.length > 100 || !/\p{L}/u.test(value)) throw new Error('Enter a rule of up to 100 characters containing letters.');
  if (kind === 'transitions') return value;
  const tag = value.replace(/^\((.*)\)$/u, '$1').trim();
  if (!tag || /[()]/u.test(tag)) throw new Error('Enter one extension, such as (OVER RADIO).');
  return '(' + tag + ')';
}

export function deletionThreshold() {
  const pages = Number(preferences.deletionPages);
  return Number.isFinite(pages) && pages > 0 ? pages : defaults.deletionPages;
}
