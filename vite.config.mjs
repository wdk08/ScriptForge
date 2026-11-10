// Development only: production assets and release builds keep their existing pipeline.
import {defineConfig} from 'vite';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const runtime=readFileSync(new URL('./scripts/dev-runtime.js',import.meta.url),'utf8');
export default defineConfig({
  appType:'mpa',
  publicDir:false,
  server:{host:'127.0.0.1',port:5179,strictPort:true,allowedHosts:['127.0.0.1'],
    fs:{strict:true},watch:{ignored:['src-tauri','validation','dist','test-results'].map(dir=>`${root}${dir}/**`)},
    headers:{'Cache-Control':'no-store','X-ScriptForge-Dev':'1'}},
  plugins:[{name:'scriptforge-isolated-dev',
    transformIndexHtml:{order:'pre',handler:()=>[{tag:'script',attrs:{src:'/@scriptforge/dev-runtime.js'},injectTo:'head-prepend'}]},
    configureServer(server){server.middlewares.use((req,res,next)=>{
      let path;try{path=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname)}catch{res.writeHead(400);res.end();return;}
      if(path==='/@scriptforge/dev-runtime.js'){res.setHeader('Content-Type','text/javascript');res.end(runtime);return;}
      // Never expose local grants, the original checkout, native sources or personal fixtures.
      if(!/^(?:\/$|\/(?:index|editor)\.html$|\/(?:css|js|assets|vendor)\/|\/@vite\/|\/@id\/|\/node_modules\/(?:\.vite\/|vite\/dist\/client\/)|\/(?:scriptForgeLogo\.png|LICENSE|COPYRIGHT|THIRD_PARTY_NOTICES\.md|SOURCE_CODE\.md)$)/.test(path)){
        res.writeHead(403);res.end('Not a development frontend asset');return;
      }
      next();
    })}
  }]
});
