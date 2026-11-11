import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { auditPublic } from './audit-public.mjs';
import { releaseCheck } from './release-check.mjs';

const repository = 'wdk08/ScriptForge';
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const output = (program, args) => execFileSync(program, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const git = (...args) => output('git', args);
const github = (...args) => output('gh', args);
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const serialize = value => JSON.stringify(value, null, 2) + '\n';
const npm = process.env.npm_execpath;
const versionParts = version => version.split('.').map(BigInt);
function newer(version, previous) {
  const left = versionParts(version), right = versionParts(previous);
  const firstDifference = left.findIndex((part, index) => part !== right[index]);
  return firstDifference !== -1 && left[firstDifference] > right[firstDifference];
}
function nextVersion(previous, bump) {
  const parts = versionParts(previous), index = ['major', 'minor', 'patch'].indexOf(bump);
  parts[index]++;
  return parts.map((part, i) => i > index ? 0n : part).join('.');
}
function requireClean() {
  if (git('status', '--porcelain')) {
    throw new Error('Commit or stash your work before running a release. Your working files have been left in place.');
  }
}
function setVersion(text, pattern, version, path) {
  if (!pattern.test(text)) throw new Error('Could not find ScriptForge version in ' + path);
  return text.replace(pattern, (_, prefix) => prefix + version + '"');
}
function versionFiles(version) {
  const pkg = json('package.json'), lock = json('package-lock.json'), tauri = json('src-tauri/tauri.conf.json');
  pkg.version = lock.version = lock.packages[''].version = tauri.version = version;
  const cargo = 'src-tauri/Cargo.toml', cargoLock = 'src-tauri/Cargo.lock';
  const files = new Map([
    ['package.json', serialize(pkg)],
    ['package-lock.json', serialize(lock)],
    ['src-tauri/tauri.conf.json', serialize(tauri)],
    [cargo, setVersion(readFileSync(cargo, 'utf8'), /^(version = ")\d+\.\d+\.\d+"/m, version, cargo)],
    [cargoLock, setVersion(readFileSync(cargoLock, 'utf8'), /^(name = "scriptforge"\nversion = ")\d+\.\d+\.\d+"/m, version, cargoLock)],
  ]);
  const inventory = json('vendor/licenses/packages.json');
  const hash = file => createHash('sha256').update(files.get(file)).digest('hex');
  inventory.npmLockSha256 = hash('package-lock.json');
  inventory.cargoLockSha256 = hash(cargoLock);
  files.set('vendor/licenses/packages.json', serialize(inventory));
  return files;
}

async function main() {
  if (!process.stdin.isTTY || !npm) throw new Error('Run npm run release in an interactive terminal.');
  requireClean();
  const branch = git('symbolic-ref', '--short', 'HEAD');
  const head = git('rev-parse', 'HEAD');
  const host = 'github.com';
  const validRemote = new Set([
    'https://' + host + '/' + repository,
    'git@' + host + ':' + repository,
    'ssh://git@' + host + '/' + repository,
  ]);
  for (const args of [['get-url', '--all', 'origin'], ['get-url', '--push', '--all', 'origin']]) {
    if (!validRemote.has(git('remote', ...args).replace(/\.git$/, ''))) throw new Error('Origin must point to ' + repository + '.');
  }
  git('fetch', '--no-tags', 'origin', 'main');
  const remoteHead = git('rev-parse', 'FETCH_HEAD');
  if (spawnSync('git', ['merge-base', '--is-ancestor', remoteHead, head]).status !== 0) {
    throw new Error('This branch must include origin/main. Integrate its commits and retry.');
  }
  const latestTag = github('api', 'repos/' + repository + '/releases/latest', '--jq', '.tag_name');
  const previous = latestTag.replace(/^v/, '');
  if (!stableVersion.test(previous)) throw new Error('The latest release does not have a stable version tag.');

  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  let version, notesPath, notes;
  try {
    const choices = ['patch', 'minor', 'major'];
    console.log('Latest stable release ' + latestTag);
    for (const choice of choices) console.log(choice + '  ' + nextVersion(previous, choice));
    const choice = (await prompt.question('Choose patch, minor, major, or custom [patch] ')).trim().toLowerCase() || 'patch';
    if (!choices.includes(choice) && choice !== 'custom') throw new Error('Choose patch, minor, major, or custom.');
    version = choice === 'custom' ? (await prompt.question('Enter a stable version (X.Y.Z) ')).trim() : nextVersion(previous, choice);
    if (!stableVersion.test(version) || !newer(version, previous)) throw new Error('Choose a stable version newer than ' + latestTag + '.');
    const tag = 'v' + version;
    const existing = github('api', '--paginate', 'repos/' + repository + '/releases?per_page=100', '--jq', '.[] | .tag_name');
    if (existing.split('\n').includes(tag) || git('ls-remote', '--tags', 'origin', 'refs/tags/' + tag)) {
      throw new Error(tag + ' already has a release, draft, or remote tag. Review it in GitHub before proceeding.');
    }
    notesPath = 'releases/' + tag + '.md';
    notes = existsSync(notesPath) ? readFileSync(notesPath, 'utf8') : '';
    if (!notes.trim()) {
      const summary = (await prompt.question('Enter a one-line release note ')).trim();
      if (!summary) throw new Error('Release notes are required.');
      notes = '# ScriptForge ' + tag + '\n\n' + summary + '\n';
    }
    console.log('\n' + branch + ' → ' + repository + ' main\n\n' + notes.trim());
    console.log('\n' + (git('log', '--oneline', remoteHead + '..' + head) || 'No unpublished commits.'));
    console.log('GitHub Actions will build, verify, tag, and publish ' + tag + '.');
    if ((await prompt.question('Type ScriptForge ' + tag + ' to proceed ')).trim() !== 'ScriptForge ' + tag) return;
  } finally {
    prompt.close();
  }

  requireClean();
  const sameCheckout = () => git('rev-parse', 'HEAD') === head && git('symbolic-ref', '--short', 'HEAD') === branch;
  if (!sameCheckout()) throw new Error('The branch changed during review. Start the release again.');
  const files = versionFiles(version);
  files.set(notesPath, notes);
  for (const [path, content] of files) writeFileSync(path, content);
  await releaseCheck({ production: true, version });
  const audit = await auditPublic();
  if (audit.findings.length) throw new Error('Public source audit found issues. Run npm run audit:public for details.');
  for (const script of ['licenses:check', 'check', 'test']) {
    execFileSync(process.execPath, [npm, 'run', script], { stdio: 'inherit' });
  }
  if (!sameCheckout() || git('diff', '--cached', '--name-only') || [...files].some(([path, expected]) => readFileSync(path, 'utf8') !== expected)) {
    throw new Error('Release files changed during validation. Review them before retrying.');
  }
  const pending = new Set([
    ...git('diff', 'HEAD', '--name-only').split('\n').filter(Boolean),
    ...git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean),
  ]);
  if ([...pending].some(path => !files.has(path))) throw new Error('Other files changed during validation. Review them before retrying.');
  if (pending.size) {
    git('add', '--', ...files.keys());
    git('commit', '-m', 'release: ScriptForge v' + version);
  }
  const commit = git('rev-parse', 'HEAD');
  git('push', 'origin', 'HEAD:refs/heads/main');
  const run = github('workflow', 'run', 'release.yml', '--repo', repository, '--ref', 'main',
    '-f', 'version=' + version, '-f', 'commit=' + commit, '-f', 'license_reviewed=true',
    '-f', 'publish=true', '-f', 'refresh_draft=false', '-f', 'confirmation=ScriptForge v' + version);
  console.log(run || 'Release workflow dispatched.');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
