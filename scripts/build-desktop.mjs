import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
export const desktopAssets = ['index.html', 'editor.html', 'css', 'js', 'assets', 'vendor', 'scriptForgeLogo.png', 'LICENSE', 'COPYRIGHT', 'THIRD_PARTY_NOTICES.md', 'SOURCE_CODE.md'];
export async function buildDesktop(root = fileURLToPath(new URL('..', import.meta.url))) {
  const output = resolve(root, 'dist/desktop');
  // Only generated output is replaced. Never bundle grants, user scripts or browser data.
  await rm(output, { recursive: true, force: true }); await mkdir(output, { recursive: true });
  for (const asset of desktopAssets) await cp(resolve(root, asset), resolve(output, asset), { recursive: true, filter: path => !basename(path).endsWith('.map') });
  await writeFile(resolve(output, 'desktop-build.json'), JSON.stringify({ version: JSON.parse(await (await import('node:fs/promises')).readFile(resolve(root, 'package.json'), 'utf8')).version, assets: desktopAssets }, null, 2));
  console.log(`Desktop assets prepared: ${output} (${(await readdir(output)).length} entries)`);
  return output;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildDesktop();
