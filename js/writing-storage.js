import {resumeSession} from './writing-sessions.js';
export class StatisticsBusyError extends Error{constructor(){super('Writing statistics are active in another ScriptForge window. This window can still edit and save screenplays.');this.name='StatisticsBusyError';}}
export function createWritingStore(factory,name='scriptforge-writing'){
 if(factory===undefined){try{factory=globalThis.indexedDB;}catch{factory=null;}}
 name=(globalThis.scriptForgeDiagnosticDatabasePrefix??'')+name;
 let opening,connection,closed=false;const active=new Set();
 function database(){if(closed)return Promise.reject(new Error('Writing statistics are paused.'));if(!factory)return Promise.reject(new Error('Writing statistics storage is unavailable. Your screenplay saving is unaffected.'));
  return opening??=new Promise((resolve,reject)=>{const r=factory.open(name,1),timer=setTimeout(()=>{reject(new Error('Writing statistics storage timed out.'));},8000);r.onupgradeneeded=()=>{r.result.createObjectStore('sessions',{keyPath:'id'});r.result.createObjectStore('meta');};r.onsuccess=()=>{clearTimeout(timer);const db=r.result;if(closed){db.close();reject(new Error('Writing statistics are paused.'));return;}connection=db;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};r.onerror=()=>{clearTimeout(timer);opening=null;reject(r.error);};r.onblocked=()=>{clearTimeout(timer);opening=null;reject(new Error('Writing statistics storage is blocked. Close other ScriptForge windows and retry.'));};});}
 async function operation(mode,run){const db=await database();if(closed)throw new Error('Writing statistics are paused.');return new Promise((resolve,reject)=>{const tx=db.transaction(['sessions','meta'],mode);active.add(tx);let value,error;const timer=setTimeout(()=>{error=new Error('Writing statistics could not be saved in time.');try{tx.abort();}catch{}},8000);tx.oncomplete=()=>{active.delete(tx);clearTimeout(timer);resolve(value);};tx.onabort=tx.onerror=()=>{active.delete(tx);clearTimeout(timer);reject(error??tx.error??new Error('Writing statistics storage failed.'));};try{run(tx,v=>{value=v;},e=>{error=e;tx.abort();});}catch(e){error=e;tx.abort();}});}
 return {
  reopen(){closed=false;},
  close(){closed=true;for(const tx of active)try{tx.abort();}catch{}active.clear();connection?.close();connection=null;opening=null;},
  list:()=>operation('readonly',(tx,done)=>{tx.objectStore('sessions').getAll().onsuccess=e=>done(e.target.result.sort((a,b)=>b.startedAt-a.startedAt));}),
  acquire:(owner,now)=>operation('readwrite',(tx,done,fail)=>{const meta=tx.objectStore('meta'),sessions=tx.objectStore('sessions');meta.get('head').onsuccess=e=>{const head=e.target.result;
   if(head?.owner&&head.owner!==owner&&head.until>now&&head.until-now<=45000){fail(new StatisticsBusyError());return;}
   const finish=saved=>{const session=resumeSession(saved,now);meta.put({id:session.id,owner,until:now+45000},'head');sessions.put(session);done(session);};
   if(head?.id)sessions.get(head.id).onsuccess=e=>finish(e.target.result);else finish(null);
  };}),
  save:(owner,session,now,{release=false}={})=>operation('readwrite',(tx,done,fail)=>{const meta=tx.objectStore('meta');meta.get('head').onsuccess=e=>{
   const head=e.target.result;if(head?.owner!==owner||head.id!==session.id){fail(new StatisticsBusyError());return;}
   const store=tx.objectStore('sessions');store.get(session.id).onsuccess=e=>{if((e.target.result?.revision??0)>session.revision){fail(new Error('A newer writing checkpoint already exists.'));return;}store.put(session);meta.put({id:session.id,owner:release?null:owner,until:release?0:now+45000},'head');done(session);};
  };}),
  clear:()=>operation('readwrite',(tx,done)=>{tx.objectStore('sessions').clear();tx.objectStore('meta').clear();done();}),
 };
}
