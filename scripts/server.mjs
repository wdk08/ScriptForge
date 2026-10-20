import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createLocalFiles } from './local-files.mjs';
const base = resolve(new URL('..', import.meta.url).pathname);
const port = Number(process.env.PORT ?? 4173);
const localFiles = createLocalFiles({ configPath: resolve(base, '.scriptforge-local.json') });
const mime = { '.mjs': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.json': 'application/json', '.wav': 'audio/wav', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.fountain': 'text/plain; charset=utf-8', '.png': 'image/png' };
createServer(async (req, res) => {
  try {
    // Accept helper calls only from this exact loopback origin, with a custom
    // header. Cross-origin pages and file:// pages cannot authorize file access.
    const origin = `http://${req.headers.host}`;
    if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(req.headers.host)) { res.writeHead(403); res.end('Forbidden'); return; }
    const url = new URL(req.url, origin);
    if (url.pathname.startsWith('/api/local-files/')) {
      if (req.method !== 'POST' || req.headers.origin !== origin || req.headers['x-scriptforge-local'] !== '1' || req.headers['content-type'] !== 'application/json') { res.writeHead(403); res.end('Forbidden'); return; }
      let raw = '', size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 22 * 1024 * 1024) throw new Error('Screenplay too large'); raw += chunk; }
      try {
        let body; try { body = JSON.parse(raw); } catch { throw new Error('Invalid JSON request.'); }
        const result = await localFiles.run(url.pathname.split('/').at(-1), body);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: { name: error.name, message: error.message, current: error.current } }));
      }
      return;
    }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const path = resolve(base, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!path.startsWith(base + sep) || /(?:^|\/)(?:\.|node_modules|package-lock)/.test(pathname)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    if (!(await stat(path)).isFile()) throw new Error('Not a file');
    res.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(path));
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`ScriptForge editor: http://localhost:${port}`));
