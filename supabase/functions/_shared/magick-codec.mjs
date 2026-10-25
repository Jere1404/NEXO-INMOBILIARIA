import { MAX_PIXELS, MAX_SIDE, boundedDimensions } from './image-pipeline.mjs';
// No browser dependency. The pinned WASM module is prepared for the Edge bundle.
export function createMagickCodec(magick,loadWasm){
 let initialized;
 async function initialize(){
  initialized??=(async()=>{
   await magick.initializeImageMagick(await loadWasm());
   const limits=magick.ResourceLimits;
   limits.width=BigInt(MAX_SIDE);limits.height=BigInt(MAX_SIDE);limits.area=BigInt(MAX_PIXELS);
   limits.memory=134217728n;limits.maxMemoryRequest=134217728n;limits.disk=0n;
   limits.maxProfileSize=1048576n;limits.listLength=16n;limits.time=3n;
  })();await initialized;
 }
 return {async encode(bytes,extension){
  await initialize();const {ImageMagick,MagickFormat,MagickReadSettings,MagickGeometry,ColorSpace,MagickColors,AlphaAction}=magick;
  const format={jpg:MagickFormat.Jpeg,png:MagickFormat.Png,webp:MagickFormat.WebP}[extension];
  return ImageMagick.read(bytes,new MagickReadSettings({format}),image=>{
   image.autoOrient();const width=image.width,height=image.height;boundedDimensions(width,height);
   image.colorSpace=ColorSpace.sRGB;image.backgroundColor=MagickColors.White;image.alpha(AlphaAction.Remove);image.strip();
   const variants=[];
   for(const target of [...new Set([480,960,1600].map(v=>Math.min(v,width)))].sort((a,b)=>b-a)){
    const h=Math.max(1,Math.round(height*target/width)),geometry=new MagickGeometry(target,h);geometry.ignoreAspectRatio=true;image.resize(geometry);image.strip();
    for(const [kind,fmt,quality] of [['jpg',MagickFormat.Jpeg,82],['webp',MagickFormat.WebP,78]]){
     image.quality=quality;
     image.write(fmt,data=>variants.push({format:kind,width:image.width,height:image.height,data:new Uint8Array(data)}));
    }
   }
   return {width,height,variants};
  });
 }};
}
