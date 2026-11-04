// Shared actual-UI proof: injected by Playwright or the opt-in native Dev check.
// Never runs on ordinary startup and requires an explicit isolated test harness.
globalThis.scriptForgeEmojiFixture=async()=>{
 if(!globalThis.scriptForgeDev&&!globalThis.scriptForgeEmojiTest)throw Error('Emoji UI proof requires isolated Dev');
 const{createDocument,createElement:e}=await import('/js/document.js'),{repository}=await import('/js/storage.js'),{draftRecord}=await import('/js/session.js');
 const target=e('action','Before after.'),doc=createDocument({title:'Dev emoji regression',elements:[...Array.from({length:100},(_,i)=>e('action',`Synthetic paragraph ${i}. A story continues.`)),target,...Array.from({length:100},(_,i)=>e('action',`Following paragraph ${i}. The story continues.`))]});
 const r=draftRecord(doc);r.recovery.dirty=false;await repository.put(r);return{id:doc.id,target:target.id,text:target.text};
};
globalThis.scriptForgeEmojiProof=async fixture=>{
 if(!globalThis.scriptForgeDev&&!globalThis.scriptForgeEmojiTest)throw Error('Emoji UI proof requires isolated Dev');
 const root=document.getElementById('pages'),viewport=root.closest('.document-viewport');
 const{restoreSelection,readSelection,visualClickCaret}=await import('/js/selection.js'),{caret}=await import('/js/editing.js');
 const{fountainForSaving}=await import('/js/session.js'),{parseFountain}=await import('/js/fountain.js');
 const assert=(value,message)=>{if(!value)throw Error(message);};
 const el=()=>window.scriptForge.getDocument().elements.find(e=>e.id===fixture.target);
 const select=(start,end=start)=>restoreSelection(root,{anchor:{id:fixture.target,offset:start},focus:{id:fixture.target,offset:end}},{scroll:true});
 const input=(inputType,data)=>root.dispatchEvent(new InputEvent('beforeinput',{inputType,data,bubbles:true,cancelable:true}));
 const key=(value,shift=false)=>root.dispatchEvent(new KeyboardEvent('keydown',{key:value,ctrlKey:true,shiftKey:shift,bubbles:true,cancelable:true}));
 const pause=()=>new Promise(r=>setTimeout(r,20));
 let cases=0;const emojis=['😘','😀','👍🏽','🇺🇸','❤️','👩🏽‍💻','👨‍👩‍👧‍👦','1️⃣','🏳️‍🌈'];
 for(const emoji of emojis)for(const at of [0,7,fixture.text.length])for(const mode of ['insert','paste','composition']){
  select(at);const before=viewport.scrollTop,source=JSON.stringify(window.scriptForge.getDocument());assert(before>1000,'Fixture must test a real writing location far from document top');
  if(mode==='paste'){const data=new DataTransfer();data.setData('text/plain',emoji);root.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));}
  else if(mode==='composition'){root.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));root.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertCompositionText',data:emoji,isComposing:true,bubbles:true,cancelable:true}));root.dispatchEvent(new CompositionEvent('compositionend',{data:emoji,bubbles:true}));input('insertFromComposition',emoji);await pause();}
  else input('insertText',emoji);
  assert(el().text===fixture.text.slice(0,at)+emoji+fixture.text.slice(at),'Emoji content/UTF-16 offsets changed: '+emoji+' '+mode);
  assert(readSelection(root).focus.offset===at+emoji.length,'Caret must immediately follow the complete grapheme');
  const selection=getSelection(),range=selection.getRangeAt(0),rect=range.getBoundingClientRect();assert(rect.height>0,'Caret has zero height after emoji');
  assert(Math.abs(viewport.scrollTop-before)<2,'Emoji unexpectedly scrolled the screenplay');
  const span=[...root.querySelectorAll('.screenplay-emoji')].find(e=>e.closest('[data-element-id]')?.dataset.elementId===fixture.target);
  const style=getComputedStyle(span);assert(style.backgroundImage==='none'&&style.fontSize==='16px'&&style.fontFamily.includes('Apple Color Emoji'),'Editor must use real native emoji text');
  const box=span.getBoundingClientRect();for(const[point,expected]of[[box.left+.5,at],[box.right-.5,at+emoji.length]]){const clicked=visualClickCaret(root,point,box.top+box.height/2);assert(clicked.focus.id===fixture.target&&clicked.focus.offset===expected,'Cannot place cursor beside emoji');}
  input('deleteContentBackward');assert(el().text===fixture.text,'Backspace did not remove one entire emoji');key('z');assert(el().text.includes(emoji),'Undo did not restore emoji');key('z',true);assert(el().text===fixture.text,'Redo did not remove emoji');key('z');
  select(at);input('deleteContentForward');assert(el().text===fixture.text,'Delete did not remove one entire emoji');
  assert(JSON.stringify(window.scriptForge.getDocument())===source,'Editing surrounding document changed unrelated elements');cases++;
 }
 // Wrap and repaginate the active paragraph without losing its identity or writing location.
 select(0,fixture.text.length);input('insertText','Words keep flowing across the page. '.repeat(80));const long=el().text;select(long.length-12);const before=viewport.scrollTop;input('insertText','😘👍🏽');assert(viewport.scrollTop>1000&&Math.abs(viewport.scrollTop-before)<40,'Wrapped/page-boundary insertion jumped away');
 const fragment=root.querySelector(`[data-element-id="${fixture.target}"]`);assert(parseFloat(getComputedStyle(fragment).lineHeight)===16,'Emoji changed screenplay line height');
 assert(window.scriptForge.getPages().every(p=>p.used<=864),'Emoji caused page overflow');
 const doc=window.scriptForge.getDocument(),parsed=parseFountain(fountainForSaving(doc));assert(parsed.elements.filter(e=>e.type==='action').map(e=>e.text).join('\n')===doc.elements.filter(e=>e.type==='action').map(e=>e.text).join('\n'),'Fountain changed emoji content');
 await window.scriptForgeBeforeClose();const{repository}=await import('/js/storage.js');assert(JSON.stringify((await repository.get(doc.id)).recovery.document.elements)===JSON.stringify(doc.elements),'Recovery lost emoji document state');
 return{cases,checks:['Native emoji glyphs with stable screenplay typography','Insertion, paste and composition preserve text, UTF-16 selection and scroll','Both sides of every emoji remain clickable','Backspace/Delete and undo/redo preserve complete graphemes','Wrapped/page-boundary editing and pagination remain stable','Fountain and local recovery preserve exact emoji text'],id:doc.id,target:fixture.target};
};
