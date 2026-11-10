import { test, expect } from '@playwright/test';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalFiles } from '../../scripts/local-files.mjs';

test('the browser migrates changed originals without modifying them or duplicating a migration', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'The Playwright WebKit profile cannot write the OPFS fixture. The helper migration below covers WebKit.');
  const source = 'Title: External revision\n\nINT. ROOM - DAY\n\nOriginal from disk.';
  await page.goto('/');
  const id = await page.evaluate(async source => {
    const { repository } = await import('/js/storage.js');
    const { draftRecord } = await import('/js/session.js');
    const { createDocument, createElement } = await import('/js/document.js');
    const directory = await navigator.storage.getDirectory();
    const handle = await directory.getFileHandle('Original.fountain', { create: true });
    const writer = await handle.createWritable();
    await writer.write(source);
    await writer.close();
    const doc = createDocument({ title: 'My existing script', elements: [createElement('action', 'Recovered editor version.') ] });
    const record = await repository.put({ ...draftRecord(doc), handle, fileName: 'Original.fountain', fileHash: 'older' });
    return record.id;
  }, source);
  await page.goto('/editor.html?id=' + id);
  await expect(page.locator('#pages')).toContainText('Recovered editor version.');
  await expect(page.locator('#document-banner')).toContainText('original Fountain file changed');
  await page.locator('#open-migrated-original').click();
  await expect(page.locator('#pages')).toContainText('Original from disk.');
  const originalId = await page.evaluate(() => window.scriptForge.getDocument().id);
  await page.goto('/editor.html?id=' + id);
  await page.locator('#open-migrated-original').click();
  await expect(page).toHaveURL(new RegExp(originalId + '$'));
  const result = await page.evaluate(async () => {
    const { repository } = await import('/js/storage.js');
    const directory = await navigator.storage.getDirectory();
    const original = await directory.getFileHandle('Original.fountain');
    return { source: await (await original.getFile()).text(), count: (await repository.list()).length };
  });
  expect(result).toEqual({ source, count: 2 });
});

test('the local browser library reopens after restarting the browser process without folder access', async ({ playwright, browserName, baseURL }, testInfo) => {
  const profile = await mkdtemp(join(tmpdir(), 'scriptforge-managed-restart-'));
  let context;
  try {
    const type = playwright[browserName];
    const options = browserName === 'chromium' ? { channel: testInfo.project.use.channel } : {};
    context = await type.launchPersistentContext(profile, options);
    const page = context.pages()[0];
    await page.goto(baseURL);
    await page.locator('#new-screenplay').click();
    await page.locator('#pages[contenteditable=true]').waitFor();
    await page.locator('[data-type=action]').last().click();
    await page.keyboard.insertText('Local library survives restarting.');
    await expect(page.locator('#pages')).toContainText('Local library survives restarting.');
    await page.locator('#home').click();
    await expect(page.locator('.script-card')).toHaveCount(1);
    await context.close();
    context = await type.launchPersistentContext(profile, options);
    const reopened = context.pages()[0];
    await reopened.goto(baseURL);
    await reopened.locator('.card-title').click();
    await expect(reopened.locator('#pages')).toContainText('Local library survives restarting.');
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('a legacy local helper reference migrates through read-only access', async ({ page }) => {
  const folder = await mkdtemp(join(tmpdir(), 'scriptforge-readonly-migration-'));
  const path = join(folder, 'Original.fountain');
  const source = 'INT. STUDIO - DAY\n\nAn untouched original.';
  await writeFile(path, source);
  const helper = createLocalFiles({ configPath: join(folder, 'grants.json'), enabled: true, picker: async () => path });
  const old = await helper.run('open-file');
  const actions = [];
  try {
    await page.route('**/api/local-files/*', async route => {
      const action = new URL(route.request().url()).pathname.split('/').at(-1);
      actions.push(action);
      try { await route.fulfill({ json: await helper.run(action, route.request().postDataJSON()) }); }
      catch (error) { await route.fulfill({ status: 400, json: { error: { name: error.name, message: error.message } } }); }
    });
    await page.goto('/');
    const id = await page.evaluate(async old => {
      const { repository } = await import('/js/storage.js');
      const { recordForFile } = await import('/js/session.js');
      return (await repository.put(await recordForFile(old))).id;
    }, old);
    await page.goto('/editor.html?id=' + id);
    const action = page.locator('[data-type=action]').first();
    await expect(action).toContainText('An untouched original.');
    await action.click();
    await page.keyboard.press('End');
    await page.keyboard.insertText(' A managed edit.');
    await page.locator('#save').click();
    await expect(page.locator('#disk-save-state')).toHaveText('Saved');
    await page.reload();
    await expect(page.locator('#pages')).toContainText('A managed edit.');
    expect(actions.filter(action => action !== 'status')).toEqual(['permission', 'read']);
    expect(await readFile(path, 'utf8')).toBe(source);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
