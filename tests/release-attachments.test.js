// Copyright (C) 2026 wdk08. SPDX-License-Identifier: GPL-3.0-only
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import api from '../scripts/release-attachments.cjs';
import {prepareArtifacts,sha256} from '../scripts/prepare-verified-release.mjs';
const commit='a25cc9dcc89a8acf0301fa303a324e94a3413942',repo={owner:'wdk08',repo:'ScriptForge'};
const draft={id:42,tag_name:'v1.0.1',name:'ScriptForge v1.0.1',draft:true,prerelease:false,target_commitish:commit};
function mock(initial=draft,{denied=false,missing=false,tagExists=false}={}){
 let release={...initial};const calls=[];
 const repos={listReleases:()=>{},getRelease:async()=>{if(missing)throw Object.assign(Error('not found'),{status:404});return {data:release}},
  updateRelease:async args=>{calls.push(['patch',args]);release={...release,...args};return {data:release}},
  uploadReleaseAsset:async args=>{if(denied)throw Object.assign(Error('forbidden'),{status:403});calls.push(['upload',args]);return {data:{id:99,name:args.name,size:args.data.length,state:'uploaded'}}},
  deleteReleaseAsset:async args=>calls.push(['delete',args])};
 return {calls,github:{paginate:async()=>[release],rest:{repos,git:{getRef:async()=>{if(tagExists)return {};throw Object.assign(Error('not found'),{status:404})}}}}};
}
test('repairs an untagged draft with an explicit tag, then reads back its identity',async()=>{
 const m=mock({...draft,tag_name:'untagged-placeholder'});assert.equal((await api.ensureDraft(m.github,repo,{version:'1.0.1',commit,refresh:true})).tag_name,'v1.0.1');assert.equal(m.calls[0][1].tag_name,'v1.0.1');
});
for(const [name,release,options] of [['published',{...draft,draft:false},{}],['no approval',draft,{refresh:false}],['existing tag',draft,{tagExists:true}],['inaccessible',draft,{missing:true}]])test(`preflight refuses ${name}`,async()=>{
 const m=mock(release,options);await assert.rejects(api.ensureDraft(m.github,repo,{version:'1.0.1',commit,refresh:options.refresh!==false}));assert.ok(!m.calls.some(c=>c[0]==='upload'));
});
test('permission probe uploads by numeric ID and cleans up; missing write permission fails immediately',async()=>{
 const m=mock();await api.probeAttachment(m.github,repo,draft,'1.0.1','test');assert.deepEqual(m.calls.map(c=>c[0]),['upload','delete']);assert.equal(m.calls[0][1].release_id,42);
 await assert.rejects(api.probeAttachment(mock(draft,{denied:true}).github,repo,draft,'1.0.1','denied'));
});
test('source attachment uses release ID and rejects wrong tag/commit before upload',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'scriptforge-upload-test-')),file=join(dir,'source.tar.gz');await writeFile(file,'source');
 const m=mock();await api.uploadFiles(m.github,repo,{id:42,version:'1.0.1',commit,files:[file]});assert.equal(m.calls[0][1].release_id,42);
 for(const release of [{...draft,tag_name:'untagged-placeholder'},{...draft,target_commitish:'b'.repeat(40)},{...draft,draft:false}])await assert.rejects(api.uploadFiles(mock(release).github,repo,{id:42,version:'1.0.1',commit,files:[file]}));
});
const jobNames=['validation / source','review','validation / build (macos-15, aarch64-apple-darwin, arm64, dmg,app)','validation / build (macos-15-intel, x86_64-apple-darwin, x86_64, dmg,app)','validation / build (windows-latest, x86_64-pc-windows-msvc, nsis)'];
const jobs=jobNames.map(name=>({name,conclusion:'success',steps:['Verify actual updater artifact signatures and versions','Real installed-app update and restart using signed production bytes'].map(name=>({name,conclusion:'success'}))}));
const run={workflow_id:1,head_sha:commit,head_branch:'main',event:'workflow_dispatch',status:'completed'};
test('reuse requires exact commit, all platforms and actual signature/update proofs despite the later attachment failure',()=>{
 api.verifyRun(run,jobs,1,commit);
 assert.throws(()=>api.verifyRun({...run,head_sha:'b'.repeat(40)},jobs,1,commit));
 assert.throws(()=>api.verifyRun(run,jobs.slice(0,-1),1,commit));
 assert.throws(()=>api.verifyRun(run,jobs.map((j,i)=>i===2?{...j,steps:[]}:j),1,commit));
});
test('workflow dependencies gate expensive validation and source attaches before publication builds',async()=>{
 const yaml=await readFile('.github/workflows/release.yml','utf8');
 assert.match(yaml,/validation:\n    needs: preflight/);assert.match(yaml,/review:\n    needs: validation/);assert.match(yaml,/source:\n    needs: draft/);assert.match(yaml,/build:\n    needs: \[draft, source\]/);
 assert.match(yaml,/const options = .*tag_name:tag/);assert.match(yaml,/api\.probeAttachment/);assert.match(yaml,/\.uploadFiles\(github, context.repo/);
 assert.doesNotMatch(yaml,/gh release upload.*source\.tar/);
 assert.ok(yaml.indexOf('manifestApi.bindManifestToAssets')<yaml.indexOf('name: Publish only after explicit dispatch approval'));
 const recovery=await readFile('.github/workflows/resume-v1.0.1.yml','utf8');
 assert.match(recovery,/manifestApi\.bindManifestToAssets/);
 assert.ok(recovery.indexOf('manifestApi.bindManifestToAssets')<recovery.indexOf('name: Publish only the exact verified v1.0.1 draft'));
 assert.match(recovery,/reuse:true,replaceMetadata:true/);
 assert.doesNotMatch(recovery,/for\(const asset of old\)/);
});
test('verified artifacts preserve bytes, unique platform names, source commit and signed-version metadata; mismatched hashes abort',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'scriptforge-artifact-test-')),input=join(dir,'input'),output=join(dir,'output');
 async function file(path,text){await mkdir(join(path,'..'),{recursive:true});await writeFile(path,text);}
 async function checked(path,text){await file(path,text);await writeFile(`${path}.sha256`,`${await sha256(path)}  ${path.split('/').at(-1)}\n`);}
 const signature=Buffer.from('untrusted comment: test\nabc\ntrusted comment: timestamp:1\tversion:1.0.1\nxyz\n').toString('base64');
 for(const target of ['aarch64-apple-darwin','x86_64-apple-darwin','x86_64-pc-windows-msvc']){
  const folder=join(input,`installers-${target}`),name=target.endsWith('darwin')?'ScriptForge.app.tar.gz':'ScriptForge_1.0.1_x64-setup.exe';
  await checked(join(folder,name),target);await file(join(folder,`${name}.sig`),signature);
  if(target.endsWith('darwin'))await checked(join(folder,`ScriptForge_1.0.1_${target}.dmg`),'dmg');
 }
 const root=join(dir,'ScriptForge-1.0.1-source'),files=[];
 for(const path of ['LICENSE','COPYRIGHT','THIRD_PARTY_NOTICES.md','SOURCE_CODE.md','scripts/build-piper.mjs','vendor/piper/provenance.json']){
  await file(join(root,'app',path),'fixture');files.push({path:`app/${path}`,sha256:createHash('sha256').update('fixture').digest('hex')});
 }
 await file(join(root,'app/.cargo/config.toml'),'../dependencies/cargo');
 await file(join(root,'SOURCE-MANIFEST.json'),JSON.stringify({version:'1.0.1',baseCommit:commit,workingTreeChanges:false,files}));
 const archive=join(input,'corresponding-source/ScriptForge-1.0.1-source.tar.gz');await mkdir(join(archive,'..'),{recursive:true});execFileSync('tar',['-czf',archive,'-C',dir,'ScriptForge-1.0.1-source']);await writeFile(`${archive}.sha256`,`${await sha256(archive)}  ScriptForge-1.0.1-source.tar.gz\n`);
 const plan=await prepareArtifacts(input,output,{version:'1.0.1',commit,notes:'test'});assert.equal(plan.packages.length,13);assert.equal(new Set(plan.packages).size,13);
 assert.equal(await readFile(join(output,'ScriptForge_1.0.1_aarch64.app.tar.gz'),'utf8'),'aarch64-apple-darwin');
 await assert.rejects(prepareArtifacts(input,join(dir,'wrong-commit'),{version:'1.0.1',commit:'b'.repeat(40),notes:'test'}),/Source does not match/);
 await writeFile(join(input,'installers-aarch64-apple-darwin/ScriptForge.app.tar.gz'),'corrupt');
 await assert.rejects(prepareArtifacts(input,join(dir,'corrupt'),{version:'1.0.1',commit,notes:'test'}),/checksum mismatch/);
});

test('all three updater platforms bind to exact asset IDs despite draft untagged browser URLs',async()=>{
 const {bindManifestToAssets,validateManifest}=await import('../scripts/validate-update-manifest.mjs');
 const signature=Buffer.from('untrusted comment: fixture\nabc\ntrusted comment: timestamp:1\tversion:1.0.1\nxyz\n').toString('base64');
 const names=['ScriptForge_1.0.1_aarch64.app.tar.gz','ScriptForge_1.0.1_x64.app.tar.gz','ScriptForge_1.0.1_x64-setup.exe'];
 const platforms=['darwin-aarch64','darwin-x86_64','windows-x86_64'];
 const assets=names.map((name,i)=>({id:100+i,name,size:10,state:'uploaded',browser_download_url:`https://github.com/wdk08/ScriptForge/releases/download/untagged-532e2021a2b8a2654f1c/${name}`}));
 const manifest={version:'1.0.1',notes:'test',pub_date:new Date().toISOString(),platforms:Object.fromEntries(platforms.map((p,i)=>[p,{signature,url:`https://github.com/wdk08/ScriptForge/releases/download/v1.0.1/${names[i]}`}]))};
 assert.throws(()=>validateManifest(manifest,'1.0.1',assets),/Missing release asset: darwin-aarch64/);
 const before=structuredClone(manifest),bound=bindManifestToAssets(manifest,'1.0.1',assets);
 assert.deepEqual(manifest,before);assert.equal(validateManifest(bound,'1.0.1',assets),true);
 for(const [i,platform] of platforms.entries()){
  assert.equal(bound.platforms[platform].url,`https://api.github.com/repos/wdk08/ScriptForge/releases/assets/${100+i}`);
  assert.equal(bound.platforms[platform].signature,manifest.platforms[platform].signature);
  const provisional=structuredClone(manifest);provisional.platforms[platform].url=assets[i].browser_download_url;
  assert.equal(bindManifestToAssets(provisional,'1.0.1',assets).platforms[platform].url,bound.platforms[platform].url);
  assert.throws(()=>bindManifestToAssets(manifest,'1.0.1',assets.filter(a=>a.id!==100+i)),/Missing or ambiguous/);
  const wrongRepo=structuredClone(manifest);wrongRepo.platforms[platform].url=wrongRepo.platforms[platform].url.replace('wdk08/ScriptForge','other/project');
  assert.throws(()=>bindManifestToAssets(wrongRepo,'1.0.1',assets),/Missing or ambiguous/);
 }
 const swapped=structuredClone(manifest);swapped.platforms['darwin-aarch64'].url=manifest.platforms['darwin-x86_64'].url;
 assert.throws(()=>bindManifestToAssets(swapped,'1.0.1',assets),/Incorrect uploaded platform asset/);
 assert.throws(()=>bindManifestToAssets(manifest,'1.0.1',[...assets,assets[0]]),/ambiguous/);
 assert.throws(()=>bindManifestToAssets(manifest,'1.0.1',assets.map(a=>({...a,size:0}))),/Incorrect uploaded/);
 assert.throws(()=>bindManifestToAssets(manifest,'1.0.2',assets),/version/);
 const invalidSignature=structuredClone(manifest);invalidSignature.platforms['windows-x86_64'].signature='invalid';
 assert.throws(()=>bindManifestToAssets(invalidSignature,'1.0.1',assets),/signature/);
});

test('retry reuses only identical uploaded bytes and replaces only latest.json metadata',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'scriptforge-reuse-test-')),file=join(dir,'source.tar.gz');await writeFile(file,'source');
 const existing={id:7,name:'source.tar.gz',size:6,digest:`sha256:${createHash('sha256').update('source').digest('hex')}`,state:'uploaded'};
 const m=mock();m.github.rest.repos.listReleaseAssets=()=>{};m.github.paginate=async()=>[existing];
 await api.uploadFiles(m.github,repo,{id:42,version:'1.0.1',commit,files:[file],reuse:true});assert.deepEqual(m.calls,[]);
 await writeFile(file,'changed');await assert.rejects(api.uploadFiles(m.github,repo,{id:42,version:'1.0.1',commit,files:[file],reuse:true,replaceMetadata:true}),/bytes differ/);assert.deepEqual(m.calls,[]);
 const latest=join(dir,'latest.json');await writeFile(latest,'new metadata');m.github.paginate=async()=>[{...existing,name:'latest.json'}];
 await api.uploadFiles(m.github,repo,{id:42,version:'1.0.1',commit,files:[latest],reuse:true,replaceMetadata:true});assert.deepEqual(m.calls.map(c=>c[0]),['delete','upload']);
});
