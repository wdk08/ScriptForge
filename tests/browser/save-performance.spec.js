import { test, expect } from '@playwright/test';

test('library reports Saved only after an asynchronous write commits', async ({ page }) => {
  await page.goto('/editor.html?new=1');
  await page.locator('#pages[contenteditable=true]').waitFor();
  await page.evaluate(async () => {
    const { repository } = await import('/js/storage.js');
    const put = repository.put;
    const gate = new Promise(resolve => { window.releaseWrite = resolve; });
    repository.put = async (...args) => { await gate; return put(...args); };
  });
  await page.locator('[data-type=action]').last().click();
  await page.keyboard.insertText('A deliberately delayed library write.');
  await page.locator('#save').click();
  await expect(page.locator('#disk-save-state')).toHaveText('Saving…');
  expect(await page.evaluate(async () => {
    const { repository } = await import('/js/storage.js');
    return (await repository.get(window.scriptForge.getDocument().id)).recovery.document.elements.some(element =>
      element.text.includes('deliberately delayed'));
  })).toBe(false);
  await page.evaluate(() => window.releaseWrite());
  await expect(page.locator('#disk-save-state')).toHaveText('Saved');
  await page.reload();
  await expect(page.locator('#pages')).toContainText('A deliberately delayed library write.');
});
