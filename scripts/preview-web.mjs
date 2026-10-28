import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve('dist/web'),base='/ScriptForge/',port=Number(process.env.PORT??4174);
const types={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.wasm':'application/wasm','.json':'application/json','.png':'image/png','.ttf':'font/ttf'};
createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'){res.writeHead(302,{Location:base});res.end();return;}if(!url.pathname.startsWith(base))throw Error('Not found');let name=decodeURIComponent(url.pathname.slice(base.length))||'index.html',file=resolve(root,name);if(!file.startsWith(root+sep)||! (await stat(file)).isFile())throw Error('Not found');res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream','Cache-Control':'no-store'});res.end(await readFile(file));}catch{res.writeHead(404);res.end('Not found');}}).listen(port,'127.0.0.1',()=>console.log(`Static app: http://localhost:${port}${base}`));
