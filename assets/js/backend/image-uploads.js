import { inspectImage,sha256 } from '../image-validation.js';
import { createAdminAuth } from './auth.js';
import { AdminAccessDenied } from './admin-properties.js';
import { getPropertyImage } from '../property-cards.js';
export const MAX_UPLOAD_BYTES=10485760;
const messages={ORIGIN_DENIED:'Este panel no puede conectarse al procesador desde este dominio.',UNEXPECTED_RESPONSE:'El procesador devolvió una respuesta inesperada. Actualizá las fotografías antes de reintentar.',ORIGINAL_UPLOAD_DENIED:'Se rechazó la carga del original. Revisá los permisos de almacenamiento antes de reintentar.',AUTH_REQUIRED:'Iniciá sesión nuevamente.',ACCESS_DENIED:'Tu cuenta no tiene permiso para gestionar fotografías.',MIGRATION_REQUIRED:'Falta instalar la migración V5C.2.',BACKEND_NOT_CONFIGURED:'Falta configurar el procesador de imágenes.',BACKEND_UNAVAILABLE:'No pudimos contactar al procesador. Actualizá las fotografías antes de reintentar.',PROCESSING_BUSY:'El procesador está ocupado. Esperá unos minutos y reintentá.',LIMIT_REACHED:'Se alcanzó el límite de 20 fotografías o de cinco intentos de procesamiento. Revisá las fotografías antes de continuar.',INVALID_REQUEST:'Revisá los datos de la fotografía.',ORIGINAL_MISSING:'No encontramos el original completo. Reintentá la carga del mismo archivo.',ORIGINAL_MISMATCH:'El archivo no coincide con el original reservado.',INVALID_IMAGE:'El contenido del archivo no es una imagen válida.',FORMAT_NOT_SUPPORTED:'Solo se admiten fotografías JPEG, PNG o WebP.',FILE_TOO_LARGE:'La fotografía supera el límite de 10 MiB.',DIMENSIONS_EXCEEDED:'La imagen supera 12,6 megapíxeles o 8192 píxeles por lado.',ANIMATED_IMAGE:'No se admiten imágenes animadas.',DECODE_FAILED:'No pudimos decodificar la fotografía.',VARIANT_UPLOAD_FAILED:'No se completó el guardado de las versiones optimizadas. Podés reintentar.',ATTEMPT_CHANGED:'El intento cambió. Actualizá las fotografías antes de reintentar.',PROCESSING_FAILED:'No se pudo completar el procesamiento. Podés reintentar.'};
const knownMessage=(code,fallback)=>typeof code==='string'&&Object.hasOwn(messages,code)?messages[code]:fallback;
export const uploadErrorMessage=code=>knownMessage(code,messages.PROCESSING_FAILED);
export class UploadProblem extends Error{constructor(code){super(knownMessage(code,messages.BACKEND_UNAVAILABLE));this.code=code;}}
export function validateUploadFile(file){
 const extension=/\.([^.]+)$/.exec(file?.name||'')?.[1]?.toLowerCase();const normalized=extension==='jpeg'?'jpg':extension;
 const mime={jpg:'image/jpeg',png:'image/png',webp:'image/webp'}[normalized];
 if(!mime|| (file.type&&file.type!==mime))throw new UploadProblem('FORMAT_NOT_SUPPORTED');
 if(!Number.isSafeInteger(file.size)||file.size<1||file.size>MAX_UPLOAD_BYTES)throw new Error('Cada fotografía debe ocupar entre 1 byte y 10 MiB.');
 return {extension:normalized,mime};
}
export async function hashFile(file){
 const {extension}=validateUploadFile(file);const bytes=new Uint8Array(await file.arrayBuffer());
 try{if(inspectImage(bytes).extension!==extension)throw new UploadProblem('ORIGINAL_MISMATCH');return await sha256(bytes);}
 catch(error){if(error instanceof UploadProblem)throw error;throw new UploadProblem(error.code||'INVALID_IMAGE');}
}
export function legacyPreview(row,base){
 const photo=getPropertyImage({src:row.jpeg_path,width:row.width,height:row.height,alt:row.alt,webp:row.webp_variants,jpeg:row.jpeg_variants});return photo?new URL(photo.src,base).href:null;
}
const selection='id,property_id,position,storage_kind,processing_status,processing_attempts,processing_error,alt,source_kind,illustrative,jpeg_path,width,height,webp_variants,jpeg_variants,storage_prefix,original_object_key,original_extension,original_bytes,original_sha256,cleanup_requested_at';
export function createImageUploads(client){
 const auth=createAdminAuth(client);
 const authorize=async()=>{if(!await auth.getCurrentAdmin())throw new AdminAccessDenied();};
 const invoke=async body=>{
  await authorize();const result=await client.functions.invoke('nexo-property-image',{body,timeout:90000});
  if(result.error){let code;try{code=(await result.error.context?.json())?.code;}catch{}if(code==='AUTH_REQUIRED'||code==='ACCESS_DENIED')throw new AdminAccessDenied();throw new UploadProblem(code||'BACKEND_UNAVAILABLE');}
  if(!result.data?.id)throw new UploadProblem('BACKEND_UNAVAILABLE');return result.data;
 };
 const process=async(propertyId,imageId)=>{const result=await invoke({action:'process',propertyId,imageId});if(result.id!==imageId||result.property_id!==propertyId||result.processing_status!=='ready')throw new UploadProblem('UNEXPECTED_RESPONSE');return result;};
 return {
  async list(propertyId){await authorize();const result=await client.from('property_images').select(selection).eq('property_id',propertyId).is('cleanup_requested_at',null).order('position').order('id');if(result.error||!Array.isArray(result.data))throw new Error('No pudimos cargar las fotografías. Comprobá que V5C.2 esté instalada.');return result.data;},
  async preview(row,base,supabaseUrl){
   if(row.storage_kind==='legacy')return legacyPreview(row,base);
   if(row.processing_status!=='ready'||typeof row.jpeg_path!=='string'||!row.jpeg_path.startsWith(row.storage_prefix))return null;
   await authorize();const signed=await client.storage.from('nexo-property-images').createSignedUrl(row.jpeg_path,300);
   if(signed.error||!signed.data?.signedUrl)return null;
   const url=new URL(signed.data.signedUrl);if(url.origin!==new URL(supabaseUrl).origin||!url.pathname.startsWith('/storage/v1/object/sign/nexo-property-images/'+row.storage_prefix))return null;return url.href;
  },
  process,
  async upload(propertyId,item,{sourceKind,illustrative,onState=()=>{},active=()=>true}={}){
   const {extension,mime}=validateUploadFile(item.file);
   if(!item.alt?.trim()||item.alt.trim().length>500||!['ai','licensed','owner_authorized'].includes(sourceKind)||typeof illustrative!=='boolean'||(sourceKind==='ai'&&!illustrative))throw new UploadProblem('INVALID_REQUEST');
   const check=()=>{if(!active())throw new Error('La sesión o página cambió; la carga pendiente se conserva.');};
   onState('Validando archivo…');item.sha256??=await hashFile(item.file);check();
   // A lost reservation response may still have committed. Freeze metadata for
   // every retry of this UUID rather than replaying a different request.
   item.metadata??=Object.freeze({alt:item.alt.trim(),sourceKind,illustrative});
   onState('Preparando carga…');const row=await invoke({action:'reserve',propertyId,requestId:item.id,extension,bytes:item.file.size,sha256:item.sha256,...item.metadata});check();
   if(row.id!==item.id||row.property_id!==propertyId||row.original_object_key!==`properties/${propertyId}/${item.id}/original.${extension}`)throw new UploadProblem('UNEXPECTED_RESPONSE');
   if(row.processing_status==='ready')return row;if(row.processing_attempts>=5)throw new UploadProblem('LIMIT_REACHED');
   onState('Subiendo original…');await authorize();check();
   const upload=await client.storage.from('nexo-property-originals').upload(row.original_object_key,item.file,{contentType:mime,upsert:false,cacheControl:'0'});
   const duplicate=String(upload.error?.statusCode)==='409'||(String(upload.error?.statusCode)==='400'&&/already exists|duplicate/i.test(upload.error?.message||''));
   if(upload.error&&['401','403'].includes(String(upload.error.statusCode)))throw new UploadProblem('ORIGINAL_UPLOAD_DENIED');
   if(upload.error&&!duplicate)throw new Error('No pudimos confirmar la subida. Reintentá el mismo archivo; no se sobrescribirá ningún original.');
   check();onState('Procesando versiones optimizadas…');const result=await process(propertyId,row.id);check();return result;
  },
 };
}
