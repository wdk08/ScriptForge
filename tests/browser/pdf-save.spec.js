import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test.beforeEach(async ({ context }) => { await context.addInitScript(() => { window.scriptForgeLocalHelperDisabled = true; window.showDirectoryPicker = undefined; }); });

test('editor and homepage PDF exports download actual PDFs without changing the screenplay', async ({ page }) => {
  await page.goto('/editor.html?sample=1'); await expect(page.locator('#pages')).toContainText('NOAH');
  const before = await page.evaluate(() => window.scriptForge.getDocument());
  await page.locator('#export').click();
  const pdfDownload = page.waitForEvent('download'); await page.locator('#export-pdf').click();
  const pdf = await pdfDownload; expect(pdf.suggestedFilename()).toBe('The Last Signal.pdf');
  await pdf.saveAs('test-results/screenplay-export.pdf');
  expect((await readFile(await pdf.path())).subarray(0, 5).toString()).toBe('%PDF-');
  expect(await page.evaluate(() => window.scriptForge.getDocument())).toEqual(before);
  await page.locator('#home').click(); await page.getByLabel('Options for The Last Signal').click();
  const libraryPDF = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export as PDF', exact: true }).click();
  expect((await readFile(await (await libraryPDF).path())).subarray(0, 5).toString()).toBe('%PDF-');
});


test('Save and Ctrl/Cmd+S commit the browser library without opening a picker or downloading', async ({ page }) => {
  await page.addInitScript(() => {
    for (const picker of ['showSaveFilePicker', 'showDirectoryPicker']) {
      window[picker] = () => { throw new Error('Unexpected picker'); };
    }
  });
  let downloads = 0;
  page.on('download', () => downloads++);
  await page.goto('/');
  await page.locator('#new-screenplay').click();
  await page.locator('#pages[contenteditable=true]').waitFor();
  await page.keyboard.insertText('Saved immediately.');
  await page.locator('#save').click();
  await expect(page.locator('#save-state')).toHaveText('Saved in this browser');
  await page.locator('.actionLine').first().click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' Via keyboard.');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('#save-state')).toHaveText('Saved in this browser');
  await page.reload();
  await expect(page.locator('#pages')).toContainText('Via keyboard.');
  expect(downloads).toBe(0);
});
