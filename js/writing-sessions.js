import {newId} from './document.js';
import {spokenText} from './table-read-model.js';
export const RESUME_MS=30*60*1000, IDLE_MS=5*60*1000, EDITING_MS=30*1000, HEARTBEAT_MS=10000;
export const dayKey=time=>{const d=new Date(time);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const tokens=text=>text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)??[];
export function documentMetrics(doc,pages,cache=new Map()){
 const bag={},scenes=[];let words=0;
 for(const el of doc.elements){
  if(el.type==='scene')scenes.push(el.id);
  if(['titleField','whitespace','pageBreak','note','boneyard','section','synopsis'].includes(el.type))continue;
  let entry=cache.get(el.id);if(entry?.text!==el.text){entry={text:el.text,words:tokens(spokenText(el.text)).map(w=>w.toLocaleLowerCase())};cache.set(el.id,entry);}
  words+=entry.words.length;for(const word of entry.words)bag[word]=(Object.hasOwn(bag,word)?bag[word]:0)+1;
 }
 const ids=new Set(doc.elements.map(e=>e.id));for(const id of cache.keys())if(!ids.has(id))cache.delete(id);
 return {id:doc.id,title:doc.title,words,pages,scenes,bag};
}
export function wordDifference(before,after){let added=0,deleted=0;const additions={},deletions={};
 for(const word of new Set([...Object.keys(before),...Object.keys(after)])){
  const delta=(Object.hasOwn(after,word)?after[word]:0)-(Object.hasOwn(before,word)?before[word]:0);
  if(delta>0){added+=delta;Object.defineProperty(additions,word,{value:delta,enumerable:true,writable:true});}
  if(delta<0){deleted-=delta;Object.defineProperty(deletions,word,{value:-delta,enumerable:true,writable:true});}
 }return {added,deleted,additions,deletions};}
export function freshSession(now){return {id:newId(),startedAt:now,endedAt:now,pausedAt:null,segments:[],revision:0};}
export function resumeSession(saved,now){
 if(!saved)return freshSession(now);
 const session=structuredClone(saved),end=session.segments.at(-1);
 // An unclosed segment is a crash: only committed heartbeat time is retained.
 if(end&&!end.endedAt)end.endedAt=end.checkpointAt;
 const paused=session.pausedAt??end?.checkpointAt??session.endedAt;
 return now>=paused&&now-paused<=RESUME_MS?session:freshSession(now);
}
function addDay(segment,from,duration,field){
 while(duration>0){const date=new Date(from),next=new Date(date.getFullYear(),date.getMonth(),date.getDate()+1).getTime(),n=Math.min(duration,next-from);const key=dayKey(from);segment.days[key]??={activeMs:0,editingMs:0,added:0,deleted:0,typed:0};segment.days[key][field]+=n;duration-=n;from+=n;}
}
export class WritingTracker{
 constructor(session,{wall=()=>Date.now(),mono=()=>performance.now()}={}){Object.assign(this,{session,wall,mono,lastMono:mono(),lastWall:wall(),lastActivity:-Infinity,lastEdit:-Infinity,engaged:false,segment:null,pending:null,cut:session.cutCarry??null});}
 open(metrics){this.pause();const now=Math.max(this.wall(),this.session.endedAt);this.session.pausedAt=null;this.segment={id:newId(),documentId:metrics.id,title:metrics.title,startedAt:now,endedAt:null,checkpointAt:now,baseline:metrics,latest:metrics,activeMs:0,editingMs:0,added:0,deleted:0,typed:0,days:{}};this.session.segments.push(this.segment);this.lastMono=this.mono();this.lastWall=this.wall();this.interact();}
 tick(){const now=this.mono(),wall=this.wall(),delta=now-this.lastMono,start=this.lastMono;
  if(this.segment){
   // Sleep, suspended timers and clock discontinuities never become writing time.
   if(this.engaged&&delta>=0&&delta<=HEARTBEAT_MS*3&&Math.abs((wall-this.lastWall)-delta)<5000){
    const active=Math.max(0,Math.min(delta,this.lastActivity+IDLE_MS-start)),edit=Math.max(0,Math.min(active,this.lastEdit+EDITING_MS-start));
    this.segment.activeMs+=active;this.segment.editingMs+=edit;
    addDay(this.segment,this.lastWall,active,'activeMs');addDay(this.segment,this.lastWall,edit,'editingMs');
   }
   this.segment.checkpointAt=Math.max(wall,this.segment.checkpointAt);this.session.endedAt=this.segment.checkpointAt;
  }this.lastMono=now;this.lastWall=wall;
 }
 interact(edit=false){this.tick();this.engaged=true;this.lastActivity=this.mono();if(edit)this.lastEdit=this.mono();}
 suspend(){this.tick();this.settle();this.engaged=false;}
 observe(metrics,kind='edit',{text='',prefix=''}={}){
  if(!this.segment||metrics.id!==this.segment.documentId)return;
  if(JSON.stringify(metrics)===JSON.stringify(this.segment.latest))return;
  if(kind==='layout'&&JSON.stringify(metrics.bag)===JSON.stringify(this.segment.latest.bag)&&JSON.stringify(metrics.scenes)===JSON.stringify(this.segment.latest.scenes)){this.segment.latest=metrics;this.segment.title=metrics.title;return;}
  this.interact(true);const previous=this.segment.latest;this.segment.latest=metrics;this.segment.title=metrics.title;
  if(kind==='undo'||kind==='redo'){this.settle();this.cut=null;this.session.cutCarry=null;return;}
  if(kind!=='insert')this.settle();
  if(kind==='insert'&&text){let last=/[\p{L}\p{N}'’]$/u.test(prefix),typed=0;for(const ch of text){const word=/[\p{L}\p{N}]/u.test(ch);if(word&&!last)typed++;last=word||(/[’']/u.test(ch)&&last);}this.segment.typed+=typed;this.day().typed+=typed;}
  if(kind==='cut'){
   const diff=wordDifference(previous.bag,metrics.bag);this.record(diff);this.cut={bag:diff.deletions,remaining:diff.deleted,at:this.wall(),day:dayKey(this.wall()),segmentId:this.segment.id};this.session.cutCarry=this.cut;return;
  }
  if(kind==='paste'&&this.cut&&this.wall()>=this.cut.at&&this.wall()-this.cut.at<RESUME_MS){
   const diff=wordDifference(previous.bag,metrics.bag);let moved=0;
   for(const word of Object.keys(diff.additions)){const n=Math.min(diff.additions[word],Object.hasOwn(this.cut.bag,word)?this.cut.bag[word]:0);moved+=n;if(n)this.cut.bag[word]-=n;}
   const origin=this.session.segments.find(s=>s.id===this.cut.segmentId);if(origin){origin.deleted-=moved;origin.days[this.cut.day].deleted-=moved;diff.added-=moved;}this.record(diff);this.cut=null;this.session.cutCarry=null;return;
  }
  this.pending??={before:previous,after:metrics,day:dayKey(this.wall())};this.pending.after=metrics;
  if(kind!=='insert')this.settle();
 }
 day(){const key=dayKey(this.wall());return this.segment.days[key]??=( {activeMs:0,editingMs:0,added:0,deleted:0,typed:0} );}
 record(diff,day=this.day()){this.segment.added+=diff.added;this.segment.deleted+=diff.deleted;day.added+=diff.added;day.deleted+=diff.deleted;}
 settle(){if(this.pending){const pending=this.pending;this.pending=null;const day=this.segment.days[pending.day]??=( {activeMs:0,editingMs:0,added:0,deleted:0,typed:0} );this.record(wordDifference(pending.before.bag,pending.after.bag),day);}}
 checkpoint(){this.tick();this.settle();this.session.revision++;const snapshot=structuredClone(this.session);for(const segment of snapshot.segments){delete segment.baseline.bag;delete segment.latest.bag;}return snapshot;}
 pause(){if(!this.segment)return;this.tick();this.settle();this.segment.endedAt=this.segment.checkpointAt;this.session.pausedAt=this.segment.endedAt;this.segment=null;this.engaged=false;}
}
export function summarizeSegments(segments){
 const total={activeMs:0,editingMs:0,added:0,deleted:0,typed:0,netWords:0,pages:0,scenesCreated:0,scenesRemoved:0,subsessions:segments.length,screenplays:[],days:{}};const ids=new Set();
 for(const s of segments){ids.add(s.documentId);for(const key of ['activeMs','editingMs','added','deleted','typed'])total[key]+=s[key];total.netWords+=s.latest.words-s.baseline.words;total.pages+=s.latest.pages-s.baseline.pages;
  total.scenesCreated+=s.latest.scenes.filter(id=>!s.baseline.scenes.includes(id)).length;total.scenesRemoved+=s.baseline.scenes.filter(id=>!s.latest.scenes.includes(id)).length;
  for(const [day,value] of Object.entries(s.days)){total.days[day]??={activeMs:0,editingMs:0,added:0,deleted:0,typed:0};for(const key of Object.keys(value))total.days[day][key]+=value[key];}
 }total.screenplays=[...ids];total.wordsPerHour=total.activeMs?total.added/(total.activeMs/3600000):0;return total;
}
