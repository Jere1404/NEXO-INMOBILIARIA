import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminPropertyRepository, AdminAccessDenied, normalizeAdminQuery, searchExpression, formatAdminPrice, formatAdminDate } from '../assets/js/backend/admin-properties.js';
function mocked({ user=true, member=true, enabled=true, role='admin', membershipError=false, queryError=false, missingCount=false } = {}) {
  const calls=[];
  const client={ auth:{getUser:async()=>({data:{user:user?{id:'fixture',email:'fixture@example.test'}:null}})},from(table){
    if(table==='admin_memberships')return {select:()=>({eq:()=>({maybeSingle:async()=>membershipError?{error:{message:'unavailable'}}:{data:member?{role,enabled}:null}})})};
    assert.equal(table,'properties');const record={table,filters:{}};calls.push(record);
    const q={select:(fields,options)=>{record.fields=fields;record.options=options;return q;},order:(...args)=>{(record.orders??=[]).push(args);return q;},eq:(key,value)=>{record.filters[key]=value;return q;},or:value=>{record.search=value;return q;},range:(start,end)=>{record.range=[start,end];return q;},abortSignal:signal=>{record.signal=signal;return q;},then(resolve,reject){return Promise.resolve(queryError?{error:{message:'fixture-error'}}:{data:record.options.head?null:[],count:missingCount?null:record.options.head?(record.filters.status==='published'?5:record.filters.status==='draft'?6:12):12}).then(resolve,reject);}};
    return q;
  }};
  return {client,calls};
}
test('anonymous, missing, disabled or non-admin membership cannot query properties', async()=>{
 for(const config of [{user:false},{member:false},{enabled:false},{role:'viewer'}]){
  const {client,calls}=mocked(config);await assert.rejects(()=>createAdminPropertyRepository(client).load(),AdminAccessDenied);assert.equal(calls.length,0);
 }
 const {client,calls}=mocked({membershipError:true});await assert.rejects(()=>createAdminPropertyRepository(client).load());assert.equal(calls.length,0);
});
test('authorized administrator receives list and global indicators with migration schema fields', async()=>{
 const {client,calls}=mocked();const result=await createAdminPropertyRepository(client).load();
 assert.deepEqual(result.indicators,{total:12,published:5,draft:6});assert.equal(result.total,12);assert.equal(calls.length,4);
 assert.equal(calls[0].fields,'id,public_code,title,property_type,operation,price,currency,status,updated_at');
 assert.deepEqual(calls[0].range,[0,9]);assert.deepEqual(calls[0].orders,[['updated_at',{ascending:false}],['id',{ascending:true}]]);
});
test('filters, search and pagination go to server; indicators ignore list filters', async()=>{
 const {client,calls}=mocked();await createAdminPropertyRepository(client).load({search:'  Molina  ',status:'draft',type:'casa',page:1,pageSize:10});
 assert.deepEqual(calls[0].filters,{status:'draft',property_type:'casa'});assert.equal(calls[0].search,searchExpression('Molina'));assert.deepEqual(calls[0].range,[10,19]);
 assert.deepEqual(calls[1].filters,{});assert.deepEqual(calls[2].filters,{status:'published'});assert.deepEqual(calls[3].filters,{status:'draft'});
});
test('search quoting keeps PostgREST metacharacters inside values and escapes wildcards',()=>{
 assert.equal(searchExpression('Molina'),'title.ilike."%Molina%",public_code.ilike."%Molina%"');
 assert(searchExpression('a"),status.eq.published').includes('a\\"),status.eq.published'));
 assert(searchExpression('100%_').includes('100\\\\%\\\\_'));
});
test('invalid filters and excessive pages are rejected before API calls',async()=>{
 const {client,calls}=mocked();for(const options of [{status:'unknown'},{type:'unknown'},{page:-1},{pageSize:101},{page:Number.MAX_SAFE_INTEGER},{search:'x'.repeat(101)}])await assert.rejects(()=>createAdminPropertyRepository(client).load(options));assert.equal(calls.length,0);
 assert.deepEqual(normalizeAdminQuery(),{search:'',status:'',type:'',page:0,pageSize:10});
});
test('revalidates access on every request and can skip redundant indicators', async()=>{
 const {client,calls}=mocked();const repository=createAdminPropertyRepository(client);const result=await repository.load({}, {includeIndicators:false});assert.equal(result.indicators,null);assert.equal(calls.length,1);
 client.auth.getUser=async()=>({data:{user:null}});await assert.rejects(()=>repository.load(),AdminAccessDenied);assert.equal(calls.length,1);
});
test('query errors and missing counts do not fabricate zero indicators', async()=>{
 for(const options of [{queryError:true},{missingCount:true}])await assert.rejects(()=>createAdminPropertyRepository(mocked(options).client).load());
});
test('formats prices by their own currency and dates in Argentina; handles missing data',()=>{
 assert.equal(formatAdminPrice({price:'145000.00',currency:'USD',operation:'venta'}),'USD 145.000');assert.equal(formatAdminPrice({price:480000,currency:'ARS',operation:'alquiler'}),'ARS 480.000 / mes');assert.equal(formatAdminPrice({price:null,currency:'ARS'}),'No informado');assert.equal(formatAdminDate(null),'No informada');assert.equal(formatAdminDate('invalid'),'No informada');assert(formatAdminDate('2026-10-24T12:00:00Z').match(/(?:^|\D)0?9:00/));
});
