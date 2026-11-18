import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, createElement, meaningfulContent } from '../js/document.js';
import { caret, EditorHistory, editDocument } from '../js/editing.js';
import { parseFountain } from '../js/fountain.js';
import { fountainForSaving } from '../js/session.js';
import { layoutUnits, paginate, updateMeasuredPages, PAGE } from '../js/pagination.js';

test('format conversions restore casing and only the inserted parentheses, including after edits', () => {
  const action = createElement('action', 'Sophia sees NASA (above).');
  const history = new EditorHistory(createDocument({ elements: [action] }), caret(action.id));
  const format = elementType => history.apply(history.current.selection, { type: 'format', elementType });
  const text = () => history.current.document.elements[0].text;
  format('character');
  assert.equal(text(), 'SOPHIA SEES NASA (ABOVE).');
  history.apply(caret(action.id, text().length), { type: 'insert', text: ' NEW.' });
  format('parenthetical');
  assert.equal(text(), '(Sophia sees NASA (above). NEW.)');
  history.apply(caret(action.id, text().length - 1), { type: 'insert', text: ' softly' });
  format('action');
  assert.equal(text(), 'Sophia sees NASA (above). NEW. softly');
  history.undo();
  assert.equal(text(), '(Sophia sees NASA (above). NEW. softly)');
  history.redo();
  format('parenthetical');
  format('action');
  assert.equal(text(), 'Sophia sees NASA (above). NEW. softly');
});

test('existing parentheses and intentional bracket edits survive conversion', () => {
  const existing = createElement('action', '(Manually typed)');
  const doc = createDocument({ elements: [existing] });
  const par = editDocument(doc, caret(existing.id), { type: 'format', elementType: 'parenthetical' });
  assert.equal(editDocument(par.document, par.selection, { type: 'format', elementType: 'action' }).document.elements[0].text, existing.text);

  const plain = createElement('action', 'looks at Sophia');
  const history = new EditorHistory(createDocument({ elements: [plain] }), caret(plain.id));
  history.apply(history.current.selection, { type: 'format', elementType: 'parenthetical' });
  history.apply(caret(plain.id, 0), { type: 'insert', text: '(' });
  history.apply(history.current.selection, { type: 'format', elementType: 'action' });
  assert.equal(history.current.document.elements[0].text, '(looks at Sophia');
});

test('height-preserving dialogue edits match fresh pagination across page continuations', () => {
  const dialogue = createElement('dialogue', 'Line.\n'.repeat(110) + 'End.');
  const doc = createDocument({ elements: [createElement('character', 'ANN'), dialogue] });
  function measure(element) {
    let end = 0;
    return element.text.split(/(?<=\n)/u).map(line => {
      const start = end;
      end += line.length;
      return { start, end, height: PAGE.lineHeight };
    });
  }
  const fresh = value => paginate(layoutUnits(value, measure));
  const before = fresh(doc);
  const edit = editDocument(doc, caret(dialogue.id, 3), { type: 'insert', text: ' extra' });
  assert.equal(edit.document.elements[0], doc.elements[0]);
  assert.deepEqual(updateMeasuredPages(before, doc, edit.document, measure), fresh(edit.document));
  const taller = editDocument(doc, caret(dialogue.id, 3), { type: 'lineBreak' });
  assert.equal(updateMeasuredPages(before, doc, taller.document, measure), null);
});

test('Fountain exports adjacent speech and literal markup in long Action without losing text', () => {
  const title = createElement('titleField', ' The Rival’s Heir  ', { key: 'Title' });
  const elements = [title];
  for (let i = 0; i < 200; i++) elements.push(
    createElement('scene', 'INT. ROOM ' + i + ' - DAY'), createElement('character', 'SOPHIA (V.O.)'),
    createElement('parenthetical', '(quietly)'), createElement('dialogue', 'I’m here — really.'), createElement('whitespace', '\n'),
    createElement('dialogue', 'Second line.\nThird line.'), createElement('action', 'She waits.\n[[Typed note]]\n/*Draft*/\nShe leaves.'),
    createElement('pageBreak', ''),
  );
  for (const size of [8, elements.length]) {
    const doc = createDocument({ elements: elements.slice(0, size) });
    const snapshot = structuredClone(doc);
    const output = fountainForSaving(doc);
    const imported = parseFountain(output);
    assert.deepEqual(doc, snapshot);
    assert.equal(imported.title, title.text);
    const meaningful = meaningfulContent(imported);
    assert.equal(meaningful.filter(el => el.type === 'character').length, size === 8 ? 1 : 200);
    assert.equal(meaningful.find(el => el.type === 'dialogue').text, 'I’m here — really.\n\nSecond line.\nThird line.');
    assert.equal(meaningful.filter(el => el.type === 'action').slice(0, 4).map(el => el.text).join('\n'),
      'She waits.\n[[Typed note]]\n/*Draft*/\nShe leaves.');
  }
});
