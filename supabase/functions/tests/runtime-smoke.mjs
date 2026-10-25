// Optional integration test. ALL HTTP is local; never contacts a Supabase project.
import assert from 'node:assert/strict';import {createServer} from 'node:http';import {spawn} from 'node:child_process';import {readFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import {inspectImage,sha256} from '../_shared/image-pipeline.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const source=new Uint8Array(await readFile(new URL('../../../assets/images/propiedades/nexo-001/principal-960.jpg',import.meta.url)));
const actor='11111111-1111-4111-8111-111111111111',property='22222222-2222-4222-8222-222222222222',image='33333333-3333-4333-8333-333333333333',token='44444444-4444-4444-8444-444444444444';
const row={id:image,property_id:property,storage_kind:'managed',original_extension:'jpg',original_bytes:source.length,original_sha256:await sha256(source),processing_status:'pending',processing_token:token,storage_prefix:`properties/${property}/${image}/`,original_object_key:`properties/${property}/${image}/original.jpg`,processing_attempts:1};
const uploaded=new Map();let staged=[],finalized=false,child,logs='';
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');const chunks=[];for await(const part of req)chunks.push(part);const bytes=Buffer.concat(chunks);
  const json=value=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(value));};
  if(url.pathname==='/auth/v1/user'){assert.equal(req.headers.authorization,'Bearer local-user-fixture');return json({id:actor,email:'fixture@example.test'});}
  if(url.pathname==='/rest/v1/admin_memberships')return json({role:'admin',enabled:true});
  assert.equal(req.headers.authorization,'Bearer local-server-fixture');
  if(url.pathname.startsWith('/rest/v1/rpc/')){
   const name=url.pathname.split('/').at(-1),body=JSON.parse(bytes.toString());assert.equal(body.p_actor,actor);
   if(name==='nexo_service_stage_image'){staged=body.p_keys;res.statusCode=204;return res.end();}
   if(name==='nexo_service_finalize_image'){
    assert.equal(uploaded.size,4);assert.equal(body.p_sha256,row.original_sha256);assert.equal(staged.length,4);
    for(const variant of body.p_manifest){const path=`${row.storage_prefix}v-${token}-${variant.width}.${variant.format}`;assert(staged.includes(path));const actual=inspectImage(uploaded.get(path));assert.equal(actual.width,variant.width);assert.equal(actual.height,variant.height);assert.equal(uploaded.get(path).length,variant.bytes);}
    row.processing_status='ready';finalized=true;
   }
   return json(row);
  }
  if(url.pathname==='/storage/v1/object/nexo-property-originals/'+row.original_object_key){res.setHeader('content-type','image/jpeg');return res.end(source);}
  if(url.pathname.startsWith('/storage/v1/object/nexo-property-images/')){
   const key=url.pathname.slice('/storage/v1/object/nexo-property-images/'.length);assert(staged.includes(key));assert.equal(req.method,'POST');assert(!uploaded.has(key));uploaded.set(key,new Uint8Array(bytes));return json({Key:key});
  }
  throw new Error('Unexpected local request '+req.method+' '+url.pathname);
 }catch(error){res.statusCode=500;res.end(JSON.stringify({error:error.message}));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
 const binary=process.env.NEXO_DENO||'deno';
 child=spawn(binary,['run','--node-modules-dir=none','--config',root+'supabase/functions/nexo-property-image/deno.json','--allow-env','--allow-net=127.0.0.1,0.0.0.0:8000','--allow-read='+root+'supabase/functions/nexo-property-image/magick.wasm',root+'supabase/functions/nexo-property-image/index.js'],{cwd:root,env:{...process.env,SUPABASE_URL:`http://127.0.0.1:${server.address().port}`,NEXO_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_local_fixture',SUPABASE_SERVICE_ROLE_KEY:'local-server-fixture',NEXO_ALLOWED_ORIGINS:'http://127.0.0.1:8011'},stdio:['ignore','pipe','pipe']});
 child.stderr.on('data',data=>{logs+=data.toString();});child.stdout.on('data',data=>{logs+=data.toString();});
 let started=false;
 for(let attempt=0;attempt<80;attempt++){
  if(child.exitCode!==null)throw new Error('Deno exited: '+logs);
  try{await fetch('http://127.0.0.1:8000',{method:'OPTIONS',headers:{origin:'http://127.0.0.1:8011'}});started=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}
 }
 assert(started,'Local worker did not start: '+logs);
 const response=await fetch('http://127.0.0.1:8000',{method:'POST',headers:{origin:'http://127.0.0.1:8011',authorization:'Bearer local-user-fixture','content-type':'application/json'},body:JSON.stringify({action:'process',propertyId:property,imageId:image})});
 const result=await response.json();assert.equal(response.status,200,JSON.stringify(result)+' '+logs);assert.equal(result.processing_status,'ready');assert(finalized);
 console.log('PASS: Deno + official Supabase SDK + real WASM encoder + local HTTP API: 4 verified derivatives before finalization. No cloud requests.');
}finally{child?.kill('SIGTERM');await new Promise(resolve=>server.close(resolve));}
