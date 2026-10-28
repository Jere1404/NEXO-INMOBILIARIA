import test from 'node:test';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createImageUploads,validateUploadFile,legacyPreview,UploadProblem,uploadErrorMessage } from '../assets/js/backend/image-uploads.js';
import { AdminAccessDenied } from '../assets/js/backend/admin-properties.js';
const jpeg=new Uint8Array(await readFile(new URL('../assets/images/propiedades/nexo-001/principal-480.jpg',import.meta.url)));
const property='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
function fixture({authorized=true,uploadError=null,edgeError=null,ready=false,forged=false,processStatus='ready',foreignProcess=false}={}){
 const calls=[];const client={auth:{getUser:async()=>({data:{user:authorized?{id:'admin'}:null}})},from(table){
  if(table==='admin_memberships')return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:'admin',enabled:true}})})})};
  const q={select:()=>q,eq:()=>q,is:()=>q,order:()=>q,then:resolve=>Promise.resolve({data:[]}).then(resolve)};return q;
 },functions:{invoke:async(name,{body})=>{calls.push({name,body});return edgeError?{error:{context:{json:async()=>({code:edgeError})}}}:{data:{id:body.requestId||body.imageId,property_id:body.action==='process'&&foreignProcess?'other-property':property,processing_status:body.action==='process'?processStatus:ready?'ready':'pending',original_object_key:forged?'forged':`properties/${property}/${id}/original.jpg`,processing_attempts:0}};}},storage:{from:bucket=>({upload:async(key,file,options)=>{calls.push({bucket,key,options});return {error:uploadError};},createSignedUrl:async()=>({data:{signedUrl:'https://unexpected.example/photo.jpg'}})})}};return {client,calls};
}
const item=()=>({id,file:new File([jpeg],'foto.jpg',{type:'image/jpeg'}),alt:'Patio de la propiedad'});
test('client rejects unsupported MIME/extensions and excessive file sizes before uploads',()=>{
 assert.equal(validateUploadFile(item().file).extension,'jpg');assert.equal(validateUploadFile({name:'Foto.JPEG',type:'image/jpeg',size:100}).extension,'jpg');
 for(const file of [{name:'x.svg',type:'image/svg+xml',size:10},{name:'x.png',type:'image/jpeg',size:10},{name:'x.jpg',type:'image/jpeg',size:10485761},{name:'x.jpg',type:'image/jpeg',size:0}])assert.throws(()=>validateUploadFile(file));
});
test('authorized upload uses the official client, deterministic original key, no overwrite and server processing',async()=>{
 const {client,calls}=fixture();const file=item();const result=await createImageUploads(client).upload(property,file,{sourceKind:'ai',illustrative:true});assert.equal(result.processing_status,'ready');
 assert.equal(calls[0].body.action,'reserve');assert.match(calls[0].body.sha256,/^[a-f0-9]{64}$/);assert.equal(calls[1].bucket,'nexo-property-originals');assert.equal(calls[1].key,`properties/${property}/${id}/original.jpg`);assert.equal(calls[1].options.upsert,false);assert.equal(calls[2].body.action,'process');
 assert(!calls.some(call=>JSON.stringify(call).includes('service_role')));
});
test('anonymous users and invalid image metadata never write; a changed binding is rejected',async()=>{
 const anonymous=fixture({authorized:false});await assert.rejects(()=>createImageUploads(anonymous.client).upload(property,item(),{sourceKind:'ai',illustrative:true}),AdminAccessDenied);assert.equal(anonymous.calls.length,0);
 const forged=fixture({forged:true});await assert.rejects(()=>createImageUploads(forged.client).upload(property,item(),{sourceKind:'ai',illustrative:true}),UploadProblem);assert.equal(forged.calls.length,1);
 const invalid=fixture();await assert.rejects(()=>createImageUploads(invalid.client).upload(property,item(),{sourceKind:'ai',illustrative:false}),UploadProblem);assert.equal(invalid.calls.length,0);
});
test('existing originals are verified by backend on retry, and completed reservations skip reupload',async()=>{
 const duplicate=fixture({uploadError:{statusCode:'409'}});await createImageUploads(duplicate.client).upload(property,item(),{sourceKind:'licensed',illustrative:true});assert.equal(duplicate.calls.at(-1).body.action,'process');
 const done=fixture({ready:true});await createImageUploads(done.client).upload(property,item(),{sourceKind:'licensed',illustrative:true});assert.equal(done.calls.length,1);
});
test('network failure preserves request identity and never marks an image ready on the client',async()=>{
 const {client,calls}=fixture({uploadError:{statusCode:'0'}});const file=item();await assert.rejects(()=>createImageUploads(client).upload(property,file,{sourceKind:'ai',illustrative:true}),/confirmar la subida/);
 assert.equal(file.id,id);assert.equal(calls.length,2);assert(!calls.some(call=>call.body?.action==='process'));
 const denied=fixture({edgeError:'ACCESS_DENIED'});await assert.rejects(()=>createImageUploads(denied.client).process(property,id),AdminAccessDenied);
});
test('legacy previews preserve relative GitHub Pages base and reject external image references',async()=>{
 const row={jpeg_path:'assets/images/propiedades/nexo-001/principal-960.jpg',width:960,height:720,alt:'Patio',webp_variants:[],jpeg_variants:[]};
 assert.equal(legacyPreview(row,'https://example.test/NEXO/'),'https://example.test/NEXO/'+row.jpeg_path);assert.equal(legacyPreview({...row,jpeg_path:'https://evil.test/x.jpg'},'https://example.test/'),null);
 const {client}=fixture();assert.equal(await createImageUploads(client).preview({storage_kind:'managed',processing_status:'ready',storage_prefix:'properties/a/b/',jpeg_path:'properties/a/b/960.jpg'},'https://example.test/','https://project.supabase.co'),null);
});

test('reservation retries preserve the original metadata and UUID after an uncertain upload',async()=>{
 const first=fixture({uploadError:{statusCode:'0'}});const photo=item();
 await assert.rejects(()=>createImageUploads(first.client).upload(property,photo,{sourceKind:'ai',illustrative:true}));
 photo.alt='Descripción modificada';const second=fixture();
 await createImageUploads(second.client).upload(property,photo,{sourceKind:'licensed',illustrative:false});
 assert.deepEqual(second.calls[0].body,first.calls[0].body);assert(Object.isFrozen(photo.metadata));
});
test('even a ready reservation must match this image and property before skipping upload',async()=>{
 const forged=fixture({ready:true,forged:true});
 await assert.rejects(()=>createImageUploads(forged.client).upload(property,item(),{sourceKind:'ai',illustrative:true}),e=>e.code==='UNEXPECTED_RESPONSE');
 assert.equal(forged.calls.length,1);
});
test('processing never reports success for a foreign image binding or a non-ready result',async()=>{
 for(const options of [{foreignProcess:true},{processStatus:'pending'},{processStatus:'failed'}]){
  const f=fixture(options);await assert.rejects(()=>createImageUploads(f.client).process(property,id),e=>e.code==='UNEXPECTED_RESPONSE');
 }
});
test('storage permission failures and safe backend error codes have actionable messages',async()=>{
 const f=fixture({uploadError:{statusCode:'403'}});
 await assert.rejects(()=>createImageUploads(f.client).upload(property,item(),{sourceKind:'ai',illustrative:true}),e=>e.code==='ORIGINAL_UPLOAD_DENIED');
 assert(!f.calls.some(call=>call.body?.action==='process'));
 assert.match(uploadErrorMessage('ORIGIN_DENIED'),/dominio/);assert.match(uploadErrorMessage('DECODE_FAILED'),/decodificar/);
 assert(!uploadErrorMessage('<script>secret</script>').includes('script'));
 assert.equal(uploadErrorMessage('constructor'),uploadErrorMessage('unknown'));assert.equal(uploadErrorMessage('toString'),uploadErrorMessage('unknown'));
});

test('replacement uploads bind source and reuse the request identity on retries',async()=>{
 const {client,calls}=fixture();const file=item();file.sourceImageId='33333333-3333-4333-8333-333333333333';
 await createImageUploads(client).upload(property,file,{sourceKind:'ai',illustrative:true});
 assert.equal(calls[0].body.action,'prepareReplacement');assert.equal(calls[0].body.sourceImageId,file.sourceImageId);assert.equal(calls[0].body.requestId,id);
 await createImageUploads(client).upload(property,file,{sourceKind:'ai',illustrative:true});assert.equal(calls[3].body.requestId,id);
});
