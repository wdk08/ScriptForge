import {test,expect} from '@playwright/test';import {unicodePDFProof} from '../helpers/unicode-pdf.js';
test.beforeEach(async({context})=>context.addInitScript(()=>{window.scriptForgeLocalHelperDisabled=true;window.showDirectoryPicker=undefined}));
test('Unicode PDF embeds real glyphs, extracts original text and matches editor pagination',async({page},testInfo)=>unicodePDFProof(page,testInfo));
test('unsupported PDF glyph error includes code point and exact location',async({page})=>{
 await page.goto('/editor.html?new=1');await page.locator('#pages[contenteditable=true]').waitFor();
 const error=await page.evaluate(async()=>{const{createDocument,createElement}=await import('/js/document.js'),{createScreenplayPDF}=await import('/js/pdf-export.js');try{await createScreenplayPDF(createDocument({elements:[createElement('action','A \u{10ffff} appears.')]}))}catch(e){return e.message}});
 expect(error).toMatch(/U\+10FFFF.*action element 1.*line 1, column 3/);
});
test('Tab recognizes the existing Action cue and gives the new parenthetical the caret',async({page})=>{
 await page.goto('/');await expect(page.locator('#new-screenplay')).toBeEnabled();
 const result=await page.evaluate(async()=>{
  const{createDocument,createElement}=await import('/js/document.js'),{repository}=await import('/js/storage.js'),{draftRecord}=await import('/js/session.js');
  const doc=createDocument({elements:[createElement('action','VINCENT (V.O.)')]});const record=draftRecord(doc);record.recovery.dirty=false;await repository.put(record);return{id:doc.id,cue:doc.elements[0].id};
 });await page.goto(`/editor.html?id=${result.id}`);if(await page.locator('#recover-changes').isVisible())await page.locator('#recover-changes').click();await page.locator('#pages[contenteditable=true]').waitFor();
 await page.evaluate(async id=>{const{restoreSelection}=await import('/js/selection.js');restoreSelection(document.getElementById('pages'),{anchor:{id,offset:14},focus:{id,offset:14}})},result.cue);
 await page.keyboard.press('Tab');await expect(page.locator('#pages .character')).toHaveText('VINCENT (V.O.)');await expect(page.locator('#pages .parenthetical')).toHaveText('()');await page.keyboard.type('quietly');await expect(page.locator('#pages .parenthetical')).toHaveText('(quietly)');
 await page.keyboard.press('ControlOrMeta+z');await page.keyboard.press('ControlOrMeta+z');await expect(page.locator('#pages .actionLine')).toHaveText('VINCENT (V.O.)');
});

test('bold scene headings retain bold numbers in both PDF gutters',async({page})=>{
 await page.goto('/editor.html?new=1');await page.locator('#pages[contenteditable=true]').waitFor();
 await page.addScriptTag({url:'/vendor/jspdf.umd.min.js'});
 const writes=await page.evaluate(async()=>{
  const{createScreenplayPDF}=await import('/js/pdf-export.js'),{createDocument,createElement}=await import('/js/document.js');
  const Original=window.jspdf.jsPDF,output=[];
  window.jspdf.jsPDF=function(...args){const pdf=new Original(...args),text=pdf.text.bind(pdf);pdf.text=(value,x,y,options)=>{if(value==='125')output.push({x,style:pdf.getFont().fontStyle,align:options.align});return text(value,x,y,options)};return pdf};
  const doc=createDocument({elements:[createElement('scene','INT. CAFÉ Ω - DAY',{sceneNumber:'125'}),createElement('action','A scene begins.')]});doc.settings={boldSceneHeadings:true,sceneNumbers:true};
  await createScreenplayPDF(doc);return output;
 });expect(writes).toHaveLength(2);expect(writes.every(w=>w.style==='bold')).toBe(true);expect(writes.map(w=>w.align)).toEqual(['left','right']);
});
