import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createDocument, createElement } from '../js/document.js';
import { caret, editDocument } from '../js/editing.js';
import { analyzeProfanity, defaultProfanityGroups } from '../js/profanity.js';
import { affectedPageCount } from '../js/large-deletion.js';
import { PAGE } from '../js/pagination.js';
import { createRepository } from '../js/storage.js';
import { createManagedLibrary } from '../js/managed-library.js';
import { draftRecord } from '../js/session.js';
import { normalizeWritingRule, saveWritingPreferences } from '../js/writing-preferences.js';
import { parseFountain, serializeFountain } from '../js/fountain.js';
import { detectedCharacters } from '../js/characters.js';
import { flushForUpdate } from '../js/update-safety.js';

test('trained transitions are complete lines and custom extensions preserve character identity', () => {
  const original = globalThis.localStorage;
  let value;
  globalThis.localStorage = { getItem: () => value, setItem: (_, next) => { value = next; } };
  try {
    const transition = normalizeWritingRule('transitions', '  time  cut to: ');
    const tag = normalizeWritingRule('tags', 'over radio');
    saveWritingPreferences({ transitions: [transition], tags: [tag] });
    const originalElements = ['time cut to:', 'She whispers time cut to: as a joke.', 'Vincent (over radio)'];
    const expected = ['transition', 'action', 'character'];
    for (const [index, text] of originalElements.entries()) {
      const element = createElement('action', text);
      const doc = createDocument({ elements: [element] });
      const result = editDocument(doc, caret(element.id, text.length), { type: 'enter' });
      assert.equal(result.document.elements[0].type, expected[index]);
      if (index === 0) assert.equal(result.document.elements[0].text, 'TIME CUT TO:');
      if (index === 2) assert.equal(result.document.elements[0].text, 'VINCENT (OVER RADIO)');
    }
    const doc = parseFountain('@VINCENT (OVER RADIO)\nHello.\n\nVINCENT (V.O.)\nAgain.');
    assert.equal(detectedCharacters(doc).length, 1);
    assert.equal(detectedCharacters(parseFountain(serializeFountain(doc))).length, 1);
  } finally {
    saveWritingPreferences({ transitions: [], tags: [] });
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
});

test('profanity matches exact phrases, handles overlaps and Unicode, and returns visible source offsets', () => {
  const heading = createElement('scene', 'INT. STUDIO - DAY');
  const text = "Class assistant glass éass ass **fuck** fucking. Son of a bitch! Oh my God. For God’s sake. [[ass]]";
  const action = createElement('action', text);
  const doc = createDocument({ elements: [heading, action, createElement('note', 'fuck fuck')] });
  const groups = defaultProfanityGroups();
  groups.push({ name: 'Custom', enabled: true, variations: [
    { text: 'oh my god', enabled: true }, { text: "for god's sake", enabled: true }, { text: 'ass', enabled: true },
  ] });
  let result = analyzeProfanity(doc, groups);
  assert.deepEqual(result.matches.map(match => match.text.toLowerCase()), ['ass', 'fuck', 'fucking', 'son of a bitch', 'oh my god', 'for god’s sake']);
  assert.equal(result.unique, 6);
  assert.equal(result.variationCounts.at(-1).at(-1), 0);
  assert.ok(result.matches.every(match => match.sceneId === heading.id && text.slice(match.start, match.end) === match.text));
  groups[0].variations.find(item => item.text === 'fucking').enabled = false;
  groups.at(-1).enabled = false;
  result = analyzeProfanity(doc, groups);
  assert.deepEqual(result.matches.map(match => match.text.toLowerCase()), ['ass', 'fuck', 'son of a bitch']);
});

test('deletion measures selected layout rows and sparse replacement ranges, not the whole screenplay', () => {
  const el = createElement('action', 'x'.repeat(1200));
  const doc = createDocument({ elements: [el] });
  const lines = Array.from({ length: 120 }, (_, index) => ({ id: el.id, start: index * 10, end: (index + 1) * 10 }));
  const pages = [{ items: [{ gap: 0, columns: [lines, lines] }] }];
  const selection = { anchor: { id: el.id, offset: 1200 }, focus: { id: el.id, offset: 10 } };
  assert.equal(affectedPageCount(doc, selection, { type: 'delete' }, pages), 119 * PAGE.lineHeight / PAGE.contentHeight);
  assert.equal(affectedPageCount(doc, selection, { type: 'replaceMatches', matches: [
    { id: el.id, start: 100, end: 110, text: 'xxxxxxxxxx' }, { id: el.id, start: 1000, end: 1010, text: 'xxxxxxxxxx' },
  ], replacement: '' }, pages), 2 * PAGE.lineHeight / PAGE.contentHeight);
});

test('legacy browser records migrate once with exact editor recovery, changed source, and settings', async () => {
  const legacy = createRepository(new IDBFactory());
  const doc = createDocument({ title: 'Recovered', elements: [createElement('action', 'Local editor recovery.') ] });
  doc.settings = { boldSceneHeadings: true };
  const old = await legacy.put({ ...draftRecord(doc), handle: { name: 'Original.fountain' }, fileName: 'Original.fountain', fileHash: 'old' });
  let reads = 0;
  const store = createManagedLibrary(legacy, { async read() {
    reads++;
    return { name: 'Original.fountain', hash: 'new', source: 'An external revision.' };
  } });
  const [record, duplicate] = await Promise.all([store.get(old.id), store.get(old.id)]);
  assert.deepEqual(record, duplicate);
  assert.equal(record.revision, 2);
  assert.equal(record.managed, true);
  assert.deepEqual(record.recovery.document, old.recovery.document);
  assert.equal(record.legacySource.source, 'An external revision.');
  assert.equal(record.handle, null);
  await store.get(old.id);
  assert.equal(reads, 1);
  const isolated = createManagedLibrary(legacy, { read() { assert.fail('Dev accessed a legacy file'); } }, null, { allowLegacyRead: false });
  const second = await legacy.put({ ...draftRecord(), handle: { name: 'external.fountain' } });
  assert.match((await isolated.get(second.id)).migrationNotice, /could not be read/);
});

test('update safety accepts exact native library text with reordered JSON keys', async () => {
  const doc = createDocument({ elements: [createElement('action', 'My current text.')] });
  const reordered = JSON.parse(JSON.stringify(doc, (_, value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).reverse());
  }));
  const session = { record: { id: doc.id }, document: doc, recoveryCurrent: true, flush: async () => {} };
  const backups = { queue: Promise.resolve() };
  const repository = { get: async () => ({ recovery: { document: reordered } }) };
  await flushForUpdate({ session, repository, backups });
  reordered.elements[0].text = 'An older version.';
  await assert.rejects(flushForUpdate({ session, repository, backups }), /verification failed/);
});
