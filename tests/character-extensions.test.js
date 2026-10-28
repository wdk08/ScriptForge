import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocument,createElement} from '../js/document.js';
import {editDocument,caret} from '../js/editing.js';
import {parseFountain,serializeFountain} from '../js/fountain.js';
import {detectedCharacters} from '../js/characters.js';
import {buildTableRead,characterIdentity} from '../js/table-read-model.js';
import {screenplayPaste} from '../js/screenplay-paste.js';
for(const extension of ['V.O.','O.S.','O.C.',"CONT'D",'CONTINUED','FILTERED','ON PHONE','through a radio'])test(`recognize and retain ${extension} across editing and Fountain`,()=>{
 const cue=`vincent (${extension.toLowerCase()})`;
 const el=createElement('action',cue),doc=createDocument({elements:[createElement('character','VINCENT'),createElement('dialogue','Hello.'),el]});
 const next=editDocument(doc,caret(el.id,cue.length),{type:'enter'}).document;
 assert.equal(next.elements.find(e=>e.id===el.id).type,'character');assert.equal(next.elements.find(e=>e.id===el.id).text,cue.toUpperCase());
 const imported=parseFountain(`${cue}\nHello.\n`);assert.equal(imported.elements[0].type,'character');
 assert.equal(parseFountain(serializeFountain(imported)).elements[0].text,cue);
 assert.equal(characterIdentity(cue).id,'character:VINCENT');assert.equal(detectedCharacters(next).length,1);
 assert.equal(buildTableRead(imported).sequence[0].speakerId,'character:VINCENT');
 assert.equal(screenplayPaste(`${cue}\nHello.\n\n`)?.find(e=>e.type==='character')?.text?.toUpperCase(),cue.toUpperCase());
});
test('parentheses in ordinary action are not cue evidence',()=>{
 for(const line of ['Vincent walks (outside)','She runs (quickly)','The door opens (slowly)'])assert.equal(parseFountain(`${line}\nHe watches.\n`).elements[0].type,'action');
});
