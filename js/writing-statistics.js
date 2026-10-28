import {createWritingStore} from './writing-storage.js';
import {summarizeSegments,dayKey} from './writing-sessions.js';
const time=ms=>`${Math.floor(ms/3600000)}h ${Math.floor(ms/60000)%60}m`;
const num=n=>Math.round(n).toLocaleString();
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
export function setupWritingStatistics({button,controller=null,store=controller?.store??createWritingStore(),onClear=()=>{}}={}){
 if(!button)return;
 const dialog=node('dialog',undefined,'writing-statistics');dialog.setAttribute('aria-label','Writing Statistics');document.body.append(dialog);
 async function show(){
  dialog.replaceChildren(node('h1','Writing Statistics'));const close=node('button','Close','secondary-button');close.onclick=()=>dialog.close();dialog.append(close);
  try{
   await controller?.suspend();const sessions=await store.list(),all=sessions.flatMap(s=>s.segments),summary=summarizeSegments(all);
   const current=sessions.find(s=>s.id===controller?.current?.id);const intro=node('p',current?`Current session · started ${new Date(current.startedAt).toLocaleString()} · ${current.segments.length} screenplay segments`:'No screenplay session is active in this window.');dialog.append(intro);
   const cards=node('div',undefined,'writing-totals');
   for(const [label,value] of [['Active screenplay time',time(summary.activeMs)],['Editing time',time(summary.editingMs)],['Words added',num(summary.added)],['Words deleted',num(summary.deleted)],['Net words',num(summary.netWords)],['Words typed',num(summary.typed)],['Pages gained / lost',num(summary.pages)],['Scenes created / removed',`${summary.scenesCreated} / ${summary.scenesRemoved}`],['Words / active hour',num(summary.wordsPerHour)]]){const card=node('div');card.append(node('strong',value),node('span',label));cards.append(card);}dialog.append(cards);
   dialog.append(node('p','Active time ends after five minutes without editor interaction. Editing time covers up to 30 seconds after each document edit. Background, settings and closed time are excluded. Words added/deleted measure gross edits; undo/redo affect net changes, not new writing.'));
   dialog.append(node('h2','Daily activity · last seven days'));const bars=node('div',undefined,'writing-days');let weekActive=0,weekWords=0;
   for(let days=6;days>=0;days--){const date=new Date();date.setDate(date.getDate()-days);const key=dayKey(date),value=summary.days[key]??{activeMs:0,added:0};weekActive+=value.activeMs;weekWords+=value.added;const row=node('div');row.append(node('span',`${key} · ${time(value.activeMs)} · ${num(value.added)} words`));const bar=node('progress');bar.max=Math.max(3600000,...Object.values(summary.days).map(d=>d.activeMs));bar.value=value.activeMs;bar.setAttribute('aria-label',`${key} active writing time`);row.append(bar);bars.append(row);}dialog.append(bars,node('p',`This week: ${time(weekActive)} active · ${num(weekWords)} words added`));
   dialog.append(node('h2','Screenplays'));const scripts=new Map();for(const s of all){const list=scripts.get(s.documentId)??[];list.push(s);scripts.set(s.documentId,list);}
   for(const list of scripts.values()){list.sort((a,b)=>a.checkpointAt-b.checkpointAt);const s=summarizeSegments(list);dialog.append(node('p',`${list.at(-1).title} · ${time(s.activeMs)} active / ${time(s.editingMs)} editing · ${num(s.added)} added / ${num(s.deleted)} deleted / ${num(s.typed)} typed · ${num(s.netWords)} net words · ${s.pages} pages · ${s.scenesCreated} scenes created / ${s.scenesRemoved} removed · ${num(s.wordsPerHour)} words/hour · ${s.subsessions} segments`));}
   dialog.append(node('h2','Session history'));
   for(const session of sessions){const details=node('details'),total=summarizeSegments(session.segments);details.append(node('summary',`${new Date(session.startedAt).toLocaleString()} · ${time(total.activeMs)} active · ${total.screenplays.length} screenplays`));details.append(node('p',`End/checkpoint: ${new Date(session.endedAt).toLocaleString()} · elapsed span ${time(Math.max(0,session.endedAt-session.startedAt))}`));
    details.append(node('p',`${time(total.editingMs)} editing · ${num(total.added)} added / ${num(total.deleted)} deleted / ${num(total.typed)} typed · ${num(total.netWords)} net words · ${total.pages} pages · ${total.scenesCreated} scenes created / ${total.scenesRemoved} removed · ${num(total.wordsPerHour)} words per active hour`));
    for(const s of session.segments)details.append(node('p',`${s.title} · ${new Date(s.startedAt).toLocaleTimeString()}–${new Date(s.endedAt??s.checkpointAt).toLocaleTimeString()} · ${time(s.activeMs)} active · ${time(s.editingMs)} editing · ${s.latest.words-s.baseline.words} net words`));dialog.append(details);}
   const clear=node('button','Clear writing statistics…','quiet-button');clear.onclick=async()=>{if(!window.confirm('Clear all writing statistics on this device? Screenplays, voices and backups will be kept.'))return;try{if(controller)await controller.clear();else await store.clear();await onClear();await show();}catch(e){dialog.append(node('p',e.message));}};dialog.append(clear);
  }catch(e){dialog.append(node('p',`Statistics unavailable: ${e.message}. Screenplay editing and saving are unaffected.`));}
  if(!dialog.open)dialog.showModal();
 }
 button.addEventListener('click',show);return {show};
}
