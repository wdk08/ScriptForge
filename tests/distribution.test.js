import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {assertDistributionPolicy} from '../scripts/platform-signing.mjs';
import {createArtifactChecksums} from '../scripts/artifact-checksums.mjs';

test('unsigned publisher policy preserves updater verification and requires Mac ad hoc integrity',async()=>{
 const config=JSON.parse(await readFile('src-tauri/tauri.conf.json')),before=JSON.stringify(config);assert.equal(assertDistributionPolicy(config),true);assert.equal(JSON.stringify(config),before);
 for(const change of [c=>c.bundle.macOS.signingIdentity=null,c=>c.bundle.windows.certificateThumbprint='certificate',c=>c.bundle.windows.signCommand='publisher-tool',c=>c.bundle.createUpdaterArtifacts=false,c=>c.plugins.updater.requireSignedVersion=false]){const copy=structuredClone(config);change(copy);assert.throws(()=>assertDistributionPolicy(copy));}
});
test('installer checksum files describe exact bytes without altering installers or traversing app bundles',async()=>{
 const root=await mkdtemp(join(tmpdir(),'scriptforge-checksums-'));
 try{await mkdir(join(root,'macos'));await mkdir(join(root,'macos/ScriptForge.app'));await writeFile(join(root,'macos/ScriptForge.app/ignored.exe'),'embedded');const files=['Film.dmg','Film.app.tar.gz','Film.exe'];for(const name of files)await writeFile(join(root,name),`artifact: ${name}`);await writeFile(join(root,'Film.exe.sig'),'signature');const results=await createArtifactChecksums(root);assert.equal(results.length,3);
 for(const name of files){const bytes=await readFile(join(root,name));assert.equal(bytes.toString(),`artifact: ${name}`);assert.equal(await readFile(join(root,name+'.sha256'),'utf8'),`${createHash('sha256').update(bytes).digest('hex')}  ${name}\n`);}assert.equal((await createArtifactChecksums(root)).length,3);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('release and validation workflows need only updater secrets and use a native Intel runner',async()=>{
 for(const path of ['.github/workflows/release.yml','.github/workflows/validate-desktop.yml']){const workflow=await readFile(path,'utf8');const secrets=[...workflow.matchAll(/secrets\.([A-Z_]+)/g)].map(m=>m[1]);assert.ok(secrets.includes('TAURI_SIGNING_PRIVATE_KEY'));assert.ok(secrets.includes('TAURI_SIGNING_PRIVATE_KEY_PASSWORD'));assert.ok(secrets.every(name=>['GITHUB_TOKEN','TAURI_SIGNING_PRIVATE_KEY','TAURI_SIGNING_PRIVATE_KEY_PASSWORD'].includes(name)));assert.match(workflow,/runner: macos-15-intel\s+target: x86_64-apple-darwin/);assert.match(workflow,/workflow_dispatch:/);}
 const validation=await readFile('.github/workflows/validate-desktop.yml','utf8');assert.doesNotMatch(validation,/contents: write|gh release|repos\.createRelease|git push/);assert.match(validation,/corresponding-source/);
 const release=await readFile('.github/workflows/release.yml','utf8');assert.match(release,/PUBLISH: \$\{\{ inputs.publish \}\}/);assert.match(release,/if: inputs.publish/);
});
