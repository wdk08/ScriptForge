import {test,expect} from '@playwright/test';
test.beforeEach(async({context})=>context.addInitScript(()=>{window.showDirectoryPicker=undefined;}));
test('production subpath supports editing, persistence, statistics, exports and installer choices',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://api.github.com/repos/wdk08/ScriptForge/releases/latest',route=>route.fulfill({json:{tag_name:'v1.0.1',draft:false,prerelease:false,assets:['ScriptForge_1.0.1_aarch64.dmg','ScriptForge_1.0.1_x64.dmg','ScriptForge_1.0.1_x64-setup.exe'].map(name=>({name,state:'uploaded',size:10,browser_download_url:`https://github.com/wdk08/ScriptForge/releases/download/v1.0.1/${name}`}))}}));
 await page.goto('./');await expect(page.locator('.browser-storage-note')).toContainText('does not sync');
 expect(await page.evaluate(async()=> (await (await import('./js/writing-storage.js')).createWritingStore().list()).length)).toBe(0);
 await page.locator('#new-screenplay').click();await expect(page.locator('#pages')).toHaveAttribute('contenteditable','true');
 await page.locator('#pages').click();await page.keyboard.type('A browser story.');await page.waitForTimeout(1100);
 await page.evaluate(()=>window.scriptForgeBeforeClose());const original=await page.evaluate(()=>window.scriptForge.getDocument());
 await page.reload();await page.locator('#recover-changes').click();await expect(page.locator('#pages')).toHaveAttribute('contenteditable','true');
 expect((await page.evaluate(()=>window.scriptForge.getDocument())).elements).toEqual(original.elements);
 await expect(page.locator('#disk-save-state')).toContainText(/Recovery|Unsaved|exported/);
 await page.locator('.tools-menu summary').click();await page.locator('#writing-statistics').click();await expect(page.locator('.writing-statistics')).toContainText('Current session');await expect(page.locator('.writing-statistics')).toContainText('Words typed');await page.screenshot({path:'/tmp/scriptforge-110-writing-statistics.png'});await page.locator('.writing-statistics button',{hasText:'Close'}).click();
 for(const id of ['export-fountain','export-pdf']){await page.locator('.export-menu:not(.browser-download) summary').click();const pending=page.waitForEvent('download');await page.locator(`#${id}`).click();const download=await pending;expect(download.suggestedFilename()).toMatch(id==='export-pdf'?/\.pdf$/:/\.fountain$/);}
 await page.locator('.browser-download summary').click();await expect(page.locator('.browser-download a')).toHaveCount(3);
 const hrefs=await page.locator('.browser-download a').evaluateAll(links=>links.map(a=>a.href));expect(hrefs.every(h=>/\.(dmg|exe)$/.test(h))).toBe(true);
 await page.locator('#home').click();await expect(page.locator('#script-grid')).toContainText(original.title);expect(errors).toEqual([]);
});
test('static Fountain import and custom lowercase cue extensions stay one character identity',async({page})=>{
 await page.goto('./');await page.evaluate(async()=>{const {repository}=await import('./js/storage.js');const {parseFountain}=await import('./js/fountain.js');const {draftRecord}=await import('./js/session.js');const doc=parseFountain('vincent (v.o.)\nHello.\n\nVINCENT (ON PHONE)\nAgain.\n');const draft=draftRecord(doc);draft.recovery.dirty=false;const record=await repository.put(draft);location.href=`./editor.html?id=${record.id}`;});
 await expect(page.locator('#pages')).toHaveAttribute('contenteditable','true');expect(await page.evaluate(async()=>{const {detectedCharacters}=await import('./js/characters.js');return detectedCharacters(window.scriptForge.getDocument()).map(c=>c.name);})).toEqual(['VINCENT']);
});
test('writing history resumes after Home and statistics clearing preserves screenplays',async({page})=>{
 await page.goto('./');await page.locator('#new-screenplay').click();await expect(page.locator('#pages')).toHaveAttribute('contenteditable','true');
 const first=await page.evaluate(()=>window.scriptForge.getDocument().id);await page.locator('#pages').click();await page.keyboard.type('Three simple words');await page.locator('#home').click();await expect(page).toHaveURL(/\/ScriptForge\/index.html$/);
 const read=()=>page.evaluate(async()=>await(await import('./js/writing-storage.js')).createWritingStore().list());
 const before=await read();expect(before).toHaveLength(1);expect(before[0].segments).toHaveLength(1);expect(before[0].segments[0].typed).toBe(3);expect(before[0].pausedAt).not.toBeNull();
 await page.goto(`./editor.html?id=${first}`);await page.locator('#recover-changes').click();await expect(page.locator('#pages')).toHaveAttribute('contenteditable','true');await page.locator('#home').click();await expect(page).toHaveURL(/\/ScriptForge\/index.html$/);
 const after=await read();expect(after).toHaveLength(1);expect(after[0].id).toBe(before[0].id);expect(after[0].segments).toHaveLength(2);
 await page.locator('#writing-statistics').click();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Clear writing statistics…'}).click();await expect.poll(async()=> (await read()).length).toBe(0);
 expect(await page.evaluate(async id=>Boolean(await(await import('./js/storage.js')).repository.get(id)),first)).toBe(true);
});
test('statistics storage failure does not block screenplay editing or browser recovery',async({page})=>{
 await page.addInitScript(()=>{const open=indexedDB.open.bind(indexedDB);indexedDB.open=(name,...args)=>{if(name==='scriptforge-writing')throw new DOMException('Statistics quota unavailable','QuotaExceededError');return open(name,...args);};});
 await page.goto('./');await page.locator('#new-screenplay').click();await expect(page.locator('#pages')).toHaveAttribute('contenteditable','true');await page.locator('#pages').click();await page.keyboard.type('Recovery still works.');await page.evaluate(()=>window.scriptForgeBeforeClose());
 expect(await page.evaluate(async()=>{const doc=window.scriptForge.getDocument();return (await(await import('./js/storage.js')).repository.get(doc.id)).recovery.document.elements.some(e=>e.text.includes('Recovery still works.'));})).toBe(true);
});
