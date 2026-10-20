// Copyright (C) 2026 wdk08. SPDX-License-Identifier: GPL-3.0-only
import {readFile,writeFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,basename,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifySourceTree} from './source-release.mjs';
import {validateManifest} from './validate-update-manifest.mjs';
export async function sha256(file){const hash=createHash('sha256');for await(const part of createReadStream(file))hash.update(part);return hash.digest('hex');}
export async function verifiedFile(file){
 const checksum=(await readFile(`${file}.sha256`,'utf8')).trim();
 if(checksum!==`${await sha256(file)}  ${basename(file)}`)throw new Error(`Artifact checksum mismatch: ${file}`);
}
async function walk(dir){const files=[];for(const item of await readdir(dir,{withFileTypes:true})){const file=join(dir,item.name);if(item.isDirectory())files.push(...await walk(file));else if(item.isFile())files.push(file);else throw new Error('Unexpected artifact entry.');}return files;}
export async function prepareArtifacts(input,output,{version,commit,notes}){
 await mkdir(output,{recursive:true});const uploads=[];const platforms={};
 for(const [target,platform,suffix] of [['aarch64-apple-darwin','darwin-aarch64','aarch64'],['x86_64-apple-darwin','darwin-x86_64','x64'],['x86_64-pc-windows-msvc','windows-x86_64','x64']]){
  const files=await walk(join(input,`installers-${target}`)),binaries=files.filter(f=>/\.(?:dmg|exe)$|\.app\.tar\.gz$/.test(f));
  const mac=target.endsWith('darwin');
  if(binaries.length!==(mac?2:1)||binaries.filter(f=>mac?f.endsWith('.app.tar.gz'):f.endsWith('.exe')).length!==1|| (mac&&binaries.filter(f=>f.endsWith('.dmg')).length!==1))throw new Error(`Missing/extra binaries for ${target}`);
  for(const file of binaries){
   await verifiedFile(file);
   const name=file.endsWith('.app.tar.gz')?`ScriptForge_${version}_${suffix}.app.tar.gz`:basename(file);
   if(!name.includes(version)||uploads.includes(name))throw new Error('Wrong version or duplicate asset.');
   await copyFile(file,join(output,name));await writeFile(join(output,`${name}.sha256`),`${await sha256(file)}  ${name}\n`);uploads.push(name,`${name}.sha256`);
   if(file.endsWith('.app.tar.gz')||file.endsWith('.exe')){
    const signature=(await readFile(`${file}.sig`,'utf8')).trim();await copyFile(`${file}.sig`,join(output,`${name}.sig`));uploads.push(`${name}.sig`);
    platforms[platform]={signature,url:`https://github.com/wdk08/ScriptForge/releases/download/v${version}/${name}`};
   }
  }
 }
 const name=`ScriptForge-${version}-source.tar.gz`,archive=join(input,'corresponding-source',name);await verifiedFile(archive);
 const unpacked=join(output,'source-verification');await mkdir(unpacked,{recursive:true});execFileSync('tar',['-xzf',archive,'-C',unpacked]);
 const manifest=await verifySourceTree(join(unpacked,`ScriptForge-${version}-source`));
 if(manifest.baseCommit!==commit||manifest.workingTreeChanges||manifest.version!==version)throw new Error('Source does not match the exact clean validated app commit.');
 for(const suffix of ['', '.sha256'])await copyFile(`${archive}${suffix}`,join(output,`${name}${suffix}`));
 const latest={version,notes,pub_date:new Date().toISOString(),platforms};validateManifest(latest,version);
 await writeFile(join(output,'latest.json'),JSON.stringify(latest,null,2)+'\n');
 const plan={commit,version,source:[name,`${name}.sha256`],packages:uploads,metadata:['latest.json']};
 await writeFile(join(output,'upload-plan.json'),JSON.stringify(plan,null,2)+'\n');return plan;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const version=process.env.RELEASE_VERSION,commit=process.env.APP_COMMIT;
 if(version!=='1.0.1'||commit!=='a25cc9dcc89a8acf0301fa303a324e94a3413942')throw new Error('This recovery is restricted to the already validated v1.0.1 commit.');
 console.log(await prepareArtifacts(resolve(process.argv[2]),resolve(process.argv[3]),{version,commit,notes:await readFile('releases/v1.0.1.md','utf8')}));
}
