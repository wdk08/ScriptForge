// Independent Poppler verification of real browser/native PDF output.
import {execFileSync} from 'node:child_process';
import {readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export function verifyUnicodePDF(file){
 const text=execFileSync(process.env.PDFTOTEXT??'pdftotext',['-enc','UTF-8',file,'-'],{encoding:'utf8'});
 for(const char of ['“','”','‘','’','—','–','…','é','Ω','Ж','✓','→','♥','\u0301']){
  const count=text.split(char).length-1;if(count!==(char==='Ω'?26:char==='é'?48:24))throw new Error(`PDF lost ${char} U+${char.codePointAt(0).toString(16)}: ${file} (${count})`);
 }
 if(!text.includes('"quote"')||!text.includes("apostrophe'")||!text.includes('(MORE)')||!text.includes("(CONT'D)"))throw new Error(`PDF lost punctuation or page continuation text: ${file}`);
 if(text.split('cafe\u0301').length-1!==24)throw new Error('PDF extraction detached or reordered a combining accent.');
 if(text.includes('\ufffd'))throw new Error('PDF contains replacement characters.');
 return text;
}
async function files(root){const result=[];for(const entry of await readdir(root,{withFileTypes:true})){const p=join(root,entry.name);if(entry.isDirectory())result.push(...await files(p));else if(p.endsWith('.pdf'))result.push(p);}return result;}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const pdfs=await files(resolve(process.argv[2]));if(pdfs.length!==3)throw new Error('All three native platform PDF proofs are required.');
 for(const pdf of pdfs){verifyUnicodePDF(pdf);console.log(`Native Unicode PDF text verified independently: ${pdf}`);}
}
