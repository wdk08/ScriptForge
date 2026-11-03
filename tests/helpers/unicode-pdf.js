import {expect} from '@playwright/test';import {writeFile} from 'node:fs/promises';
import {verifyUnicodePDF} from '../../scripts/verify-unicode-pdfs.mjs';
export async function unicodePDFProof(page,testInfo){
 await page.goto('editor.html?new=1');await page.locator('#pages[contenteditable=true]').waitFor();
 const result=await page.evaluate(async()=>{
  const load=name=>import(new URL(`./js/${name}.js`,location.href).href);
  const{createDocument,createElement}=await load('document'),{createScreenplayPDF}=await load('pdf-export'),{ensureScreenplayFonts}=await load('screenplay-format');await ensureScreenplayFonts();
  const{paginate,layoutUnits,createMeasurer}=await load('pagination'),{serializeFountain}=await load('fountain');
  const text='Straight "quote" and apostrophe\' — “curly” ‘apostrophe’ – ellipsis… café naïve José Ω Ж ✓ → ♥ cafe\u0301. ';
  const doc=createDocument({title:'Unicode Ω',elements:[createElement('scene','INT. CAFÉ Ω - DAY',{sceneNumber:'125'}),createElement('character','VINCENT'),createElement('dialogue',text.repeat(24))]});doc.settings={sceneNumbers:true,boldSceneHeadings:true};
  const before=JSON.stringify(doc),fountain=serializeFountain(doc),host=document.createElement('div');host.className='measurement';document.body.append(host);
  const pages=paginate(layoutUnits(doc,createMeasurer(host)));host.remove();
  const pdf=await createScreenplayPDF(doc),bytes=new Uint8Array(await pdf.blob.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  return{base64:btoa(binary),pages:pdf.pages,editorPages:pages.length,overflow:pages.some(p=>p.used>864),unchanged:before===JSON.stringify(doc)&&fountain===serializeFountain(doc)};
 });
 expect(result.pages).toBe(result.editorPages+1);expect(result.pages).toBeGreaterThanOrEqual(3);expect(result.overflow).toBe(false);expect(result.unchanged).toBe(true);
 const path=testInfo.outputPath('unicode-screenplay.pdf');await writeFile(path,Buffer.from(result.base64,'base64'));const text=verifyUnicodePDF(path);expect(text).toContain('125');
}
