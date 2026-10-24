import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProperty, createPropertyManager, PropertyConflict } from '../assets/js/backend/property-management.js';
import { AdminAccessDenied } from '../assets/js/backend/admin-properties.js';
const zones=[{slug:'centro',name:'Centro'}],amenities=[{slug:'patio',name:'Patio'}];
const input={public_code:'nexo-test',title:' Casa ',description:'Description',property_type:'casa',operation:'venta',status:'draft',price:'100.50',currency:'USD',zone_slug:'centro',city:'Corrientes Capital',area:'100',bedrooms:'2',bathrooms:'',approximate_location:'Centro',featured:false,is_demo:true,amenities:['patio']};
function fixture({authorized=true,error=null,property=null}={}) {
 const calls=[];
 const client={auth:{getUser:async()=>({data:{user:authorized?{id:'admin'}:null}})},from(table){
  if(table==='admin_memberships')return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:'admin',enabled:true}})})})};
  calls.push(table);const result={zones,amenities,properties:property,property_amenities:[{amenity_slug:'patio'}]}[table];
  const query={select:()=>query,order:()=>query,eq:()=>query,maybeSingle:()=>query,single:()=>({then:resolve=>Promise.resolve({data:Array.isArray(result)?result[0]:result}).then(resolve)}),then:resolve=>Promise.resolve({data:result}).then(resolve)};return query;
 },rpc:(name,args)=>{calls.push({name,args});return {single:async()=>({data:{id:'id',version:2,...args.p_data},error})};}};
 return {client,calls};
}
test('validation matches numeric, text, enum, boolean, room and reference constraints',()=>{
 const result=validateProperty(input,zones,amenities);assert.equal(result.data.title,'Casa');assert.equal(result.data.bathrooms,null);assert.equal(result.data.price,'100.50');
 for(const patch of [{title:' '},{description:''},{price:'-1'},{price:'NaN'},{price:'100.001'},{price:'1e3'},{area:'0'},{price:'1000000000000'},{bedrooms:'1.2'},{bathrooms:32768},{status:'deleted'},{property_type:'office'},{currency:'EUR'},{operation:'invalid'},{zone_slug:'unknown'},{amenities:['unknown']},{featured:'true'},{public_code:'Invalid Code'}])assert.throws(()=>validateProperty({...input,...patch},zones,amenities));
 assert.throws(()=>validateProperty({...input,property_type:'terreno'},zones,amenities));
 assert.equal(validateProperty({...input,property_type:'terreno',bedrooms:'',bathrooms:''},zones,amenities).data.bedrooms,null);
 assert.deepEqual(validateProperty({...input,amenities:['patio','patio']},zones,amenities).amenities,['patio']);
 assert(!Object.hasOwn(validateProperty({...input,version:123,id:'injected'},zones,amenities).data,'version'));
});
test('unauthorized users cannot load private edit data or invoke RPC',async()=>{
 const {client,calls}=fixture({authorized:false}); const manager=createPropertyManager(client);
 await assert.rejects(()=>manager.open('id'),AdminAccessDenied);await assert.rejects(()=>manager.save(input,{zones,amenities}),AdminAccessDenied);assert.deepEqual(calls,[]);
});
test('loads property, its links, and available references without inventing fields',async()=>{
 const property={id:'id',version:5};const {client}=fixture({property});const result=await createPropertyManager(client).open('id');assert.equal(result.property,property);assert.deepEqual(result.selected,['patio']);
 const missing=fixture();await assert.rejects(()=>createPropertyManager(missing.client).open('missing'),/no existe/);
});
test('creation saves only draft through a single atomic RPC and rechecks auth',async()=>{
 const {client,calls}=fixture();const manager=createPropertyManager(client);await manager.save(input,{zones,amenities});
 assert.equal(calls.length,1);assert.equal(calls[0].name,'admin_save_property');assert.equal(calls[0].args.p_id,null);assert.equal(calls[0].args.p_version,null);
 await assert.rejects(()=>manager.save({...input,status:'published'},{zones,amenities}),/borrador/);
 client.auth.getUser=async()=>({data:{user:null}});await assert.rejects(()=>manager.save(input,{zones,amenities}),AdminAccessDenied);assert.equal(calls.length,1);
});
test('editing and all state changes carry the original ID and expected version',async()=>{
 for(const status of ['draft','published','archived']){
  const {client,calls}=fixture();await createPropertyManager(client).save({...input,status},{zones,amenities,property:{id:'existing',version:7}});
  assert.equal(calls[0].args.p_id,'existing');assert.equal(calls[0].args.p_version,7);assert.equal(calls[0].args.p_data.status,status);
 }
});
test('conflicts, duplicates, permissions, missing migration and transport errors are actionable',async()=>{
 for(const [code,expected] of [['40001',PropertyConflict],['23505',/código ya existe/],['42501',AdminAccessDenied],['PGRST202',/migración/],['unknown',/confirmar el guardado/]]){
  const {client}=fixture({error:{code}});await assert.rejects(()=>createPropertyManager(client).save(input,{zones,amenities}),expected);
 }
});
