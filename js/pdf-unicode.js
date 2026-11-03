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
export function pdfTextWriter(pdf) {
 const font=(family,bold=false)=>{pdf.setFont(family==='unicode'?'ScriptForgeUnicode':'CourierPrime',bold?'bold':'normal');pdf.setFontSize(12*(family==='unicode'?UNICODE_SCALE:1));};
 const preferred=(text,bold)=>needsUnicodeFont(text,bold)?'unicode':'courier';
 function runs(text,family,bold){
  const out=[];
  for(const cluster of graphemes(text)){
   const chosen=[...cluster].every(c=>hasGlyph(family,c,bold))?family:(family==='unicode'?'courier':'unicode');
   const combining=/\p{M}/u.test(cluster);
   if(out.at(-1)?.family===chosen&&!combining&&!out.at(-1).combining)out.at(-1).text+=cluster;
   else out.push({family:chosen,text:cluster,combining,count:0});
   out.at(-1).count++;
  }
  return out;
 }
 function draw(text,x,y,{align='left',baseline='alphabetic',tracking=0,bold=false,family}={}){
  if(Array.isArray(text)){const chosen=family??preferred(text.join('\n'),bold);text.forEach((line,i)=>draw(line,x,y+i*15,{align,baseline,tracking,bold,family:chosen}));return;}
  if(!text)return;
  const parts=runs(text,family??preferred(text,bold),bold);
  if(parts.length===1&&!parts[0].combining){font(parts[0].family,bold);pdf.setCharSpace(tracking);pdf.text(text,x,y,{align,baseline});return;}
  for(const part of parts){
   font(part.family,bold);pdf.setCharSpace(0);
   part.width=part.combining?[...part.text].reduce((sum,char)=>{
    if(/\p{M}/u.test(char))return sum;
    font(hasGlyph(part.family,char,bold)?part.family:(part.family==='unicode'?'courier':'unicode'),bold);
    return sum+pdf.getTextWidth(char);
   },0):pdf.getTextWidth(part.text)+tracking*(part.count-1);
  }
  const width=parts.reduce((sum,r)=>sum+r.width,0)+tracking*Math.max(0,parts.length-1);
  let left=x-(align==='right'?width:align==='center'?width/2:0);
  for(const part of parts){
   font(part.family,bold);pdf.setCharSpace(part.combining?0:tracking);
   if(part.combining){
    const logical='FEFF'+part.text.split('').map(c=>c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
    pdf.internal.write(`/Span << /ActualText <${logical}> >> BDC`);
    let position=left,anchor=left;
    for(const char of part.text){font(hasGlyph(part.family,char,bold)?part.family:(part.family==='unicode'?'courier':'unicode'),bold);if(/\p{M}/u.test(char))pdf.text(char,anchor,y,{align:'left',baseline});else{anchor=position;pdf.text(char,position,y,{align:'left',baseline});position+=pdf.getTextWidth(char);}}
    pdf.internal.write('EMC');
   }else pdf.text(part.text,left,y,{align:'left',baseline});
   left+=part.width+tracking;
  }
 }
 function wrap(text,width){font(preferred(text,false));pdf.setCharSpace(0);return pdf.splitTextToSize(text,width);}
 return {draw,wrap};
}
