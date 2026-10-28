import {newId} from './document.js';
import {WritingTracker,documentMetrics,HEARTBEAT_MS} from './writing-sessions.js';
import {createWritingStore} from './writing-storage.js';
export function createWritingController({store=createWritingStore(),error=()=>{}}={}){
 const owner=newId(),cache=new Map();let tracker=null,queue=Promise.resolve(),timer=null,docId=null,typingTimer=null,retryTimer=null,latestMetrics=null,latestDoc=null,latestPages=0,generation=0,abandoned=false;
 function enqueue(work){const token=generation;queue=queue.then(()=>token===generation?work():undefined).catch(failure=>{if(!abandoned)error(failure);});return queue;}
 async function persist(release=false){if(!tracker)return;const snapshot=tracker.checkpoint();try{await store.save(owner,snapshot,Date.now(),{release});if(release)tracker=null;}catch(failure){if(failure.name==='StatisticsBusyError'){tracker=null;clearInterval(timer);if(!release&&docId){clearTimeout(retryTimer);retryTimer=setTimeout(()=>controller.open(latestDoc,latestPages),10000);}}throw failure;}}
 const controller={
  store,
  open(doc,pages){abandoned=false;store.reopen?.();const metrics=documentMetrics(doc,pages,cache);latestMetrics=metrics;latestDoc=doc;latestPages=pages;docId=doc.id;return enqueue(async()=>{
   if(tracker){tracker.open(metrics);await persist();}
   else{try{tracker=new WritingTracker(await store.acquire(owner,Date.now()));tracker.open(latestMetrics);await persist();}catch(failure){if(failure.name==='StatisticsBusyError'){clearTimeout(retryTimer);retryTimer=setTimeout(()=>{if(docId===doc.id)controller.open(latestDoc,latestPages);},10000);}throw failure;}}
   clearInterval(timer);timer=setInterval(()=>enqueue(async()=>{if(document.visibilityState!=='visible'||document.querySelector('dialog[open]')||!document.hasFocus())tracker?.suspend();await persist();}),HEARTBEAT_MS);
  });},
  observe(doc,pages,kind,details){if(doc.id!==docId)return;const metrics=documentMetrics(doc,pages,cache);latestMetrics=metrics;latestDoc=doc;latestPages=pages;return enqueue(()=>{tracker?.observe(metrics,kind,details);if(document.visibilityState!=='visible'||document.querySelector('dialog[open]'))tracker?.suspend();clearTimeout(typingTimer);typingTimer=setTimeout(()=>enqueue(()=>persist()),1000);});},
  interact(){return enqueue(()=>tracker?.interact());},
  suspend(){return enqueue(async()=>{tracker?.suspend();await persist();});},
  pause(){clearInterval(timer);clearTimeout(retryTimer);clearTimeout(typingTimer);return enqueue(async()=>{tracker?.pause();await persist(true);docId=null;});},
  flush(){return enqueue(()=>persist());},
  abandon(){clearInterval(timer);clearTimeout(typingTimer);clearTimeout(retryTimer);abandoned=true;generation++;tracker=null;docId=null;store.close?.();},
  async clear(){await controller.pause();await store.clear();},
  get current(){return tracker?.session;},
 };
 return controller;
}
