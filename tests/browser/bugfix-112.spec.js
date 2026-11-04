import{test,expect}from'@playwright/test';import{writeFile}from'node:fs/promises';import{execFileSync}from'node:child_process';
test.beforeEach(async({context})=>{await context.addInitScript(()=>{window.scriptForgeLocalHelperDisabled=true;window.showDirectoryPicker=undefined;});});
async function seed(page,elements){await page.goto('/');const doc=await page.evaluate(async elements=>{const{createDocument,createElement}=await import('/js/document.js'),{repository}=await import('/js/storage.js'),{draftRecord}=await import('/js/session.js');const doc=createDocument({elements:elements.map(([type,text])=>createElement(type,text))}),r=draftRecord(doc);r.recovery.dirty=false;await repository.put(r);return doc;},elements);await page.goto(`/editor.html?id=${doc.id}`);await page.locator('#pages[contenteditable=true]').waitFor();return doc;}
async function select(page,id,start,end=start){await page.evaluate(async({id,start,end})=>{const{restoreSelection}=await import('/js/selection.js');restoreSelection(document.getElementById('pages'),{anchor:{id,offset:start},focus:{id,offset:end}},{scroll:true});},{id,start,end});}
test('real shortcuts toggle selected and subsequent text, combine styles, survive recovery and undo',async({page})=>{
 const doc=await seed(page,[['action','Hello world.']]),id=doc.elements[0].id;await select(page,id,6,11);
 await page.keyboard.press('ControlOrMeta+b');await expect(page.locator('#pages .actionLine')).toHaveText('Hello **world**.');
 expect(await page.locator('#pages .actionLine').evaluate(el=>el.innerText)).toBe('Hello world.');expect(await page.locator('#pages .actionLine span[style*="700"]').count()).toBe(1);
 await page.keyboard.press('ControlOrMeta+i');expect(await page.locator('#pages .actionLine').evaluate(el=>el.innerText)).toBe('Hello world.');expect(await page.locator('#pages .actionLine span[style*="italic"]').count()).toBe(1);
 await page.keyboard.press('ControlOrMeta+b');expect(await page.evaluate(()=>window.scriptForge.getDocument().elements[0].text)).toBe('Hello *world*.');
 await page.keyboard.press('ControlOrMeta+i');expect(await page.evaluate(()=>window.scriptForge.getDocument().elements[0].text)).toBe('Hello world.');
 await select(page,id,12);await page.keyboard.press('ControlOrMeta+b');await page.keyboard.type(' Bold');await page.keyboard.press('ControlOrMeta+i');await page.keyboard.type(' both');await page.keyboard.press('ControlOrMeta+b');await page.keyboard.type(' italic');await page.keyboard.press('ControlOrMeta+i');await page.keyboard.type(' plain');
 const original=await page.evaluate(()=>window.scriptForge.getDocument());expect(await page.locator('#pages .actionLine').evaluate(el=>el.innerText)).toBe('Hello world. Bold both italic plain');
 const units=await page.evaluate(async()=>{const{inlineUnits}=await import('/js/inline-layout.js');return inlineUnits(window.scriptForge.getDocument().elements[0].text)});expect(units.find(u=>u.text==='B').bold).toBe(true);expect(units.find(u=>u.text==='b').italic).toBe(true);
 await page.evaluate(()=>window.scriptForgeBeforeClose());await page.reload();await page.locator('#recover-changes').click();await page.locator('#pages[contenteditable=true]').waitFor();expect((await page.evaluate(()=>window.scriptForge.getDocument())).elements).toEqual(original.elements);
});
test('blank Returns create focused lines and survive disk projection and reopening',async({page})=>{const doc=await seed(page,[['action','']]);await select(page,doc.elements[0].id,0);for(let i=0;i<5;i++)await page.keyboard.press('Enter');expect(await page.locator('#pages .actionLine').count()).toBe(6);expect(await page.locator('#pages .actionLine').evaluateAll(els=>Math.round(els[1].getBoundingClientRect().top-els[0].getBoundingClientRect().top))).toBe(16);await page.keyboard.type('After blanks.');const current=await page.evaluate(()=>window.scriptForge.getDocument());await page.keyboard.press('ControlOrMeta+z');await page.keyboard.press('ControlOrMeta+z');expect(await page.locator('#pages .actionLine').count()).toBe(5);await page.keyboard.press('ControlOrMeta+Shift+z');await page.keyboard.press('ControlOrMeta+Shift+z');expect((await page.evaluate(()=>window.scriptForge.getDocument())).elements).toEqual(current.elements);
 const reopened=await page.evaluate(async()=>{const{fountainForSaving}=await import('/js/session.js'),{parseFountain}=await import('/js/fountain.js');return parseFountain(fountainForSaving(window.scriptForge.getDocument())).elements.filter(e=>e.type==='action').map(e=>e.text)});expect(reopened).toEqual(['','','','','','After blanks.']);
 const layouts=await page.evaluate(async()=>{const{fountainForSaving}=await import('/js/session.js'),{parseFountain}=await import('/js/fountain.js'),{createMeasurer,layoutUnits,paginate}=await import('/js/pagination.js');const host=document.createElement('div');host.className='measurement';document.body.append(host);const doc=window.scriptForge.getDocument(),layout=d=>paginate(layoutUnits(d,createMeasurer(host))).map(p=>({used:p.used,items:p.items.map(i=>({gap:i.gap,height:i.height}))}));const result=[layout(doc),layout(parseFountain(fountainForSaving(doc)))];host.remove();return result;});expect(layouts[1]).toEqual(layouts[0]);});
test('emoji typography and actual colored PDF preserve sequence, emphasis and layout',async({page},info)=>{
 await page.goto('/editor.html?new=1');await page.locator('#pages[contenteditable=true]').waitFor();const result=await page.evaluate(async()=>{
  const{createDocument,createElement:e}=await import('/js/document.js'),{createScreenplayPDF}=await import('/js/pdf-export.js'),{createMeasurer,layoutUnits,paginate}=await import('/js/pagination.js'),{renderPages}=await import('/js/renderer.js');
  const text='A 😏 face, 👍🏽 hand, 🇺🇸 flag, 👩🏽‍💻 coder, 👨‍👩‍👧‍👦 family, ❤️ heart, 1️⃣ key and 🦖. **Bold** *italic* ***both***.';
  const doc=createDocument({elements:[e('scene','INT. EMOJI - DAY'),e('action',text),e('character','ANN'),e('parenthetical','(smiling 😏)'),e('dialogue',text.repeat(40))]});
  const before=JSON.stringify(doc),host=document.createElement('div');host.className='measurement';document.body.append(host);const measure=createMeasurer(host),shortLines=measure(e('action','A 😏 face, 👍🏽 hand, 🇺🇸 flag, 👩🏽‍💻 coder.')).length;const pages=paginate(layoutUnits(doc,measure));host.remove();
  const root=document.getElementById('pages');renderPages(root,pages,doc);const el=root.querySelector('.actionLine'),font=getComputedStyle(el),emoji=el.querySelector('.screenplay-emoji');
  const pdf=await createScreenplayPDF(doc),bytes=new Uint8Array(await pdf.blob.arrayBuffer());let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
  return{shortLines,base64:btoa(binary),pages:pdf.pages,editor:pages.length,font:font.fontFamily,size:font.fontSize,height:font.lineHeight,emojiWidth:emoji.getBoundingClientRect().width,unchanged:JSON.stringify(doc)===before,safe:pages.every(p=>p.used<=864)};
 });expect(result.shortLines).toBe(1);expect(result.font.replaceAll('"','')).toBe('Courier Prime');expect(result.size).toBe('16px');expect(result.height).toBe('16px');expect(result.emojiWidth).toBeCloseTo(18.5875,1);expect(result.unchanged).toBe(true);expect(result.safe).toBe(true);expect(result.pages).toBe(result.editor+1);
 const path=info.outputPath('emoji-emphasis.pdf');await writeFile(path,Buffer.from(result.base64,'base64'));const extracted=execFileSync(process.env.PDFTOTEXT??'pdftotext',['-enc','UTF-8',path,'-'],{encoding:'utf8'});for(const emoji of ['😏','👍🏽','🇺🇸','👩🏽‍💻','👨‍👩‍👧‍👦','❤️','1️⃣','🦖'])expect(extracted).toContain(emoji);expect(extracted).toContain('Bold italic both');expect(extracted).not.toContain('**');expect(Buffer.from(result.base64,'base64').includes(Buffer.from('/Subtype /Image'))).toBe(true);
});
for(const zoom of [.65,1,1.5])test(`visible glyph center clicks, doubleclick, wrapped and empty lines at zoom ${zoom}`,async({page})=>{
 const doc=await seed(page,[['scene','INT. ROOM - DAY'],['action','An ordinary line of action. '.repeat(7)],['character','VINCENT'],['parenthetical','(quietly)'],['dialogue','Words of dialogue. '.repeat(8)],['transition','CUT TO:'],['action','']]);
 await page.evaluate(zoom=>document.getElementById('pages').style.setProperty('--page-zoom',zoom),zoom);
 for(const el of doc.elements){const fragment=page.locator(`[data-element-id="${el.id}"]`).first();await fragment.scrollIntoViewIfNeeded();for(const at of [0,Math.floor(el.text.length/2),Math.max(0,el.text.length-1)]){
   const point=await fragment.evaluate((f,at)=>{const n=f.querySelector('span')?.firstChild??f.firstChild,r=document.createRange();if(n.nodeType===3&&n.length>at){r.setStart(n,at);r.setEnd(n,at+1);}else r.selectNodeContents(f);const b=r.getBoundingClientRect();return{x:b.x+Math.min(1,b.width/4),y:b.y+b.height/2};},at);
   await page.mouse.click(point.x,point.y);const selected=await page.evaluate(async()=>{const{readSelection}=await import('/js/selection.js');return readSelection(document.getElementById('pages'))});expect(selected?.focus.id).toBe(el.id);expect(selected.focus.offset).toBe(at);
  }}
 const action=page.locator(`[data-element-id="${doc.elements[1].id}"]`);await action.scrollIntoViewIfNeeded();const box=await action.boundingBox();await page.mouse.dblclick(box.x+30*zoom,box.y+8*zoom);expect(await page.evaluate(()=>window.getSelection().toString().trim())).toBe('ordinary');

});

test('Arrow keys cross hidden emphasis boundaries and compound emoji without getting stuck',async({page})=>{
 const doc=await seed(page,[['action','Before.'],['action','**ABC**'],['action','After 👩🏽‍💻.']]),id=doc.elements[1].id;
 await select(page,id,2);await page.keyboard.press('ArrowLeft');expect(await page.evaluate(()=>window.scriptForge.getSelection().focus.id)).toBe(doc.elements[0].id);
 await select(page,id,5);await page.keyboard.press('ArrowRight');expect(await page.evaluate(()=>window.scriptForge.getSelection().focus.id)).toBe(doc.elements[2].id);
 await select(page,id,2);await page.keyboard.press('ArrowRight');await page.keyboard.type('x');expect(await page.evaluate(()=>window.scriptForge.getDocument().elements[1].text)).toBe('**AxBC**');
 await page.keyboard.press('Backspace');expect(await page.evaluate(()=>window.scriptForge.getDocument().elements[1].text)).toBe('**ABC**');
 const last=doc.elements[2];await select(page,last.id,6);await page.keyboard.press('ArrowRight');expect(await page.evaluate(()=>window.scriptForge.getSelection().focus.offset)).toBe(13);await page.keyboard.press('Backspace');expect(await page.evaluate(()=>window.scriptForge.getDocument().elements[2].text)).toBe('After .');
});

test('emphasis keeps inline notes, mixed paragraph formatting and word navigation intact',async({page})=>{
 const doc=await seed(page,[['action','Before.'],['action','**Bold** [[a note]] tail'],['action','PLAIN']]),a=doc.elements[1],b=doc.elements[2],at=a.text.indexOf('note')+2;
 await select(page,a.id,at);await page.keyboard.type('X');expect(await page.evaluate(()=>window.scriptForge.getDocument().elements[1].text)).toBe('**Bold** [[a noXte]] tail');await page.keyboard.press('ControlOrMeta+z');
 await select(page,a.id,2);await page.keyboard.press('Control+ArrowLeft');expect(await page.evaluate(()=>window.scriptForge.getSelection().focus.id)).toBe(doc.elements[0].id);
 await page.evaluate(async({a,b})=>{const{restoreSelection}=await import('/js/selection.js');restoreSelection(document.getElementById('pages'),{anchor:{id:a.id,offset:0},focus:{id:b.id,offset:b.text.length}},{scroll:true});},{a,b});await page.keyboard.press('ControlOrMeta+b');
 const styled=await page.evaluate(()=>window.scriptForge.getDocument().elements);expect(styled[1].text).toContain('[[a note]]');expect(styled[2].text).toBe('**PLAIN**');
 await page.keyboard.press('ControlOrMeta+z');expect((await page.evaluate(()=>window.scriptForge.getDocument())).elements).toEqual(doc.elements);
});

for(const zoom of [.65,1,1.5])test(`native drag selection works independently at zoom ${zoom}`,async({page})=>{
 const doc=await seed(page,[['action','The quick brown fox jumps over the lazy dog.']]),id=doc.elements[0].id;
 await page.evaluate(zoom=>document.getElementById('pages').style.setProperty('--page-zoom',zoom),zoom);
 const action=page.locator(`[data-element-id="${id}"]`);await action.scrollIntoViewIfNeeded();
 const drag=await action.evaluate(async el=>{const{textPoint}=await import('/js/inline-layout.js');const point=at=>{const a=textPoint(el,at),b=textPoint(el,at+1),r=document.createRange();r.setStart(a.node,a.offset);r.setEnd(b.node,b.offset);const box=r.getBoundingClientRect();return{x:box.left+1,y:box.top+box.height/2};};return{start:point(4),end:point(19)};});
 await page.mouse.move(drag.start.x,drag.start.y);await page.mouse.down();await page.waitForTimeout(60);await page.mouse.move(drag.end.x,drag.end.y,{steps:12});await page.waitForTimeout(40);
 expect((await page.evaluate(()=>getSelection().toString())).length).toBeGreaterThan(3);await page.mouse.up();expect((await page.evaluate(()=>getSelection().toString())).length).toBeGreaterThan(3);
 await page.keyboard.insertText('edited');expect(await page.evaluate(()=>window.scriptForge.getDocument().elements[0].text)).toContain('edited');await page.keyboard.press('ControlOrMeta+z');expect((await page.evaluate(()=>window.scriptForge.getDocument())).elements).toEqual(doc.elements);
});
