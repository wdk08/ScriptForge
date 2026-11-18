// Copyright (C) 2026 wdk08. SPDX-License-Identifier: GPL-3.0-only
// Create a local source release; this script never uploads or reads signing keys.
import {readFile,writeFile,copyFile,mkdir,mkdtemp,cp,lstat,access,rm} from 'node:fs/promises';
import {join,dirname,resolve,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {auditPublic} from './audit-public.mjs';
import {verifyPiper} from './license-inventory.mjs';
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function sourcePathAllowed(file){return !!file&&!file.startsWith('/')&&!file.includes('\\')&&!/^[A-Za-z]:|\0/.test(file)&&!file.split('/').some(part=>part==='..'||part==='.git'||part==='node_modules')&&!/^(?:validation|dist|test-results|recovery|backups|user-data|local-data)\//.test(file)&&!file.startsWith('src-tauri/target/')&&!file.startsWith('src-tauri/gen/')&&(!/(?:^|\/)\.env(?:\.|$)/i.test(file)||file==='.env.example')&&!/\.(?:key|pem|p12|pfx|db|sqlite3?)$/i.test(file);}
export async function verifySourceTree(tree){
 const manifest=JSON.parse(await readFile(join(tree,'SOURCE-MANIFEST.json')));
 for(const item of manifest.files){if(!item.path.startsWith('app/')&&!/^dependencies\/[A-Za-z0-9_.-]+$/.test(item.path))throw new Error('Invalid source manifest path.');if(item.path.startsWith('app/')&&!sourcePathAllowed(item.path.slice(4)))throw new Error('Private path in source manifest.');if(digest(await readFile(join(tree,item.path)))!==item.sha256)throw new Error(`Source snapshot changed: ${item.path}`);}
 for(const file of ['LICENSE','COPYRIGHT','THIRD_PARTY_NOTICES.md','SOURCE_CODE.md','scripts/build-piper.mjs','vendor/piper/provenance.json'])if(!manifest.files.some(item=>item.path===`app/${file}`))throw new Error(`Required source file absent: ${file}`);
 const config=await readFile(join(tree,'app/.cargo/config.toml'),'utf8');if(!config.includes('../dependencies/cargo'))throw new Error('Vendored Cargo source configuration missing.');
 return manifest;
}
export async function snapshotApplication(app){
 const audit=await auditPublic();if(audit.findings.length)throw new Error('Resolve the source audit findings before creating a release archive.');
 await mkdir(app,{recursive:true});const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean),manifest=[];
 for(const file of [...new Set(files)].sort()){if(!sourcePathAllowed(file))throw new Error(`Unsafe source path: ${file}`);const stat=await lstat(file);if(!stat.isFile())throw new Error(`Non-file source entry: ${file}`);const bytes=await readFile(file);await mkdir(dirname(join(app,file)),{recursive:true});await copyFile(file,join(app,file));manifest.push({path:`app/${file}`,sha256:digest(bytes)});}
 return manifest;
}
export async function readUpstreamSource(item, {cacheDir, allowDownload, request=fetch}) {
 let bytes;
 if(cacheDir) {
  try { bytes=await readFile(join(cacheDir,item.file)); }
  catch(error) { if(error.code!=='ENOENT')throw error; }
 }
 if(!bytes) {
  if(!allowDownload)throw new Error(`Missing cached source: ${item.name}`);
  const response=await request(item.url);
  if(item.fallback && [404,410].includes(response.status)) {
   await response.body?.cancel();
   const mirror=await request(item.fallback.url);
   if(!mirror.ok)throw new Error(`Source fallback failed: ${item.name} (HTTP ${mirror.status})`);
   const scratch=await mkdtemp(join(tmpdir(),'scriptforge-upstream-source-'));
   try {
    const archive=join(scratch,'source.tar.gz');
    await pipeline(mirror.body,createWriteStream(archive));
    // Read one entry only. The pinned digest still applies to the original upstream archive.
    bytes=execFileSync('tar',['-xOzf',archive,'--',item.fallback.member],{maxBuffer:256*1024*1024});
   } finally {
    await rm(scratch,{recursive:true,force:true});
   }
  } else {
   if(!response.ok)throw new Error(`Source download failed: ${item.name} (HTTP ${response.status})`);
   bytes=Buffer.from(await response.arrayBuffer());
  }
 }
 if(digest(bytes)!==item.sha256)throw new Error(`Upstream source checksum failed: ${item.name}`);
 return bytes;
}
export async function sourceRelease({cacheDir=process.env.SCRIPTFORGE_SOURCE_CACHE,allowDownload=true}={}){
 await verifyPiper();const audit=await auditPublic();if(audit.findings.length)throw new Error('Resolve the source audit findings before creating a release archive.');
 execFileSync(process.execPath,['scripts/license-inventory.mjs'],{stdio:'inherit'});
 const pkg=JSON.parse(await readFile('package.json')),lock=JSON.parse(await readFile('package-lock.json'));
 const work=await mkdtemp(join(tmpdir(),'scriptforge-source-release-')),name=`ScriptForge-${pkg.version}-source`,tree=join(work,name),app=join(tree,'app');await mkdir(app,{recursive:true});
 const manifest=await snapshotApplication(app);
 const deps=join(tree,'dependencies');await mkdir(deps);const downloads=JSON.parse(await readFile('third-party/source-downloads.json'));
 for(const item of downloads){
  const bytes=await readUpstreamSource(item,{cacheDir,allowDownload});
  await writeFile(join(deps,item.file),bytes);manifest.push({path:`dependencies/${item.file}`,sha256:item.sha256});
 }
 // Cargo vendor retains exact crate sources, MPL notices, registry checksums and licenses.
 const vendor=join(deps,'cargo');const config=execFileSync('cargo',['vendor','--locked','--offline','--versioned-dirs','--manifest-path','src-tauri/Cargo.toml',vendor],{encoding:'utf8',maxBuffer:10_000_000});await mkdir(join(app,'.cargo'),{recursive:true});await writeFile(join(app,'.cargo/config.toml'),config.replaceAll(vendor,'../dependencies/cargo'));
 // Include readable installed npm package sources/notices, not obsolete precompiled
 // runtime packages, general-purpose native build tools, or user-imported weights.
 const omitted=[];for(const path of Object.keys(lock.packages).filter(Boolean)){
  if(path.includes('@tauri-apps/cli-')||path.endsWith('@diffusionstudio/piper-wasm')){omitted.push(path);continue;}
  try{await access(join(path,'package.json'));}catch(error){if(error.code==='ENOENT'){omitted.push(path);continue;}throw error;}
  await cp(path,join(deps,'npm',path.replace(/^node_modules\//,'')),{recursive:true,filter:file=>!(/\.(?:wasm|data|node|exe|dll|so|dylib|onnx|ort)$/i.test(file)||basename(file)==='node_modules')});
 }
 const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty=execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim().length>0;
 await writeFile(join(tree,'SOURCE-MANIFEST.json'),JSON.stringify({schema:1,version:pkg.version,baseCommit:commit,workingTreeChanges:dirty,files:manifest,upstream:downloads,omittedNpm:omitted,omissionReason:'Platform-specific CLI binaries are general build tools; Piper is rebuilt from included sources; runtime binary duplicates are omitted from npm source copies. No voice model is distributed.'},null,2)+'\n');
 await copyFile('docs/SOURCE-BUILD.md',join(tree,'BUILD.md'));
 await verifySourceTree(tree);
 const output=resolve('dist/source');await mkdir(output,{recursive:true});const archive=join(output,`${name}.tar.gz`);execFileSync('tar',['-czf',archive,'-C',work,name]);await writeFile(`${archive}.sha256`,`${digest(await readFile(archive))}  ${basename(archive)}\n`);
 console.log(`Source release prepared locally: ${archive}\nNo upload performed. Source tree: ${tree}`);return {archive,tree};
}
if(process.argv[1]?.endsWith('/source-release.mjs')){const i=process.argv.indexOf('--verify-tree');if(i>=0){const manifest=await verifySourceTree(resolve(process.argv[i+1]));console.log(`Verified source snapshot (${manifest.files.length} files).`);}else await sourceRelease({allowDownload:!process.argv.includes('--offline')});}
