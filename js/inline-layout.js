import { parseInline } from './inline.js';
import { emojiKey, emojiURL, EMOJI_WIDTH } from './emoji.js';
/** Source offsets remain Fountain offsets, even when emphasis delimiters are hidden. */
export function inlineUnits(source) {
 const units=[];let at=0;
 function walk(nodes,style={}) {for(const node of nodes){
  if(node.children){const marker={bold:'**',italic:'*',boldItalic:'***',underline:'_'}[node.type];
   at+=marker.length;walk(node.children,{...style,...(node.type==='boldItalic'?{bold:true,italic:true}:{[node.type]:true})});at+=marker.length;
  }else if(['note','boneyard'].includes(node.type)) {const length=node.text.length+4;units.push({text:source.slice(at,at+length),raw:true,start:at,end:at+length,...style});at+=length;}
  else for(const char of node.text){const start=at;if(source[at]==='\\'&&/[\\*_\[\]]/.test(source[at+1]??''))at++;at+=char.length;units.push({text:char,start,end:at,...style});}
 }}walk(parseInline(source));return units;
}
export const inlinePlain = text => inlineUnits(text).filter(u=>!u.raw).map(u=>u.text).join('');
export function serializeUnits(units) {
 let source='',stack=[];const offsets=[],ends=[];
 const keys=['bold','italic','underline'],marker={bold:'**',italic:'*',underline:'_'};
 const following=[];let next=null,previousWord=null;for(let i=units.length-1;i>=0;i--){following[i]=next;if(units[i].text.trim())next=units[i];}
 for(let i=0;i<units.length;i++){
  const unit=units[i];let desired=keys.filter(key=>unit[key]);
  // Fountain emphasis cannot open/close on whitespace. Keep boundary whitespace outside.
  if(unit.text.includes('\n'))desired=[];
  else if(!unit.text.trim())desired=desired.filter(key=>previousWord?.[key]&&following[i]?.[key]);
  let common=0;while(common<stack.length&&stack[common]===desired[common])common++;
  for(let j=stack.length-1;j>=common;j--)source+=marker[stack[j]];
  for(let j=common;j<desired.length;j++)source+=marker[desired[j]];
  stack=desired;offsets.push(source.length);if(unit.text.trim())previousWord=unit;
  source+=unit.raw?unit.text:unit.text.replace(/[\\*_\[\]]/g,'\\$&');ends.push(source.length);
 }
 offsets.push(source.length);for(let j=stack.length-1;j>=0;j--)source+=marker[stack[j]];
 return {source,offsets,ends};
}
export function toggleInline(source,start,end,style) {
 const units=inlineUnits(source);const a=units.findIndex(u=>u.end>start), b=units.findIndex(u=>u.start>=end);
 const from=a<0?units.length:a,to=b<0?units.length:b;
 const selected=units.slice(from,to).filter(u=>!u.raw&&u.text.trim());const enabled=!selected.length||!selected.every(u=>u[style]);
 for(let i=from;i<to;i++)if(!units[i].raw)units[i][style]=enabled;
 const result=serializeUnits(units);return{text:result.source,start:result.offsets[from],end:to>from?result.ends[to-1]:result.offsets[to]};
}
export function insertInline(source,start,end,text,styles) {
 const units=inlineUnits(source),a=units.findIndex(u=>u.end>start),b=units.findIndex(u=>u.start>=end);
 const from=a<0?units.length:a,to=b<0?units.length:b;
 const active=styles??units[from]??units[from-1]??{};
 const inserted=[...text].map(text=>({text,bold:active.bold,italic:active.italic,underline:active.underline}));
 units.splice(from,to-from,...inserted);const result=serializeUnits(units);return{text:result.source,offset:inserted.length?result.ends[from+inserted.length-1]:result.offsets[from]};
}
/** Preserve source characters in hidden nodes; DOM/model offsets and copy remain lossless. */
export function renderInline(host,source,start=0,end=source.length,{plain=false,styles=null}={}) {
 const units=styles?(()=>{let at=0;return [...source].map(text=>{const start=at;at+=text.length;return{...styles.find(s=>start>=s.start&&start<s.end),text,start,end:at};});})():plain?[...source].map((text,index)=>({text,start:index,end:index+text.length})):inlineUnits(source);
 let at=start, group=[],groupStyle=null;
 const flush=()=>{if(!group.length)return;const span=document.createElement('span');const style=groupStyle;
  if(style.bold)span.style.fontWeight='700';if(style.italic)span.style.fontStyle='italic';if(style.underline)span.style.textDecoration='underline';
  const text=group.map(u=>u.text).join('');
  // Emoji spans retain real Unicode text for native selection, accessibility and IME.
  const segments=[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)];
  if(!style.bold&&!style.italic&&!style.underline&&!segments.some(s=>emojiKey(s.segment))){host.append(document.createTextNode(text));group=[];return;}
  let plainText='';const plainFlush=()=>{if(plainText){span.append(document.createTextNode(plainText));plainText='';}};
  for(const {segment} of segments){const key=emojiKey(segment);if(!key){plainText+=segment;continue;}plainFlush();
   const emoji=document.createElement('span');emoji.className='screenplay-emoji';emoji.style.backgroundImage=`url("${emojiURL(key)}")`;emoji.style.width=`${EMOJI_WIDTH}px`;emoji.textContent=segment;span.append(emoji);
  }plainFlush();host.append(span);group=[];
 };
 const hidden=text=>{flush();if(!text)return;const span=document.createElement('span');span.dataset.inlineMarker='';span.style.display='none';span.textContent=text;host.append(span);};
 for(const u of units){if(u.end<=start||u.start>=end)continue;
  if(u.start>at)hidden(source.slice(at,Math.min(u.start,end)));
  if(u.raw){flush();host.append(document.createTextNode(source.slice(Math.max(start,u.start),Math.min(end,u.end))));at=u.end;continue;}
  const key=JSON.stringify([!!u.bold,!!u.italic,!!u.underline]);if(key!==groupStyle?.key){flush();groupStyle={...u,key};}
  if(u.end-u.start>u.text.length)hidden(source.slice(u.start,u.end-u.text.length));
  group.push(u);at=u.end;
 }flush();if(at<end)hidden(source.slice(at,end));
}
export function textPoint(host,offset) {
 const walker=document.createTreeWalker(host,NodeFilter.SHOW_TEXT);let node,last,remaining=offset;
 while((node=walker.nextNode())){if(!node.parentElement.closest('[data-inline-marker]'))last=node;if(remaining<=node.length&&!node.parentElement.closest('[data-inline-marker]'))return{node,offset:Math.max(0,remaining)};remaining-=node.length;}
 return last?{node:last,offset:last.length}:{node:host,offset:0};
}
