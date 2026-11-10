import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

async function seed(page, elements) {
  await page.goto('/');
  const ids = await page.evaluate(async elements => {
    const { createDocument, createElement } = await import('/js/document.js');
    const { draftRecord } = await import('/js/session.js');
    const { libraryRepository } = await import('/js/managed-library.js');
    const doc = createDocument({ elements: elements.map(([type, text]) => createElement(type, text)) });
    await libraryRepository.put(draftRecord(doc));
    return { id: doc.id, elements: doc.elements.map(element => element.id) };
  }, elements);
  await page.goto('/editor.html?id=' + ids.id);
  await expect(page.locator('#pages')).toHaveAttribute('contenteditable', 'true');
  return ids;
}

async function select(page, id, start, end) {
  await page.evaluate(async ({ id, start, end }) => {
    const { restoreSelection } = await import('/js/selection.js');
    const root = document.getElementById('pages');
    root.focus({ preventScroll: true });
    restoreSelection(root, { anchor: { id, offset: start }, focus: { id, offset: end } });
  }, { id, start, end });
}

test('training persists across reloads and keeps complete transitions and dialogue cues distinct', async ({ page }) => {
  const fixture = await seed(page, [['action', '']]);
  await page.locator('#screenplay-settings').click();
  await page.getByText('Train Transition', { exact: true }).click();
  await page.getByLabel('Custom transition').fill('time cut to:');
  await page.getByRole('button', { name: 'Add transition' }).click();
  await page.getByLabel('Custom transition').fill(' TIME  CUT TO: ');
  await page.getByRole('button', { name: 'Add transition' }).click();
  await expect(page.locator('#writing-rules-status')).toContainText('already exists');
  await page.getByText('Train Dialogue Tag', { exact: true }).click();
  await page.getByLabel('Custom dialogue tag').fill('over radio');
  await page.getByRole('button', { name: 'Add dialogue tag' }).click();
  await page.locator('#settings-done').click();
  await page.reload();
  await expect(page.locator('#pages')).toHaveAttribute('contenteditable', 'true');
  await select(page, fixture.elements[0], 0, 0);
  await page.keyboard.insertText('time cut to:');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-type=transition]')).toHaveText('TIME CUT TO:');
  await page.keyboard.insertText('Vincent (over radio)');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-type=character]')).toContainText('VINCENT (OVER RADIO)');
  await page.keyboard.insertText('Hello.');
  await expect(page.locator('[data-type=dialogue]')).toHaveText('Hello.');
});

test('profanity edits refresh the result and navigate to the exact occurrence', async ({ page }) => {
  const text = 'Class assistant. Oh my gosh! What the hell? Hell no.';
  const fixture = await seed(page, [['scene', 'INT. ROOM - DAY'], ['action', text]]);
  await page.locator('.tools-menu summary').click();
  await page.locator('#profanity-analyzer').click();
  await expect(page.locator('#profanity-totals')).toContainText('2 occurrences');
  await page.getByText('Edit dictionary', { exact: true }).click();
  await page.getByLabel('New group name').fill('Custom');
  await page.getByRole('button', { name: 'Add group', exact: true }).click();
  await page.getByLabel('New variation for Custom').fill('oh my gosh');
  const group = page.locator('fieldset').filter({ has: page.getByText('Custom', { exact: true }) });
  await group.getByRole('button', { name: 'Add variation' }).click();
  await expect(page.locator('#profanity-totals')).toContainText('3 occurrences');
  await group.getByLabel('Variation 1').fill('oh my');
  await group.getByLabel('Variation 1').press('Tab');
  await expect(page.locator('#profanity-occurrences')).toContainText('Oh my ·');
  await group.getByLabel('Variation 1').fill('oh my gosh');
  await group.getByLabel('Variation 1').press('Tab');
  await group.getByRole('checkbox', { name: 'Enabled', exact: true }).last().uncheck();
  await expect(page.locator('#profanity-totals')).toContainText('2 occurrences');
  await group.getByRole('checkbox', { name: 'Enabled', exact: true }).last().check();
  await expect(page.locator('#profanity-totals')).toContainText('3 occurrences');
  await page.locator('#profanity-group').selectOption({ label: 'Custom' });
  const hit = page.locator('#profanity-occurrences button');
  await expect(hit).toHaveCount(1);
  await hit.click();
  const selection = await page.evaluate(() => window.scriptForge.getSelection());
  expect(selection.anchor).toEqual({ id: fixture.elements[1], offset: text.indexOf('Oh') });
  expect(selection.focus.offset).toBe(text.indexOf('!'));
  await page.keyboard.press('Backspace');
  await expect(page.locator('#profanity-totals')).toContainText('2 occurrences');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('#profanity-totals')).toContainText('3 occurrences');
  await page.evaluate(() => window.scriptForgeBeforeClose());
  await page.reload();
  await expect(page.locator('#pages')).toHaveAttribute('contenteditable', 'true');
  await page.locator('.tools-menu summary').click();
  await page.locator('#profanity-analyzer').click();
  await expect(page.locator('#profanity-totals')).toContainText('3 occurrences');
});

test('large replacements wait for consent, cancel restores selection and scroll, and confirm is undoable', async ({ page }) => {
  const text = 'The characters run through the empty building before the door closes. '.repeat(130);
  const fixture = await seed(page, [['action', text], ['action', 'Remain in the screenplay.']]);
  await select(page, fixture.elements[0], 0, text.length);
  const saved = await page.evaluate(() => ({
    selection: window.scriptForge.getSelection(),
    scroll: document.querySelector('.document-viewport').scrollTop,
  }));
  await page.keyboard.press('Backspace');
  await expect(page.locator('#large-deletion-dialog')).toBeVisible();
  expect(await page.evaluate(() => window.scriptForge.getDocument().elements[0].text)).toBe(text);
  await page.keyboard.press('Escape');
  await expect(page.locator('#large-deletion-dialog')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.scriptForge.getSelection())).toEqual(saved.selection);
  expect(await page.locator('.document-viewport').evaluate(el => el.scrollTop)).toBe(saved.scroll);
  await page.evaluate(() => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', 'A short replacement.');
    document.getElementById('pages').dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
  });
  await expect(page.locator('#large-deletion-dialog')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#pages')).toContainText('A short replacement.');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => page.evaluate(() => window.scriptForge.getDocument().elements[0].text)).toBe(text);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(page.locator('#pages')).toContainText('A short replacement.');
  await expect(page.locator('#large-deletion-dialog')).toBeHidden();
});

test('native color PDF embeds emoji with exact text and unchanged page geometry', async ({ page }, info) => {
  await seed(page, [['action', 'Native 😘 👍🏽 🇺🇸 👩🏽‍💻 and searchable text.']]);
  const result = await page.evaluate(async () => {
    const { createScreenplayPDF } = await import('/js/pdf-export.js');
    const output = await createScreenplayPDF(window.scriptForge.getDocument());
    return { bytes: [...new Uint8Array(await output.blob.arrayBuffer())], fallback: output.emojiFallback,
      pages: output.pages, editorPages: window.scriptForge.getPages().length };
  });
  expect(result.pages).toBe(result.editorPages + 1);
  if (process.platform === 'darwin') expect(result.fallback).toEqual([]);
  const output = info.outputPath('native-emoji.pdf');
  await writeFile(output, Buffer.from(result.bytes));
  const text = execFileSync(process.env.PDFTOTEXT ?? 'pdftotext', ['-enc', 'UTF-8', output, '-'], { encoding: 'utf8' });
  expect(text.replace(/\s+/gu, ' ')).toContain('Native 😘 👍🏽 🇺🇸 👩🏽‍💻 and searchable text.');
});

test('large Cut copies the original selection only after approval', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'This fixture grants clipboard permissions through Chromium automation.');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const text = 'Some long screenplay text intended to cross a page boundary. '.repeat(140);
  const fixture = await seed(page, [['action', text]]);
  await page.evaluate(() => navigator.clipboard.writeText('Clipboard remains'));
  await select(page, fixture.elements[0], 0, text.length);
  await page.keyboard.press('ControlOrMeta+x');
  await expect(page.locator('#large-deletion-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Clipboard remains');
  expect(await page.evaluate(() => window.scriptForge.getDocument().elements[0].text)).toBe(text);
  await select(page, fixture.elements[0], 0, text.length);
  await page.keyboard.press('ControlOrMeta+x');
  await expect(page.locator('#large-deletion-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cut', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.scriptForge.getDocument().elements[0].text)).toBe('');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
});

test('PDF explicitly reports bundled artwork when Canvas cannot provide native color', async ({ page }) => {
  await seed(page, [['action', 'Fallback proof 😘']]);
  const fallback = await page.evaluate(async () => {
    CanvasRenderingContext2D.prototype.getImageData = () => { throw new DOMException('Canvas blocked', 'SecurityError'); };
    const { createScreenplayPDF } = await import('/js/pdf-export.js');
    return (await createScreenplayPDF(window.scriptForge.getDocument())).emojiFallback;
  });
  expect(fallback).toEqual(['😘']);
});
