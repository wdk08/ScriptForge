import {isDesktop} from './desktop.js';
export function releaseInstallers(release){
 if(!release||release.draft||release.prerelease||typeof release.tag_name!=='string')throw new Error('A stable published release is required.');
 const assets=(release.assets??[]).filter(a=>a.state==='uploaded'&&a.size>0);
 const choose=(extension,architecture)=>{
  const matches=assets.filter(a=>extension.test(a.name)&&architecture.test(a.name));
  if(matches.length!==1)throw new Error('Installer downloads could not be identified safely.');
  const url=new URL(matches[0].browser_download_url);
  if(url.origin!=='https://github.com'||!url.pathname.startsWith('/wdk08/ScriptForge/releases/download/')||url.username||url.password||url.search||url.hash)throw new Error('Unexpected installer download location.');
  return url.href;
 };
 return {macArm:choose(/\.dmg$/i,/(?:^|[_\s.-])(?:aarch64|arm64)(?=[_\s.-]|$)/i),macIntel:choose(/\.dmg$/i,/(?:^|[_\s.-])(?:x64|x86_64|amd64)(?=[_\s.-]|$)/i),windows:choose(/\.exe$/i,/(?:^|[_\s.-])(?:x64|x86_64|amd64)(?=[_\s.-]|$)/i)};
}
export function setupBrowserFeatures(environment=window){
 if(isDesktop(environment))return;
 const document=environment.document,container=document.querySelector('.header-actions')??document.querySelector('header');if(!container)return;
 const menu=document.createElement('details');menu.className='browser-download';
 const summary=document.createElement('summary');summary.textContent='Download';summary.className='quiet-button';const options=document.createElement('div');options.className='export-options';menu.append(summary,options);container.append(menu);
 let busy=false,loaded=false;
 menu.addEventListener('toggle',async()=>{if(!menu.open||busy||loaded)return;busy=true;options.textContent='Loading downloads…';
  try{
   const response=await environment.fetch('https://api.github.com/repos/wdk08/ScriptForge/releases/latest',{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw new Error('GitHub downloads are temporarily unavailable.');
   const links=releaseInstallers(await response.json());options.replaceChildren();
   for(const [key,label] of [['macArm','macOS — Apple Silicon'],['macIntel','macOS — Intel'],['windows','Windows — x64']]){const a=document.createElement('a');a.textContent=label;a.href=links[key];a.rel='noopener';options.append(a);}loaded=true;
  }catch(error){options.replaceChildren();const text=document.createElement('p');text.textContent=`${error.message} Close and reopen Download to retry.`;const a=document.createElement('a');a.textContent='View published releases';a.href='https://github.com/wdk08/ScriptForge/releases';a.target='_blank';a.rel='noopener';options.append(text,a);}finally{busy=false;}
 });
 const notice=document.createElement('p');notice.className='browser-storage-note';notice.textContent='Browser recovery stays in this browser on this device. Clearing website data can erase it. Export Fountain files for separate backups; browser storage does not sync between devices.';
 const footer=document.querySelector('.library-footer');
 if(footer)footer.append(notice);else{const label=document.querySelector('.session-note');if(label){label.textContent='Browser recovery · Export for backup';label.title=notice.textContent;}}
 // This asks for persistence without any directory picker or recurring file dialogs.
 void environment.navigator.storage?.persist?.().catch(()=>{});
}
