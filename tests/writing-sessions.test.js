import test from 'node:test';import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createDocument,createElement} from '../js/document.js';
import {WritingTracker,documentMetrics,summarizeSegments,resumeSession,freshSession,RESUME_MS} from '../js/writing-sessions.js';
import {createWritingStore} from '../js/writing-storage.js';
function fixture(){let wall=Date.UTC(2026,9,27),mono=0;const doc=createDocument({elements:[createElement('action','Hello world')]});const tracker=new WritingTracker(freshSession(wall),{wall:()=>wall,mono:()=>mono});return {doc,tracker,metrics:(text,pages=1)=>documentMetrics({...doc,elements:[{...doc.elements[0],text}]},pages),advance(ms){wall+=ms;mono+=ms;tracker.tick();},jump(w,m){wall+=w;mono+=m;tracker.tick();},now:()=>wall};}
test('only opening a screenplay starts a segment; idle/background/sleep and editing time are distinct',()=>{
 const f=fixture(),t=f.tracker;assert.equal(t.session.segments.length,0);t.open(documentMetrics(f.doc,1));t.observe(f.metrics('Hello world new'),'insert',{text:'new',prefix:' '});
 for(let i=0;i<36;i++)f.advance(10000);const s=summarizeSegments(t.session.segments);assert.equal(s.activeMs,300000);assert.equal(s.editingMs,30000);
 t.interact();f.advance(10000);t.suspend();f.advance(10000);assert.equal(summarizeSegments(t.session.segments).activeMs,310000);
 t.interact();f.advance(120000);assert.equal(summarizeSegments(t.session.segments).activeMs,310000);
});
test('home/close pause, thirty-minute resume threshold and crash recovery use the last persisted checkpoint',()=>{
 const f=fixture();f.tracker.open(documentMetrics(f.doc,1));f.advance(10000);const crash=f.tracker.checkpoint();
 const recovered=resumeSession(crash,f.now()+20000);assert.equal(recovered.id,crash.id);assert.equal(recovered.segments[0].endedAt,crash.endedAt);assert.equal(recovered.segments[0].activeMs,10000);
 f.tracker.pause();const saved=f.tracker.checkpoint();assert.equal(resumeSession(saved,f.now()+RESUME_MS).id,saved.id);assert.notEqual(resumeSession(saved,f.now()+RESUME_MS+1).id,saved.id);
 assert.notEqual(resumeSession(saved,f.now()-10000).id,saved.id);
});
test('A to B to A aggregates stable screenplay IDs and separate segments without counting closed time',()=>{
 const f=fixture(),t=f.tracker,a=documentMetrics(f.doc,1),b={...a,id:'other',title:'B'};t.open(a);f.advance(10000);t.open(b);f.advance(10000);t.open({...a,title:'Renamed A'});f.advance(10000);t.pause();f.advance(10000);
 const all=summarizeSegments(t.session.segments);assert.equal(all.activeMs,30000);assert.equal(all.subsessions,3);assert.equal(all.screenplays.length,2);assert.equal(summarizeSegments(t.session.segments.filter(s=>s.documentId===a.id)).activeMs,20000);
});
test('typing batches do not count every keystroke; undo/redo alter net/page totals without inflating gross or typed words',()=>{
 const f=fixture(),t=f.tracker;t.open(f.metrics(''));
 for(const [text,char] of [['H','H'],['He','e'],['Hel','l'],['Hello','lo']])t.observe(f.metrics(text),'insert',{text:char,prefix:text.slice(0,-char.length)});
 t.settle();let s=summarizeSegments(t.session.segments);assert.equal(s.added,1);assert.equal(s.typed,1);assert.equal(s.netWords,1);
 t.observe(f.metrics('',1),'undo');s=summarizeSegments(t.session.segments);assert.equal(s.netWords,0);assert.equal(s.added,1);
 t.observe(f.metrics('Hello',2),'redo');s=summarizeSegments(t.session.segments);assert.equal(s.netWords,1);assert.equal(s.pages,1);assert.equal(s.added,1);assert.equal(s.typed,1);
});
test('cut and paste movement is not newly written/deleted text; genuine paste and deletion count separately',()=>{
 const f=fixture(),t=f.tracker;t.open(f.metrics('Hello world'));t.observe(f.metrics(''),'cut');t.observe(f.metrics('world Hello'),'paste');let s=summarizeSegments(t.session.segments);assert.equal(s.added,0);assert.equal(s.deleted,0);assert.equal(s.netWords,0);
 t.observe(f.metrics('world Hello new words'),'paste');t.observe(f.metrics('Hello new words'),'backspace');s=summarizeSegments(t.session.segments);assert.equal(s.added,2);assert.equal(s.deleted,1);assert.equal(s.netWords,1);assert.equal(s.typed,0);
});
test('scene renaming and reordering preserve IDs; undo removes scene creation and no fixed words/page estimate is used',()=>{
 const f=fixture(),scene=createElement('scene','INT. ROOM - NIGHT'),doc={...f.doc,elements:[scene,...f.doc.elements]},t=f.tracker;t.open(documentMetrics(doc,1));t.observe(documentMetrics({...doc,elements:[doc.elements[1],{...scene,text:'EXT. PARK - DAY'}]},7),'edit');
 let s=summarizeSegments(t.session.segments);assert.equal(s.scenesCreated,0);assert.equal(s.scenesRemoved,0);assert.equal(s.pages,6);
 const added={...doc,elements:[...doc.elements,createElement('scene','INT. CAR - DAY')]};t.observe(documentMetrics(added,8),'edit');assert.equal(summarizeSegments(t.session.segments).scenesCreated,1);t.observe(documentMetrics(doc,1),'undo');assert.equal(summarizeSegments(t.session.segments).scenesCreated,0);
});
test('clock jumps and system sleep never accumulate phantom active writing time',()=>{
 const f=fixture();f.tracker.open(documentMetrics(f.doc,1));f.advance(10000);f.jump(3600000,10000);f.jump(-3600000,10000);assert.equal(summarizeSegments(f.tracker.session.segments).activeMs,10000);
});
test('atomic persistence survives reopen, excludes competing writers, prevents stale checkpoints and clearing resurrection',async()=>{
 const factory=new IDBFactory(),store=createWritingStore(factory,'stats-test');assert.deepEqual(await store.list(),[]);
 const session=await store.acquire('one',1000),f=fixture(),tracker=new WritingTracker(session,{wall:()=>2000,mono:()=>1000});tracker.open(documentMetrics(f.doc,1));const saved=tracker.checkpoint();await store.save('one',saved,2000);
 await assert.rejects(store.acquire('two',3000),/another/);assert.equal((await createWritingStore(factory,'stats-test').list())[0].id,session.id);
 const recovered=await store.acquire('two',50000);assert.equal(recovered.id,session.id);await assert.rejects(store.save('one',saved,50001),/another/);
 await store.clear();await assert.rejects(store.save('two',recovered,50002),/another/);assert.deepEqual(await store.list(),[]);
});
test('moving words between screenplays adjusts the original segment and keeps per-script net changes',()=>{
 const f=fixture(),t=f.tracker;t.open(f.metrics('Hello world'));t.observe(f.metrics(''),'cut');
 const b={...f.metrics(''),id:'B'};t.open(b);t.observe({...f.metrics('Hello world'),id:'B'},'paste');
 const total=summarizeSegments(t.session.segments);assert.equal(total.added,0);assert.equal(total.deleted,0);assert.equal(total.netWords,0);assert.equal(t.session.segments[0].latest.words-t.session.segments[0].baseline.words,-2);assert.equal(t.session.segments[1].latest.words-t.session.segments[1].baseline.words,2);
});
test('pasting ordinary words that shadow object properties cannot corrupt counts',()=>{
 const f=fixture(),t=f.tracker;t.open(f.metrics('Hello'));t.observe(f.metrics(''),'cut');t.observe(f.metrics('constructor prototype'),'paste');const s=summarizeSegments(t.session.segments);assert.equal(s.added,2);assert.equal(s.deleted,1);
});
test('page suspension closes pending database resources and reopening resumes without a stale lease overwrite',async()=>{
 const store=createWritingStore(new IDBFactory(),'suspend-test');const s=await store.acquire('one',1000);await store.save('one',s,1000,{release:true});store.close();await assert.rejects(store.list(),/paused/);store.reopen();assert.equal((await store.acquire('two',2000)).id,s.id);
});
test('active and editing time split at local midnight instead of assigning the whole interval to one day',()=>{
 let wall=new Date(2026,9,27,23,59,55).getTime(),mono=0;const t=new WritingTracker(freshSession(wall),{wall:()=>wall,mono:()=>mono}),doc=createDocument({elements:[createElement('action','')]});t.open(documentMetrics(doc,1));t.observe(documentMetrics({...doc,elements:[{...doc.elements[0],text:'New'}]},1),'insert',{text:'New'});wall+=10000;mono+=10000;t.tick();const days=summarizeSegments(t.session.segments).days;assert.equal(days['2026-10-27'].activeMs,5000);assert.equal(days['2026-10-28'].activeMs,5000);assert.equal(days['2026-10-28'].editingMs,5000);
});
test('checkpoints persist counters and stable IDs without rewriting entire screenplay word inventories',()=>{
 const f=fixture();f.tracker.open(documentMetrics(f.doc,1));const saved=f.tracker.checkpoint();assert.equal(saved.segments[0].latest.words,2);assert.equal(saved.segments[0].latest.bag,undefined);assert.equal(f.tracker.segment.latest.bag.hello,1);
});
test('a clock moved backwards cannot leave the old statistics lease permanently locked',async()=>{
 const store=createWritingStore(new IDBFactory(),'clock-lease');await store.acquire('one',1000000);const s=await store.acquire('two',1000);assert.equal(s.startedAt,1000);
});
