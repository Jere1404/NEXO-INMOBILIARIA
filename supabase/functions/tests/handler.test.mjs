import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createImageHandler} from '../_shared/handler.mjs';import {sha256} from '../_shared/image-pipeline.mjs';
const jpeg=new Uint8Array(await readFile(new URL('../../../assets/images/propiedades/nexo-001/principal-480.jpg',import.meta.url)));
const webp=new Uint8Array(await readFile(new URL('../../../assets/images/propiedades/nexo-001/principal-480.webp',import.meta.url)));
const hash=await sha256(jpeg),actor='11111111-1111-4111-8111-111111111111',property='22222222-2222-4222-8222-222222222222',image='33333333-3333-4333-8333-333333333333',token='44444444-4444-4444-8444-444444444444',origin='https://jere1404.github.io';
function fixture({validUser=true,enabled=true,uploadFailure=false,lostFinalize=false,badOriginal=false,unknownState=false,decodeGate=null,lateFinalize=false,failUncertain=false,uploadFailureAt=null,inactiveCandidate=false}={}){
 const calls=[];let factories=0,decoded=0,uploads=0;const row={id:image,property_id:property,storage_kind:'managed',image_active:!inactiveCandidate,original_extension:'jpg',original_bytes:jpeg.length,original_sha256:hash,processing_status:'pending',processing_token:token,storage_prefix:`properties/${property}/${image}/`,original_object_key:`properties/${property}/${image}/original.jpg`,processing_attempts:1};
 const publicClient=()=>({auth:{getUser:async()=>({data:{user:validUser?{id:actor}:null}})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{enabled,role:'admin'}})})})})});
 const server={rpc(name,args){
  const run=async()=>{
   calls.push({name,args});
   if(name==='nexo_service_get_image'&&unknownState) return {error:{code:'08000'}};
   if(name==='nexo_service_finalize_image'){if(lateFinalize||failUncertain)return {error:{code:'08000'}};row.processing_status='ready';if(lostFinalize)return {error:{code:'08000'}};}
   if(name==='nexo_service_fail_image'){if(lateFinalize)row.processing_status='ready';if(failUncertain)return {error:{code:'08000'}};if(row.processing_status!=='ready')row.processing_status='failed';}
   return {data:{...row}};
  };return {single:run,then:(resolve,reject)=>run().then(resolve,reject)};
 },storage:{from:bucket=>({download:async()=>({data:new Blob([badOriginal?new Uint8Array(jpeg.length):jpeg])}),upload:async(key,data,options)=>{calls.push({upload:key,bucket,options});uploads++;return uploadFailure||uploads===uploadFailureAt?{error:{message:'fixture'}}:{};},remove:async keys=>{calls.push({removed:keys});return {};}})}};
 const handler=createImageHandler({publicClient,serverClient:()=>{factories++;return server;},allowedOrigins:[origin],codec:{encode:async()=>{decoded++;if(decodeGate)await decodeGate;return {width:480,height:360,variants:[{format:'jpg',width:480,height:360,data:jpeg},{format:'webp',width:480,height:360,data:webp}]};}}});
 const request=(body,headers={})=>new Request('https://fixture/functions/v1/nexo-property-image',{method:'POST',headers:{origin,authorization:'Bearer verified-fixture','content-type':'application/json',...headers},body:JSON.stringify(body)});
 return {handler,request,calls,stats:()=>({factories,decoded})};
}
const processBody={action:'process',propertyId:property,imageId:image};
test('missing/invalid identities and disabled memberships are rejected before server client construction',async()=>{
 for(const config of [{validUser:false},{enabled:false}]){const f=fixture(config);const r=await f.handler(f.request(processBody));assert([401,403].includes(r.status));assert.equal(f.stats().factories,0);assert.equal(f.stats().decoded,0);}
 const f=fixture();const req=f.request(processBody);req.headers.delete('authorization');assert.equal((await f.handler(req)).status,401);assert.equal(f.stats().factories,0);
});
test('origin, body bounds and forged actors/paths are rejected; CORS preflight grants no processing',async()=>{
 const f=fixture();assert.equal((await f.handler(f.request(processBody,{origin:'https://evil.test'}))).status,403);
 assert.equal((await f.handler(f.request({...processBody,p_actor:actor}))).status,400);assert.equal(f.stats().factories,0);
 const huge=f.request({...processBody,padding:'x'.repeat(9000)});assert.equal((await f.handler(huge)).status,413);
 const options=await f.handler(new Request('https://fixture',{method:'OPTIONS',headers:{origin}}));assert.equal(options.status,204);assert.equal(f.stats().factories,0);
});
test('reservation actor comes from getUser and only sanitized metadata reaches the trusted RPC',async()=>{
 const f=fixture();const response=await f.handler(f.request({action:'reserve',propertyId:property,requestId:image,extension:'jpg',bytes:jpeg.length,sha256:hash,alt:' Patio ',sourceKind:'ai',illustrative:true}));assert.equal(response.status,200);assert.equal(f.calls[0].args.p_actor,actor);assert.equal(f.calls[0].args.p_alt,'Patio');assert.equal(f.stats().decoded,0);
});
test('verified original is staged and uploaded before finalization; no overwrite or client-supplied key',async()=>{
 const f=fixture();const response=await f.handler(f.request(processBody));assert.equal(response.status,200);assert.equal((await response.json()).processing_status,'ready');
 const stage=f.calls.findIndex(c=>c.name==='nexo_service_stage_image'),upload=f.calls.findIndex(c=>c.upload),final=f.calls.findIndex(c=>c.name==='nexo_service_finalize_image');assert(stage<upload&&upload<final);
 assert(f.calls.filter(c=>c.upload).every(c=>c.upload.startsWith(`properties/${property}/${image}/v-${token}-`)&&c.options.upsert===false));
});
test('invalid original never produces derivatives or ready state',async()=>{
 const f=fixture({badOriginal:true});const response=await f.handler(f.request(processBody));assert.equal(response.status,400);assert(!f.calls.some(c=>c.upload||c.name==='nexo_service_finalize_image'));assert(f.calls.some(c=>c.name==='nexo_service_fail_image'));
});
test('partial output failure cleans only this staged attempt and leaves a retryable failed record',async()=>{
 const f=fixture({uploadFailure:true});const response=await f.handler(f.request(processBody));assert.equal(response.status,503);assert(f.calls.some(c=>c.name==='nexo_service_fail_image'));assert.equal(f.calls.find(c=>c.removed).removed.length,2);assert(f.calls.some(c=>c.name==='nexo_service_cleanup_attempt'));assert(!f.calls.some(c=>c.name==='nexo_service_finalize_image'));
});
test('lost successful finalization response recovers ready without deleting promoted files',async()=>{
 const f=fixture({lostFinalize:true});const response=await f.handler(f.request(processBody));assert.equal(response.status,200);assert.equal((await response.json()).processing_status,'ready');assert(!f.calls.some(c=>c.removed));
});
test('uncertain database state retains private objects for reconciliation instead of blind deletion',async()=>{
 const f=fixture({unknownState:true});const response=await f.handler(f.request(processBody));assert.equal(response.status,503);assert(!f.calls.some(c=>c.removed||c.name==='nexo_service_finalize_image'));
});

test('a busy worker rejects parallel processing before claiming another image',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});const f=fixture({decodeGate:gate});
 const first=f.handler(f.request(processBody));
 while(f.stats().decoded===0)await new Promise(resolve=>setTimeout(resolve,1));
 const second=await f.handler(f.request(processBody));assert.equal(second.status,409);assert.equal((await second.json()).code,'PROCESSING_BUSY');
 assert.equal(f.calls.filter(c=>c.name==='nexo_service_claim_image').length,1);release();assert.equal((await first).status,200);
});

test('a finalization committing after the first recovery read must not lose its ready objects',async()=>{
 const f=fixture({lateFinalize:true});const response=await f.handler(f.request(processBody));assert.equal(response.status,200);assert.equal((await response.json()).processing_status,'ready');assert(!f.calls.some(c=>c.removed));assert.equal(f.calls.filter(c=>c.name==='nexo_service_get_image').length,3);
});
test('an uncertain failure RPC never authorizes deletion using an earlier pending snapshot',async()=>{
 const f=fixture({failUncertain:true});const response=await f.handler(f.request(processBody));assert.equal(response.status,503);assert(!f.calls.some(c=>c.removed||c.name==='nexo_service_cleanup_attempt'));
});
test('failure on the last variant prevents finalization despite earlier successful uploads',async()=>{
 const f=fixture({uploadFailureAt:2});const response=await f.handler(f.request(processBody));assert.equal(response.status,503);assert.equal(f.calls.filter(c=>c.upload).length,2);assert(!f.calls.some(c=>c.name==='nexo_service_finalize_image'));
});

test('replacement preparation passes only verified actor and validated source to its RPC',async()=>{
 const f=fixture();const r=await f.handler(f.request({action:'prepareReplacement',propertyId:property,sourceImageId:token,requestId:image,extension:'jpg',bytes:jpeg.length,sha256:hash,alt:' Candidata ',sourceKind:'ai',illustrative:true}));
 assert.equal(r.status,200);assert.equal(f.calls[0].name,'nexo_service_prepare_replacement');assert.equal(f.calls[0].args.p_source,token);assert.equal(f.calls[0].args.p_source_kind,'ai');assert.equal(f.calls[0].args.p_actor,actor);assert.equal(f.stats().decoded,0);
 const bad=await f.handler(f.request({action:'prepareReplacement',propertyId:property,sourceImageId:'bad',requestId:image,extension:'jpg',bytes:jpeg.length,sha256:hash,alt:'Candidata',sourceKind:'ai',illustrative:true}));assert.equal(bad.status,400);
});
test('replacement confirmation/reversion reject forged fields and revoked administrators',async()=>{
 for(const action of ['confirmReplacement','revertReplacement']){
  const f=fixture();const r=await f.handler(f.request({action,propertyId:property,requestId:image}));assert.equal(r.status,200);assert.equal(f.calls[0].name,action==='confirmReplacement'?'nexo_service_confirm_replacement':'nexo_service_revert_replacement');assert.equal(f.calls[0].args.p_actor,actor);assert.equal(f.stats().decoded,0);
  assert.equal((await f.handler(f.request({action,propertyId:property,requestId:image,p_actor:token}))).status,400);
  const denied=fixture({enabled:false});assert.equal((await denied.handler(denied.request({action,propertyId:property,requestId:image}))).status,403);assert.equal(denied.stats().factories,0);
 }
});

test('failed replacement processing retains staged objects and never performs physical cleanup',async()=>{
 const f=fixture({inactiveCandidate:true,uploadFailure:true});const response=await f.handler(f.request(processBody));assert.equal(response.status,503);assert(f.calls.some(c=>c.name==='nexo_service_fail_image'));assert(!f.calls.some(c=>c.removed||c.name==='nexo_service_cleanup_attempt'));
});
