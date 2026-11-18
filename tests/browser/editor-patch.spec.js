import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function open(page, kinds) {
  await page.goto('/');
  const doc = await page.evaluate(async kinds => {
    const { createDocument, createElement } = await import('/js/document.js');
    const { draftRecord } = await import('/js/session.js');
    const { libraryRepository } = await import('/js/managed-library.js');
    const document = createDocument({ elements: kinds.map(([type, text, attrs]) => createElement(type, text, attrs)) });
    await libraryRepository.put(draftRecord(document));
    return document;
  }, kinds);
  await page.goto('/editor.html?id=' + doc.id);
  await page.locator('#pages[contenteditable=true]').waitFor();
  return doc;
}

test('clicking in the space past the final row uses that row at different widths and zooms', async ({ page }) => {
  const wrapped = 'First line ends here. '.repeat(5) + 'Short end.';
  const doc = await open(page, [
    ['action', 'This first line is deliberately too long to end at the same place.\nShort end.'],
    ['character', 'SOPHIA'], ['dialogue', wrapped, { rightMarginOffsetPt: 5 }],
    ['parenthetical', '(A long first line\nShort end.)'],
  ]);
  for (const zoom of ['0.75', '1', '1.25']) {
    await page.locator('#zoom').selectOption(zoom);
    for (const element of doc.elements.filter(el => el.type !== 'character')) {
      const row = page.locator('[data-element-id="' + element.id + '"]').last();
      await row.scrollIntoViewIfNeeded();
      const bounds = await row.boundingBox();
      await page.mouse.click(bounds.x + bounds.width - 8, bounds.y + bounds.height - 6);
      await expect.poll(() => page.evaluate(() => window.scriptForge.getSelection().focus)).toEqual({
        id: element.id, offset: element.text.length,
      });
    }
  }
});

test('a 200-page screenplay edits near the start, middle and end and exports the current text', async ({ page }) => {
  test.setTimeout(60000);
  const scenes = Array.from({ length: 200 }, (_, i) => [
    ['scene', 'INT. STUDIO ' + i + ' - NIGHT'],
    ['action', 'Quiet footsteps echo down the empty corridor.\nA door opens.'],
    ['character', 'SOPHIA (V.O.)'], ['parenthetical', '(quietly)'],
    ['dialogue', 'I’m here — in the studio.'], ['dialogue', 'Come find me.'],
    ['pageBreak', ''],
  ]).flat();
  const doc = await open(page, scenes);
  const pageCount = await page.evaluate(() => window.scriptForge.getPages().length);
  expect(pageCount).toBeGreaterThanOrEqual(200);
  for (const index of [0, 99, 199]) {
    const dialogue = doc.elements[index * 7 + 4];
    await page.evaluate(async id => {
      const { restoreSelection } = await import('/js/selection.js');
      const end = window.scriptForge.getDocument().elements.find(el => el.id === id).text.length;
      const point = { id, offset: end };
      restoreSelection(document.getElementById('pages'), { anchor: point, focus: point }, { scroll: true });
    }, dialogue.id);
    await page.keyboard.insertText(' XYZA');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Enter');
    await page.evaluate(() => {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', 'A figure waits outside.');
      document.getElementById('pages').dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
    });
  }
  await page.locator('.file-menu summary').click();
  const pending = page.waitForEvent('download', { timeout: 12000 });
  await page.locator('#export-copy').click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.fountain$/);
  const source = await readFile(await download.path(), 'utf8');
  const imported = await page.evaluate(async source => (await import('/js/fountain.js')).parseFountain(source), source);
  expect(imported.elements.filter(el => el.type === 'scene')).toHaveLength(200);
  expect(imported.elements.filter(el => el.type === 'dialogue' && el.text.includes('studio. XY'))).toHaveLength(3);
  expect(imported.elements.filter(el => el.type === 'action' && el.text === 'A figure waits outside.')).toHaveLength(3);
});
