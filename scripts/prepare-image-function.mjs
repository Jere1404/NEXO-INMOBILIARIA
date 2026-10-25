import { copyFile,readFile } from 'node:fs/promises';
const root=new URL('../supabase/functions/',import.meta.url);
const pkg=JSON.parse(await readFile(new URL('node_modules/@imagemagick/magick-wasm/package.json',root),'utf8'));
if(pkg.version!=='0.0.45')throw new Error('Unexpected ImageMagick version');
await copyFile(new URL('node_modules/@imagemagick/magick-wasm/dist/x86/magick.wasm',root),new URL('nexo-property-image/magick.wasm',root));
console.log('Prepared pinned WASM asset for the Edge Function; no deployment performed.');
