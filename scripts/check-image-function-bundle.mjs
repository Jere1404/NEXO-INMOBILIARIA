// Validate the actual CLI transport artifact, never source-directory estimates.
import { brotliDecompressSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
export const MAX_BUNDLE_BYTES = 20_000_000; // Conservative decimal 20 MB, not 20 MiB.
export function inspectBundle(bundle, wasm) {
  if (bundle.length < 5 || bundle.length > MAX_BUNDLE_BYTES || bundle.subarray(0,4).toString() !== 'EZBR') throw new Error('Expected a Docker-built EZBR bundle within 20 MB');
  const eszip = brotliDecompressSync(bundle.subarray(4), { maxOutputLength: 128_000_000 });
  if (eszip.subarray(0,5).toString() !== 'ESZIP') throw new Error('Unknown ESZIP format');
  if (wasm.subarray(0,4).toString() !== '\0asm' || eszip.indexOf(wasm) === -1) throw new Error('Prepared WASM was not found intact inside the real bundle');
  return { eszip_bytes: eszip.length, upload_bytes: bundle.length, limit_bytes: MAX_BUNDLE_BYTES, limit_applies_to: 'upload_bytes', sha256: createHash('sha256').update(bundle).digest('hex') };
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  try {
    const chunks=[];let bytes=0;
    for await (const chunk of process.stdin) { bytes+=chunk.length;if(bytes>MAX_BUNDLE_BYTES)throw new Error('Upload bundle exceeds 20 MB');chunks.push(chunk); }
    console.log(JSON.stringify(inspectBundle(Buffer.concat(chunks),readFileSync('supabase/functions/nexo-property-image/magick.wasm'))));
  } catch { console.error('Bundle validation failed: missing/invalid WASM or ESZIP, decompression failure, or transport size above 20 MB. No upload permitted.');process.exitCode=1; }
}
