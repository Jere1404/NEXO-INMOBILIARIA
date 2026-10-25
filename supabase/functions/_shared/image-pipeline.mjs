export const MAX_BYTES=10485760, MAX_PIXELS=12582912, MAX_SIDE=8192, MAX_VARIANT_BYTES=2097152;
export class ImageProblem extends Error { constructor(code,status=400){super(code);this.code=code;this.status=status;} }
const bad=()=>{throw new ImageProblem('INVALID_IMAGE');};
const text=(bytes,start,n)=>String.fromCharCode(...bytes.subarray(start,start+n));
export function boundedDimensions(width,height){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>MAX_SIDE||height>MAX_SIDE||width*height>MAX_PIXELS)throw new ImageProblem('DIMENSIONS_EXCEEDED');
 return {width,height};
}
// Parse headers BEFORE decoding to reject obvious pixel bombs and animated files.
// The trusted decoder independently validates the bytes afterwards.
export function inspectImage(bytes){
 if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>MAX_BYTES)throw new ImageProblem('FILE_TOO_LARGE');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let width,height,extension;
 if(bytes[0]===0xff&&bytes[1]===0xd8){
  extension='jpg';let pos=2;
  while(pos<bytes.length){
   if(bytes[pos++]!==0xff)bad();while(bytes[pos]===0xff)pos++;
   const marker=bytes[pos++];if(marker===0xda||marker===0xd9)break;
   if(marker===1||(marker>=0xd0&&marker<=0xd7))continue;
   if(pos+2>bytes.length)bad();const length=view.getUint16(pos);if(length<2||pos+length>bytes.length)bad();
   if([0xc0,0xc1,0xc2].includes(marker)){
    if(width||length<8||bytes[pos+2]!==8)bad();height=view.getUint16(pos+3);width=view.getUint16(pos+5);
   }
   pos+=length;
  }
 }else if(bytes.length>=33&&bytes.slice(0,8).every((v,i)=>v===[137,80,78,71,13,10,26,10][i])){
  extension='png';let pos=8,ended=false;
  while(pos+12<=bytes.length){
   const length=view.getUint32(pos),type=text(bytes,pos+4,4);if(length>bytes.length-pos-12)bad();
   if(pos===8){if(type!=='IHDR'||length!==13)bad();width=view.getUint32(pos+8);height=view.getUint32(pos+12);}
   if(type==='acTL')throw new ImageProblem('ANIMATED_IMAGE');
   pos+=length+12;if(type==='IEND'){ended=true;break;}
  }
  if(!ended)bad();
 }else if(bytes.length>=20&&text(bytes,0,4)==='RIFF'&&text(bytes,8,4)==='WEBP'){
  extension='webp';if(view.getUint32(4,true)+8!==bytes.length)bad();let pos=12,canvas,frames=0;
  while(pos+8<=bytes.length){
   const type=text(bytes,pos,4),length=view.getUint32(pos+4,true),start=pos+8;if(length>bytes.length-start)bad();
   if(type==='ANIM'||type==='ANMF')throw new ImageProblem('ANIMATED_IMAGE');
   if(type==='VP8X'){
    if(length!==10)bad();if(bytes[start]&2)throw new ImageProblem('ANIMATED_IMAGE');
    const u24=i=>bytes[i]+(bytes[i+1]<<8)+(bytes[i+2]<<16);canvas={width:u24(start+4)+1,height:u24(start+7)+1};
   }
   if(type==='VP8 '){
    if(length<10||text(bytes,start+3,3)!=='\x9d\x01\x2a'||(bytes[start]&1))bad();frames++;
    width=view.getUint16(start+6,true)&0x3fff;height=view.getUint16(start+8,true)&0x3fff;
   }
   if(type==='VP8L'){
    if(length<5||bytes[start]!==0x2f)bad();const packed=view.getUint32(start+1,true);if(packed>>>29)bad();frames++;
    width=(packed&0x3fff)+1;height=((packed>>>14)&0x3fff)+1;
   }
   pos=start+length+(length%2);
  }
  if(frames!==1||(canvas&&(canvas.width!==width||canvas.height!==height)))bad();
 }else throw new ImageProblem('FORMAT_NOT_SUPPORTED');
 if(!width||!height)bad();return {extension,...boundedDimensions(width,height)};
}
export async function sha256(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');}
export async function processOriginal(bytes,reservation,codec){
 const header=inspectImage(bytes);
 if(header.extension!==reservation.original_extension||bytes.length!==Number(reservation.original_bytes))throw new ImageProblem('ORIGINAL_MISMATCH');
 const hash=await sha256(bytes);if(hash!==reservation.original_sha256)throw new ImageProblem('ORIGINAL_MISMATCH');
 let output;try{output=await codec.encode(bytes,header.extension);}catch(error){if(error instanceof ImageProblem)throw error;throw new ImageProblem('DECODE_FAILED');}
 boundedDimensions(output.width,output.height);
 if(!((output.width===header.width&&output.height===header.height)||(output.width===header.height&&output.height===header.width)))bad();
 const expected=[...new Set([480,960,1600].map(w=>Math.min(w,output.width)))];const seen=new Set();
 if(output.variants.length!==2*expected.length)bad();
 for(const variant of output.variants){
  const key=variant.format+variant.width;
  if(!['jpg','webp'].includes(variant.format)||!expected.includes(variant.width)||seen.has(key)||!(variant.data instanceof Uint8Array)||variant.data.length>MAX_VARIANT_BYTES||!variant.data.length)bad();
  const actual=inspectImage(variant.data);
  if(actual.extension!==variant.format||actual.width!==variant.width||actual.height!==variant.height||Math.abs(variant.height-output.height*variant.width/output.width)>1)bad();seen.add(key);
 }
 return {...output,sha256:hash};
}
