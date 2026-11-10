// A shared fixed origin keeps browser Dev recovery stable and lets Tauri reuse Vite.
import {createServer} from 'vite';
const url='http://127.0.0.1:5179';
try {
  const response=await fetch(url,{signal:AbortSignal.timeout(750)});
  if(response.headers.get('X-ScriptForge-Dev')!=='1')throw new Error('Port 5179 is occupied by another service. Stop it first; Dev never falls back to another origin.');
  console.log(`Reusing ScriptForge Dev: ${url}`);
} catch(error) {
  if(error.message.startsWith('Port 5179'))throw error;
  const server=await createServer({configFile:'vite.config.mjs'});
  await server.listen();server.printUrls();
  for(const event of ['SIGINT','SIGTERM'])process.once(event,async()=>{await server.close();process.exit(0)});
}
