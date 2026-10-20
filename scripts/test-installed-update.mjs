// Copyright (C) 2026 wdk08. SPDX-License-Identifier: GPL-3.0-only
// macOS integration test: install a real signed production archive into a writable
// temporary app bundle. No production endpoint, private signing key or user data.
import { mkdtemp, readFile, writeFile, cp, mkdir, readdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname, basename } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:https';

if (process.platform !== 'darwin') throw new Error('This installed-update test currently requires macOS; do not claim a Windows installed-update pass.');
const source = process.cwd(), bundle = resolve(process.argv[2] ?? 'src-tauri/target/release/bundle');
const target = process.argv[3];
const find = async directory => (await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry => entry.isDirectory() ? find(join(directory, entry.name)) : [join(directory, entry.name)]))).flat();
const archives = (await find(bundle)).filter(path => path.endsWith('.app.tar.gz'));
if (archives.length !== 1) throw new Error('Exactly one already verified production update archive is required.');
const archive = archives[0], signature = await readFile(`${archive}.sig`, 'utf8');
const root = await mkdtemp(join(tmpdir(), 'scriptforge-desktop-smoke-'));
console.log(`Installed update evidence: ${root}`);
const tree = join(root, 'source'); await mkdir(tree);
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
for (const file of tracked) { await mkdir(dirname(join(tree, file)), { recursive: true }); await cp(join(source, file), join(tree, file)); }
await symlink(resolve('node_modules'), join(tree, 'node_modules'), 'dir');
const replaceOnce = async (file, before, after) => {
  const text = await readFile(join(tree, file), 'utf8');
  if (text.split(before).length !== 2) throw new Error(`Isolated test patch no longer matches ${file}`);
  await writeFile(join(tree, file), text.replace(before, after));
};
// Only this disposable older test build may check for updates in diagnostics.
// The production source/build and downloaded 1.0.0 archive remain unmodified.
await replaceOnce('src-tauri/src/updates.rs', 'std::env::var_os("SCRIPTFORGE_DESKTOP_SMOKE_ROOT").is_none()\n        && ', '');
await writeFile(join(root, 'stress.js'), await readFile('scripts/installed-update-proof.js'));
const payload = await readFile(archive);
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(root, 'tls.key'), '-out', join(root, 'tls.crt'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
let manifest;
const server = createServer({ key: await readFile(join(root, 'tls.key')), cert: await readFile(join(root, 'tls.crt')) }, (request, response) => {
  const body = request.url === '/latest.json' ? Buffer.from(JSON.stringify(manifest)) : request.url === '/update.app.tar.gz' ? payload : null;
  if (!body) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Length': body.length }); response.end(body);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const endpoint = `https://127.0.0.1:${server.address().port}`;
  manifest = { version: '1.0.0', notes: 'Isolated installed-app update proof', pub_date: new Date().toISOString(), platforms: { [`darwin-${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}`]: { url: `${endpoint}/update.app.tar.gz`, signature } } };
  const config = { version: '0.99.0', bundle: { createUpdaterArtifacts: false }, plugins: { updater: { endpoints: [`${endpoint}/latest.json`], dangerousAcceptInvalidCerts: true } } };
  await writeFile(join(tree, 'update-test.json'), JSON.stringify(config));
  const targetRoot = resolve('src-tauri/target');
  const args = ['build', '--config', 'update-test.json', '--bundles', 'app', ...(target ? ['--target', target] : [])];
  const log = join(root, 'build.log');
  await new Promise((resolveBuild, reject) => {
    const child = spawn(join(source, 'node_modules/.bin/tauri'), args, { cwd: tree, env: { ...process.env, CARGO_TARGET_DIR: targetRoot, TAURI_SIGNING_PRIVATE_KEY: '', TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    child.on('error', reject); child.on('exit', async code => { await writeFile(log, output); code === 0 ? resolveBuild() : reject(new Error(`Older test build failed; see ${log}\n${output.slice(-3000)}`)); });
  });
  const built = join(targetRoot, ...(target ? [target] : []), 'release/bundle/macos/ScriptForge.app');
  const installed = join(root, 'installed/ScriptForge.app'); await mkdir(dirname(installed)); await cp(built, installed, { recursive: true });
  const binary = join(installed, 'Contents/MacOS/scriptforge');
  const child = spawn(binary, [], { env: { ...process.env, SCRIPTFORGE_DESKTOP_SMOKE_ROOT: root, SCRIPTFORGE_IMPORT_STRESS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  child.on('error', error => { output += String(error); });
  const deadline = Date.now() + 240000; let report;
  while (Date.now() < deadline) {
    try { report = JSON.parse(await readFile(join(root, 'first-report.json'), 'utf8')); break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  await writeFile(join(root, 'native.log'), output);
  if (!report?.success || !report.installedAndRestarted) { child.kill(); throw new Error(`Installed update failed: ${JSON.stringify(report ?? { error: 'Timed out' })}. Evidence: ${root}`); }
  execFileSync('codesign', ['--verify', '--deep', '--strict', installed]);
  console.log(JSON.stringify({ ...report, archive: basename(archive), evidence: root }, null, 2));
} finally { server.close(); }
