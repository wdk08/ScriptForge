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
