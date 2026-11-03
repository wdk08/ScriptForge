import test from 'node:test';import assert from 'node:assert/strict';
import {createDocument,createElement} from '../js/document.js';
import {editDocument,caret,editableElements,EditorHistory} from '../js/editing.js';
for(const name of ['VINCENT','VINCENT (V.O.)','VINCENT (O.S.)',"VINCENT (CONT'D)",'Vincent (V.O.)'])test(`Tab formats the existing ${name} cue, then focuses one parenthetical`,()=>{
 const doc=createDocument({elements:[createElement('action',name)]}),id=doc.elements[0].id;
 const result=editDocument(doc,caret(id,name.length),{type:'tab'}),els=editableElements(result.document);
 assert.deepEqual(els.map(e=>[e.type,e.text]),[['character',name.toUpperCase()],['parenthetical','()']]);assert.equal(els[0].id,id);assert.deepEqual(result.selection,caret(els[1].id,1));assert.equal(doc.elements[0].type,'action');
 const history=new EditorHistory(doc,caret(id,name.length));history.apply(caret(id,name.length),{type:'tab'});assert.equal(editableElements(history.current.document)[0].type,'character');history.undo();assert.equal(history.current.document.elements[0].type,'action');history.redo();assert.equal(editableElements(history.current.document)[1].type,'parenthetical');
});
for(const text of ['Vincent walks away.','VINCENT WALKS AWAY','THE DOOR OPENS','A beat.','CUT TO:','INT. HOUSE - DAY'])test(`Tab preserves ordinary Action: ${text}`,()=>{
 const doc=createDocument({elements:[createElement('action',text)]});const result=editDocument(doc,caret(doc.elements[0].id,text.length),{type:'tab'});assert.equal(result.document.elements[0].type,'action');assert.equal(result.document.elements[0].text,text);
});
test('Tab on a cue within multiline Action retains neighboring text and Shift+Tab stays unchanged',()=>{
 const doc=createDocument({elements:[createElement('action','A door opens.\nVINCENT\nHe looks inside.')]});let result=editDocument(doc,caret(doc.elements[0].id,17),{type:'tab'});
 assert.deepEqual(editableElements(result.document).map(e=>[e.type,e.text]),[['action','A door opens.'],['character','VINCENT'],['parenthetical','()'],['action','He looks inside.']]);
 const reverse=createDocument({elements:[createElement('action','VINCENT')]});result=editDocument(reverse,caret(reverse.elements[0].id,7),{type:'tab',reverse:true});assert.equal(result.document.elements[0].type,'action');assert.equal(editableElements(result.document)[1].type,'scene');
});
