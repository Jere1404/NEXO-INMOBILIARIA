import { build } from 'esbuild';
import { mkdir, copyFile, readFile, readdir, writeFile } from 'node:fs/promises';
await mkdir(new URL('../assets/vendor/', import.meta.url), { recursive:true });
await build({
  stdin:{ contents:"export { createClient } from '@supabase/supabase-js';",resolveDir:process.cwd(),sourcefile:'supabase-entry.js' },
  bundle:true,format:'esm',platform:'browser',target:['es2022'],minify:true,
  legalComments:'external',outfile:'assets/vendor/supabase-js.js',
});
await copyFile(new URL('../node_modules/@supabase/supabase-js/LICENSE',import.meta.url),new URL('../assets/vendor/SUPABASE-LICENSE',import.meta.url));
console.log('SDK oficial local compilado; versiones e integridad fijadas en package-lock.json.');

const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url)));
const notices = [];
for (const [path, metadata] of Object.entries(lock.packages)) {
  if (!path.startsWith('node_modules/') || metadata.dev) continue;
  const root = new URL(`../${path}/`, import.meta.url);
  const files = await readdir(root);
  for (const file of files.filter(name => /^licen[sc]e(?:\.|$)/i.test(name))) {
    notices.push(`${path} @ ${metadata.version}\n${await readFile(new URL(file, root), 'utf8')}`);
  }
}
await writeFile(new URL('../assets/vendor/THIRD-PARTY-LICENSES.txt', import.meta.url), notices.join('\n\n'));
