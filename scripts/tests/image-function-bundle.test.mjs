import test from 'node:test';
import assert from 'node:assert/strict';
import { brotliCompressSync } from 'node:zlib';
import { inspectBundle, MAX_BUNDLE_BYTES } from '../check-image-function-bundle.mjs';
const wasm=Buffer.from([0,97,115,109,1,0,0,0]);
const bundle=raw=>Buffer.concat([Buffer.from('EZBR'),brotliCompressSync(raw)]);
test('measures real uncompressed ESZIP and compressed transport bytes separately',()=>{
 const raw=Buffer.concat([Buffer.from('ESZIP_V2'),wasm]);const body=bundle(raw);const report=inspectBundle(body,wasm);
 assert.equal(report.eszip_bytes,raw.length);assert.equal(report.upload_bytes,body.length);assert.equal(report.limit_bytes,20_000_000);assert.match(report.sha256,/^[a-f0-9]{64}$/);
});
test('rejects sources, plain WASM and malformed compression instead of accepting them as bundles',()=>{
 for(const body of [wasm,Buffer.from('export default 1'),Buffer.from('EZBRbad')])assert.throws(()=>inspectBundle(body,wasm));
});
test('rejects bundles missing the actual prepared WASM',()=>{
 assert.throws(()=>inspectBundle(bundle(Buffer.from('ESZIP_V2')),wasm),/WASM/);
});
test('rejects excessive compressed transport size',()=>{
 assert.throws(()=>inspectBundle(Buffer.alloc(MAX_BUNDLE_BYTES+1),wasm),/20 MB/);
});
test('distinguishes uncompressed ESZIP bytes from the transport bundle size limit',()=>{
 const raw=Buffer.alloc(MAX_BUNDLE_BYTES+1);raw.write('ESZIP_V2');wasm.copy(raw,8);
 const report=inspectBundle(bundle(raw),wasm);assert.equal(report.eszip_bytes,MAX_BUNDLE_BYTES+1);assert(report.upload_bytes<MAX_BUNDLE_BYTES);assert.equal(report.limit_applies_to,'upload_bytes');
});
