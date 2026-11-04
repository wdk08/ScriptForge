import { emojiKey, EMOJI_WIDTH } from './emoji.js';
import {hasGlyph, needsUnicodeFont, unsupportedCharacters, UNICODE_SCALE, graphemes} from './unicode-fonts.js';
/** Validate before generating any pages, including title metadata and hidden unsupported glyphs. */
export function validatePDFCharacters(doc, title) {
 const locations=doc.elements.map((el,index)=>({text:el.text,label:`${el.type}${el.key ? ` (${el.key})` : ''} element ${index+1} [${el.id}]`,bold:el.type==='scene'&&doc.settings?.boldSceneHeadings===true}));
 locations.push(...Object.entries(title).map(([key,text])=>({text,label:`title-page ${key}`})));
 for(const {text,label,bold} of locations){
  const missing=unsupportedCharacters(text,bold)[0];if(!missing)continue;
  const before=text.slice(0,missing.offset),line=before.split('\n').length,column=[...before.split('\n').at(-1)].length+1;
  throw new Error(`Unsupported PDF character ${JSON.stringify(missing.char)} (${missing.codePoint}) in ${label}, line ${line}, column ${column}. The bundled fonts cannot render it; the screenplay and Fountain text have not been changed.`);
 }
}
export function pdfTextWriter(pdf, emojiImages=new Map()) {
 const font=(family,bold=false,italic=false)=>{pdf.setFont(family==='unicode'?'ScriptForgeUnicode':'CourierPrime',italic?(bold?'bolditalic':'italic'):(bold?'bold':'normal'));pdf.setFontSize(12*(family==='unicode'?UNICODE_SCALE:1));};
 const preferred=(text,bold)=>needsUnicodeFont(text,bold)?'unicode':'courier';
 function runs(text,family,bold,italic,styles=[]){
  let offset=0;
  const out=[];
  for(const cluster of graphemes(text)){
   const style=styles.find(s=>offset>=s.start&&offset<s.end)??{};offset+=cluster.length;const strong=bold||!!style.bold,slant=italic||!!style.italic;const emoji=emojiKey(cluster);
   const chosen=[...cluster].every(c=>hasGlyph(family,c,bold))?family:(family==='unicode'?'courier':'unicode');
   const combining=/\p{M}/u.test(cluster);
   if(out.at(-1)?.family===chosen&&!emoji&&!out.at(-1).emoji&&strong===out.at(-1).bold&&slant===out.at(-1).italic&&!combining&&!out.at(-1).combining)out.at(-1).text+=cluster;
   else out.push({family:chosen,text:cluster,combining,count:0,emoji,bold:strong,italic:slant});
   out.at(-1).count++;
  }
  return out;
 }
 function draw(text,x,y,{align='left',baseline='alphabetic',tracking=0,bold=false,italic=false,family,styles=[]}={}){
  if(Array.isArray(text)){const chosen=family??preferred(text.join('\n'),bold);text.forEach((line,i)=>draw(line,x,y+i*15,{align,baseline,tracking,bold,family:chosen}));return;}
  if(!text)return;
  const parts=runs(text,family??preferred(text,bold),bold,italic,styles);
  if(parts.length===1&&!parts[0].combining&&!parts[0].emoji){font(parts[0].family,parts[0].bold,parts[0].italic);pdf.setCharSpace(tracking);pdf.text(text,x,y,{align,baseline});return;}
  for(const part of parts){
   font(part.family,part.bold,part.italic);pdf.setCharSpace(0);
   part.width=part.emoji?EMOJI_WIDTH*.75-tracking:part.combining?[...part.text].reduce((sum,char)=>{
    if(/\p{M}/u.test(char))return sum;
    font(hasGlyph(part.family,char,bold)?part.family:(part.family==='unicode'?'courier':'unicode'),bold);
    return sum+pdf.getTextWidth(char);
   },0):pdf.getTextWidth(part.text)+tracking*(part.count-1);
  }
  const width=parts.reduce((sum,r)=>sum+r.width,0)+tracking*Math.max(0,parts.length-1);
  let left=x-(align==='right'?width:align==='center'?width/2:0);
  for(const part of parts){
   font(part.family,part.bold,part.italic);pdf.setCharSpace(part.combining?0:tracking);
   if(part.emoji){
    const image=emojiImages.get(part.emoji);if(!image)throw new Error(`Emoji artwork could not load: ${part.text}`);
    const logical='FEFF'+part.text.split('').map(c=>c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
    pdf.internal.write(`/Span << /ActualText <${logical}> >> BDC`);
    const top=baseline==='top'?y:y-9;
    font('courier');pdf.setCharSpace(0);pdf.text(' ',left,y,{baseline,renderingMode:'invisible'});
    pdf.addImage(image,'PNG',left+(part.width-10.5)/2,top,10.5,10.5,part.emoji,'FAST');
    pdf.internal.write('EMC');
   }else if(part.combining){
    const logical='FEFF'+part.text.split('').map(c=>c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
    pdf.internal.write(`/Span << /ActualText <${logical}> >> BDC`);
    let position=left,anchor=left;
    for(const char of part.text){font(hasGlyph(part.family,char,bold)?part.family:(part.family==='unicode'?'courier':'unicode'),part.bold,part.italic);if(/\p{M}/u.test(char))pdf.text(char,anchor,y,{align:'left',baseline});else{anchor=position;pdf.text(char,position,y,{align:'left',baseline});position+=pdf.getTextWidth(char);}}
    pdf.internal.write('EMC');
   }else pdf.text(part.text,left,y,{align:'left',baseline});
   left+=part.width+tracking;
  }
 }
 function wrap(text,width){
  font(preferred(text,false));pdf.setCharSpace(0);
  if(!graphemes(text).some(emojiKey))return pdf.splitTextToSize(text,width);
  const length=value=>graphemes(value).reduce((sum,cluster)=>{const key=emojiKey(cluster);if(key)return sum+EMOJI_WIDTH*.75;font(preferred(cluster,false));return sum+pdf.getTextWidth(cluster);},0);
  const lines=[];
  for(const paragraph of text.split('\n')){let line='';for(const word of paragraph.match(/\s+|\S+/g)??[]){
    if(line&&length(line+word)>width){lines.push(line.trimEnd());line='';}
    for(const cluster of graphemes(word)){if(line&&length(line+cluster)>width){lines.push(line);line='';}if(line||cluster.trim())line+=cluster;}
   }lines.push(line);
  }return lines;
 }
 return {draw,wrap};
}
