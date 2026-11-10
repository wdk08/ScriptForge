import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {IDBFactory} from 'fake-indexeddb';
import {createVoiceStore} from '../js/voice-storage.js';
import {IndexedDBBackupStore} from '../js/backups.js';
import {createFileService} from '../js/files.js';
test('Dev voice and backup databases cannot read production records',async()=>{
 const factory=new IDBFactory();const old=globalThis.scriptForgeDiagnosticDatabasePrefix;
 try{
  globalThis.scriptForgeDiagnosticDatabasePrefix='scriptforge-dev-';
  await createVoiceStore(factory).list();await new IndexedDBBackupStore(factory).database();
  const names=(await factory.databases()).map(d=>d.name);
  assert.ok(names.includes('scriptforge-dev-scriptforge-voices'));assert.ok(names.includes('scriptforge-dev-scriptforge-backups'));
  assert.ok(!names.includes('scriptforge-voices'));assert.ok(!names.includes('scriptforge-backups'));
 }finally{globalThis.scriptForgeDiagnosticDatabasePrefix=old;}
});
test('browser Dev cannot obtain disk write handles, contact the local helper, or overwrite a passed handle',async()=>{
 const fail=()=>assert.fail('Production disk interface must never be used');
 const files=createFileService({scriptForgeDev:true,scriptForgeLocalHelperDisabled:true,showDirectoryPicker:fail,showSaveFilePicker:fail,showOpenFilePicker:fail,fetch:fail});
 await files.ready;assert.equal(files.supportsDirectories,false);assert.equal(files.supportsHandles,false);assert.equal(files.supportsSavePicker,false);
 assert.throws(()=>files.pickDirectory(),/isolated recovery/);assert.equal(await files.pickSave('Test'),null);
 await assert.rejects(files.write({createWritable:fail},'Do not write'),/isolated recovery/);
});
test('dev overrides preserve production identity, signing and updater configuration',async()=>{
 const production=JSON.parse(await readFile('src-tauri/tauri.conf.json')),dev=JSON.parse(await readFile('src-tauri/tauri.dev.conf.json'));
 assert.equal(production.identifier,'com.scriptforge.desktop');assert.equal(production.bundle.createUpdaterArtifacts,true);assert.match(production.plugins.updater.endpoints[0],/releases\/latest/);
 assert.equal(dev.identifier,'com.scriptforge.dev');assert.equal(dev.productName,'ScriptForge Dev');assert.equal(dev.bundle.active,false);assert.equal(dev.plugins.updater.pubkey,'');assert.deepEqual(dev.plugins.updater.endpoints,[]);assert.match(await readFile('src-tauri/src/lib.rs','utf8'),/data_store_identifier = Some/);
 assert.equal(dev.build.devUrl,'http://127.0.0.1:5179');
});
