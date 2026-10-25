import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as magick from '@imagemagick/magick-wasm';
import { createMagickCodec } from '../_shared/magick-codec.mjs';
import { inspectImage,processOriginal,sha256,MAX_BYTES } from '../_shared/image-pipeline.mjs';
const codec=createMagickCodec(magick,()=>readFile(new URL('../node_modules/@imagemagick/magick-wasm/dist/x86/magick.wasm',import.meta.url)));
const source=new Uint8Array(await readFile(new URL('../../../assets/images/propiedades/nexo-001/principal-960.jpg',import.meta.url)));
const reservation={original_extension:'jpg',original_bytes:source.length,original_sha256:await sha256(source)};
test('real pinned WASM decodes an existing reference image and generates verified JPEG/WebP without upscaling',async()=>{
 const started=performance.now();const result=await processOriginal(source,reservation,codec);
 assert.equal(result.width,960);assert.equal(result.height,720);assert.equal(result.variants.length,4);
 assert.deepEqual(result.variants.map(v=>v.format+v.width).sort(),['jpg480','jpg960','webp480','webp960']);
 for(const variant of result.variants){assert(variant.data.length<2097152);assert.deepEqual(inspectImage(variant.data),{extension:variant.format,width:variant.width,height:variant.height});}
 console.log(`Local WASM processing: ${Math.round(performance.now()-started)} ms, ${result.variants.reduce((n,v)=>n+v.data.length,0)} output bytes. This is not an Edge Free CPU certification.`);
});
test('rejects type/hash/size mismatches and unsupported content before calling the decoder',async()=>{
 const never={encode:()=>{throw new Error('Decoder must not run');}};
 for(const row of [{...reservation,original_sha256:'0'.repeat(64)},{...reservation,original_bytes:1},{...reservation,original_extension:'png'}])await assert.rejects(()=>processOriginal(source,row,never),e=>e.code==='ORIGINAL_MISMATCH');
 assert.throws(()=>inspectImage(new TextEncoder().encode('<svg><script/></svg>')),e=>e.code==='FORMAT_NOT_SUPPORTED');
 assert.throws(()=>inspectImage(new Uint8Array(MAX_BYTES+1)),e=>e.code==='FILE_TOO_LARGE');
 assert.throws(()=>inspectImage(new Uint8Array([255,216,255,192,0,1])),e=>e.code==='INVALID_IMAGE');
});
test('rejects oversized PNG headers and animated PNG/WebP before decoding',()=>{
 const png=new Uint8Array(57);png.set([137,80,78,71,13,10,26,10]);const view=new DataView(png.buffer);
 view.setUint32(8,13);png.set(new TextEncoder().encode('IHDR'),12);view.setUint32(16,1000000);view.setUint32(20,1000000);view.setUint32(33,0);png.set(new TextEncoder().encode('IEND'),37);
 assert.throws(()=>inspectImage(png),e=>e.code==='DIMENSIONS_EXCEEDED');
 view.setUint32(16,64);view.setUint32(20,64);view.setUint32(33,0);png.set(new TextEncoder().encode('acTL'),37);
 assert.throws(()=>inspectImage(png),e=>e.code==='ANIMATED_IMAGE');
 const webp=new Uint8Array(30);webp.set(new TextEncoder().encode('RIFF'));new DataView(webp.buffer).setUint32(4,22,true);webp.set(new TextEncoder().encode('WEBPVP8X'),8);new DataView(webp.buffer).setUint32(16,10,true);webp[20]=2;
 assert.throws(()=>inspectImage(webp),e=>e.code==='ANIMATED_IMAGE');
});
test('malformed encoder output cannot be finalized as a valid variant set',async()=>{
 const fake={encode:async()=>({width:960,height:720,variants:[]})};await assert.rejects(()=>processOriginal(source,reservation,fake),e=>e.code==='INVALID_IMAGE');
});
test('orientation is normalized and EXIF is removed from every optimized variant',async()=>{
 const exif=new Uint8Array(32),view=new DataView(exif.buffer);exif.set(new TextEncoder().encode('Exif\0\0'));view.setUint16(6,0x4949,true);view.setUint16(8,42,true);view.setUint32(10,8,true);view.setUint16(14,1,true);view.setUint16(16,0x0112,true);view.setUint16(18,3,true);view.setUint32(20,1,true);view.setUint16(24,6,true);
 const rotated=new Uint8Array(source.length+36);rotated.set([255,216,255,225,0,34]);rotated.set(exif,6);rotated.set(source.subarray(2),38);
 const result=await processOriginal(rotated,{original_extension:'jpg',original_bytes:rotated.length,original_sha256:await sha256(rotated)},codec);
 assert.equal(result.width,720);assert.equal(result.height,960);
 for(const variant of result.variants)magick.ImageMagick.read(variant.data,image=>{assert(!image.profileNames.includes('exif'));assert.equal(image.width,variant.width);assert.equal(image.height,variant.height);});
});
test('real PNG and WebP originals produce valid optimized variants without changing proportions',async()=>{
 // In-memory format fixture from an existing project image; no new photograph or file.
 await codec.encode(source,'jpg');
 const png=magick.ImageMagick.read(source,image=>image.write(magick.MagickFormat.Png,data=>new Uint8Array(data)));
 const webp=new Uint8Array(await readFile(new URL('../../../assets/images/propiedades/nexo-001/principal-480.webp',import.meta.url)));
 for(const [extension,bytes] of [['png',png],['webp',webp]]){
  const result=await processOriginal(bytes,{original_extension:extension,original_bytes:bytes.length,original_sha256:await sha256(bytes)},codec);
  assert.equal(result.width/result.height,4/3);assert(result.variants.length>=2);
  for(const variant of result.variants)assert.equal(inspectImage(variant.data).extension,variant.format);
 }
});
