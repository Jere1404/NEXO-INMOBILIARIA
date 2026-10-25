import { ImageProblem, processOriginal, MAX_BYTES } from './image-pipeline.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const problem=(code,status=400)=>{throw new ImageProblem(code,status);};
function rpcError(error){
 const codes={'42501':['ACCESS_DENIED',403],'55P03':['PROCESSING_BUSY',409],'54000':['LIMIT_REACHED',409],'40001':['ATTEMPT_CHANGED',409],'PGRST202':['MIGRATION_REQUIRED',503],'22023':['INVALID_REQUEST',400]};
 const [code,status]=codes[error?.code]||['BACKEND_UNAVAILABLE',503];return new ImageProblem(code,status);
}
async function rowRPC(client,name,args){const result=await client.rpc(name,args).single();if(result.error)throw rpcError(result.error);if(!result.data?.id)problem('BACKEND_UNAVAILABLE',503);return result.data;}
async function voidRPC(client,name,args){const result=await client.rpc(name,args);if(result.error)throw rpcError(result.error);}
const summary=row=>({id:row.id,property_id:row.property_id,processing_status:row.processing_status,original_object_key:row.original_object_key,processing_attempts:row.processing_attempts});
async function boundedJSON(request){
 if(!request.headers.get('content-type')?.startsWith('application/json'))problem('INVALID_REQUEST',415);
 const reader=request.body?.getReader();if(!reader)problem('INVALID_REQUEST');let count=0;const chunks=[];
 try{while(true){const {value,done}=await reader.read();if(done)break;count+=value.length;if(count>8192){await reader.cancel();problem('INVALID_REQUEST',413);}chunks.push(value);}}
 finally{reader.releaseLock();}
 const buffer=new Uint8Array(count);let offset=0;for(const part of chunks){buffer.set(part,offset);offset+=part.length;}
 try{const body=JSON.parse(new TextDecoder().decode(buffer));if(!body||Array.isArray(body)||typeof body!=='object')problem('INVALID_REQUEST');return body;}catch{problem('INVALID_REQUEST');}
}
export function createImageHandler({publicClient,serverClient,codec,allowedOrigins}){
 let processing=false;
 return async request=>{
  const origin=request.headers.get('origin');const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if(!allowedOrigins.includes(origin))return new Response(JSON.stringify({code:'ORIGIN_DENIED'}),{status:403,headers});
  headers['Access-Control-Allow-Origin']=origin;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Max-Age':'300'}});
  if(request.method!=='POST')return new Response(JSON.stringify({code:'METHOD_NOT_ALLOWED'}),{status:405,headers});
  try{
   const bearer=request.headers.get('authorization');if(!bearer?.startsWith('Bearer ')||bearer.length>8192)problem('AUTH_REQUIRED',401);
   // Validation happens before constructing a privileged client or decoding files.
   const userClient=publicClient(bearer);const identity=await userClient.auth.getUser(bearer.slice(7));
   if(identity.error||!identity.data?.user?.id)problem('AUTH_REQUIRED',401);
   const actor=identity.data.user.id;const membership=await userClient.from('admin_memberships').select('role,enabled').eq('user_id',actor).maybeSingle();
   if(membership.error)problem('BACKEND_UNAVAILABLE',503);if(!membership.data?.enabled||membership.data.role!=='admin')problem('ACCESS_DENIED',403);
   const body=await boundedJSON(request);const allowed=body.action==='reserve'?['action','propertyId','requestId','extension','bytes','sha256','alt','sourceKind','illustrative']:body.action==='process'?['action','propertyId','imageId']:[];
   if(!allowed.length||Object.keys(body).some(key=>!allowed.includes(key))||!UUID.test(body.propertyId||''))problem('INVALID_REQUEST');
   const server=serverClient();
   if(body.action==='reserve'){
    if(!UUID.test(body.requestId||'')||!['jpg','png','webp'].includes(body.extension)||!Number.isSafeInteger(body.bytes)||body.bytes<1||body.bytes>MAX_BYTES||!/^[a-f0-9]{64}$/.test(body.sha256||'')||typeof body.alt!=='string'||!body.alt.trim()||body.alt.trim().length>500||!['ai','licensed','owner_authorized'].includes(body.sourceKind)||typeof body.illustrative!=='boolean')problem('INVALID_REQUEST');
    const row=await rowRPC(server,'nexo_service_reserve_image',{p_actor:actor,p_property:body.propertyId,p_request:body.requestId,p_extension:body.extension,p_bytes:body.bytes,p_sha256:body.sha256,p_alt:body.alt.trim(),p_source:body.sourceKind,p_illustrative:body.illustrative});
    return new Response(JSON.stringify(summary(row)),{status:200,headers});
   }
   if(!UUID.test(body.imageId||''))problem('INVALID_REQUEST');
   if(processing)problem('PROCESSING_BUSY',409);processing=true;
   try {
   const args={p_actor:actor,p_property:body.propertyId,p_image:body.imageId};
   const row=await rowRPC(server,'nexo_service_claim_image',args);if(row.processing_status==='ready')return new Response(JSON.stringify(summary(row)),{headers});
   const token=row.processing_token;const keys=[];
   try{
    const source=await server.storage.from('nexo-property-originals').download(row.original_object_key);
    if(source.error||!source.data)problem('ORIGINAL_MISSING',409);
    if(source.data.size!==Number(row.original_bytes)||source.data.size>MAX_BYTES)problem('ORIGINAL_MISMATCH');
    const processed=await processOriginal(new Uint8Array(await source.data.arrayBuffer()),row,codec);
    // Recheck revocation and attempt after CPU work, before writing derivatives.
    const current=await rowRPC(server,'nexo_service_get_image',args);if(current.processing_token!==token||current.cleanup_requested_at)problem('ATTEMPT_CHANGED',409);
    for(const variant of processed.variants)keys.push(`${row.storage_prefix}v-${token}-${variant.width}.${variant.format}`);
    await voidRPC(server,'nexo_service_stage_image',{...args,p_token:token,p_keys:keys});
    for(const [index,variant] of processed.variants.entries()){
     const upload=await server.storage.from('nexo-property-images').upload(keys[index],variant.data,{contentType:variant.format==='jpg'?'image/jpeg':'image/webp',upsert:false,cacheControl:'300'});
     if(upload.error)problem('VARIANT_UPLOAD_FAILED',503);
    }
    const ready=await rowRPC(server,'nexo_service_finalize_image',{...args,p_token:token,p_sha256:processed.sha256,p_width:processed.width,p_height:processed.height,p_manifest:processed.variants.map(v=>({format:v.format,width:v.width,height:v.height,bytes:v.data.length}))});
    return new Response(JSON.stringify(summary(ready)),{headers});
   }catch(error){
    // A lost finalization response must NEVER delete already promoted files.
    let current;try{current=await rowRPC(server,'nexo_service_get_image',args);}catch{ /* Keep private staged keys for reconciliation. */ }
    if(current?.processing_status==='ready'&&current.processing_token===token)return new Response(JSON.stringify(summary(current)),{headers});
    const code=error instanceof ImageProblem?error.code:'PROCESSING_FAILED';
    // The earlier SELECT may have raced an uncommitted finalization. Only a
    // confirmed failure RPC synchronizes with its row locks. Then read again;
    // never delete from the stale snapshot or after an uncertain failure RPC.
    let failureConfirmed=false;
    try{await voidRPC(server,'nexo_service_fail_image',{...args,p_token:token,p_code:code});failureConfirmed=true;}catch{ /* Durable attempt ledger remains. */ }
    if(failureConfirmed){
     let settled;try{settled=await rowRPC(server,'nexo_service_get_image',args);}catch{ /* No cleanup without a confirmed settled state. */ }
     if(settled?.processing_status==='ready'&&settled.processing_token===token)return new Response(JSON.stringify(summary(settled)),{headers});
     const safeToClean=settled&&(settled.processing_token!==token||settled.processing_status==='failed');
     if(safeToClean&&keys.length){
      try{const deleted=await server.storage.from('nexo-property-images').remove(keys);if(!deleted.error)await voidRPC(server,'nexo_service_cleanup_attempt',{p_actor:actor,p_image:body.imageId,p_token:token});}catch{ /* Cleanup stays pending in the ledger. */ }
     }
    }
    throw error;
   }
   } finally { processing=false; }
  }catch(error){const result=error instanceof ImageProblem?error:new ImageProblem('BACKEND_UNAVAILABLE',503);return new Response(JSON.stringify({code:result.code}),{status:result.status,headers});}
 };
}
