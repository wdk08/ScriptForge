import test from 'node:test';import assert from 'node:assert/strict';
import {releaseInstallers} from '../js/browser-features.js';
import {isDesktop,desktopInvoke} from '../js/desktop.js';
import {buildWeb,validateWeb} from '../scripts/build-web.mjs';
import {readFile} from 'node:fs/promises';
test('official Tauri detection distinguishes desktop without user-agent sniffing',()=>{
 assert.equal(isDesktop({navigator:{userAgent:'Tauri'}}),false);const invoke=()=>{};
 assert.equal(isDesktop({__TAURI__:{core:{isTauri:()=>true,invoke}}}),true);
 assert.equal(desktopInvoke({__TAURI__:{core:{isTauri:()=>false,invoke}}}),null);
});
const asset=name=>({name,size:100,state:'uploaded',browser_download_url:`https://github.com/wdk08/ScriptForge/releases/download/v1.0.1/${name}`});
const release={tag_name:'v1.0.1',draft:false,prerelease:false,assets:['ScriptForge_1.0.1_aarch64.dmg','ScriptForge_1.0.1_x64.dmg','ScriptForge_1.0.1_x64-setup.exe','ScriptForge_1.0.1_aarch64.app.tar.gz','latest.json','ScriptForge_1.0.1_x64-setup.exe.sig'].map(asset)};
test('downloads select published installers by architecture/format, independent of version and updater assets',()=>{
 const links=releaseInstallers(release);assert.match(links.macArm,/aarch64\.dmg$/);assert.match(links.macIntel,/x64\.dmg$/);assert.match(links.windows,/x64-setup\.exe$/);
 const renamed={...release,assets:['New_Name-v9-arm64.dmg','New_Name-v9-x86_64.dmg','New_Name-v9-amd64.exe'].map(asset)};assert.match(releaseInstallers(renamed).macIntel,/x86_64/);
});
test('download selection refuses drafts, prereleases, missing/ambiguous architectures and unexpected hosts',()=>{
 for(const broken of [{...release,draft:true},{...release,prerelease:true},{...release,assets:release.assets.slice(1)},{...release,assets:[...release.assets,asset('Extra_arm64.dmg')]},{...release,assets:release.assets.map(a=>({...a,browser_download_url:'https://example.com/file'}))}])assert.throws(()=>releaseInstallers(broken));
});
test('production web output is static, path-relative and excludes native binaries, credentials and user data',async()=>{
 const output=await buildWeb();assert.ok(await validateWeb(output)>20);const html=await readFile(`${output}/editor.html`,'utf8');assert.match(html,/\.\/js\/startup.js/);assert.match(html,/writing-statistics/);
});
