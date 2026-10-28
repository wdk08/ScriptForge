import {cp,mkdir,rm,writeFile,readFile,readdir,lstat} from 'node:fs/promises';
import {resolve,basename,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {desktopAssets} from './build-desktop.mjs';
export async function buildWeb(root=fileURLToPath(new URL('..',import.meta.url))){
 const output=resolve(root,'dist/web');await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
 for(const asset of desktopAssets)await cp(resolve(root,asset),resolve(output,asset),{recursive:true,filter:p=>!basename(p).endsWith('.map')});
 await writeFile(join(output,'web-environment.js'),'globalThis.scriptForgeLocalHelperDisabled = true;\n');
 for(const name of ['index.html','editor.html']){const path=join(output,name);await writeFile(path,(await readFile(path,'utf8')).replace('<head>','<head><script src="./web-environment.js"></script>'));}
 await writeFile(join(output,'.nojekyll'),'');await writeFile(join(output,'web-build.json'),JSON.stringify({version:JSON.parse(await readFile(join(root,'package.json'))).version,entrypoints:['index.html','editor.html'],storage:'local IndexedDB',assets:desktopAssets},null,2));
 await validateWeb(output);console.log(`Static browser app prepared: ${output}`);return output;
}
export async function validateWeb(output){
 const files=[];async function visit(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isSymbolicLink())throw new Error('Symlinks are not allowed in the web build.');if(entry.isDirectory())await visit(path);else files.push(path);}}await visit(output);
 for(const path of files){const relative=path.slice(output.length+1);if(/(?:^|\/)(?:\.git|node_modules|src-tauri|validation|\.env|\.scriptforge-local)/.test(relative)||/\.(?:key|pem|p12|pfx|db|sqlite)$/i.test(relative))throw new Error('Private/desktop data in web output.');}
 for(const name of ['index.html','editor.html']){const html=await readFile(join(output,name),'utf8');if(/(?:src|href)=["']\/(?!\/)/.test(html))throw new Error('Root-relative asset breaks GitHub Pages project paths.');for(const match of html.matchAll(/(?:src|href)=["']\.\/([^"'#?]+)/g))await lstat(join(output,match[1]));}
 return files.length;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildWeb();
