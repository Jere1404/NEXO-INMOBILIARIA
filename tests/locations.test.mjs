import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocationRepository, locationName } from '../assets/js/backend/locations.js';
import { AdminAccessDenied } from '../assets/js/backend/admin-properties.js';

function fixture({user=true,enabled=true,error=null,pages=[[{slug:'new-zone',name:'Centro',locality_id:'local'}]]}={}) {
  const calls=[];const client={auth:{getUser:async()=>({data:{user:user?{id:'admin'}:null}})},
    from(table){
      if(table==='admin_memberships')return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:'admin',enabled}})})})};
      const call={table};calls.push(call);let offset=0;
      const query={select:fields=>{call.fields=fields;return query;},order:()=>query,eq:(key,value)=>{call.filter=[key,value];return query;},range:(start,end)=>{offset=start;call.range=[start,end];return query;},single:async()=>({data:{id:'local',province_code:'18',name:'Corrientes Capital'},error}),then:resolve=>Promise.resolve({data:pages[offset/500] || [],error}).then(resolve)};return query;
    },rpc:(name,args)=>{calls.push({name,args});return {single:async()=>({data:{slug:'new-zone',locality_id:'local'},error})};}};
  return {client,calls};
}
test('location names are trimmed and whitespace-normalized without changing display accents',()=>{
 assert.equal(locationName('  Cambá   Cuá '),'Cambá Cuá');for(const value of ['',null,' ', 'x'.repeat(101)])assert.throws(()=>locationName(value));
});
test('anonymous and disabled members cannot load or create administrative locations',async()=>{
 for(const config of [{user:false},{enabled:false}]){
  const {client,calls}=fixture(config);const repo=createLocationRepository(client);
  await assert.rejects(()=>repo.provinces(),AdminAccessDenied);await assert.rejects(()=>repo.create('18','Goya','Centro'),AdminAccessDenied);assert.deepEqual(calls,[]);
 }
});
test('locations are scoped by province/locality and paginated without truncating at 500',async()=>{
 const {client,calls}=fixture({pages:[Array.from({length:500},(_,i)=>({id:i})),[{id:500}]]});
 const repo=createLocationRepository(client);assert.equal((await repo.localities('18')).length,501);
 assert.deepEqual(calls[0].filter,['province_code','18']);assert.deepEqual(calls[1].range,[500,999]);
 await repo.zones('local');assert.deepEqual(calls[2].filter,['locality_id','local']);
});
test('creation uses one authorized RPC with normalized names and rejects malformed inputs',async()=>{
 const {client,calls}=fixture();const repo=createLocationRepository(client);
 await repo.create('18','  Goya ',' Centro ');assert.deepEqual(calls[0],{name:'admin_create_location',args:{p_province:'18',p_locality:'Goya',p_zone:'Centro'}});
 for(const args of [['99x','Goya','Centro'],['18',' ','Centro'],['18','Goya','']])await assert.rejects(()=>repo.create(...args));
 assert.equal(calls.length,1);
});
test('database errors and missing migrations are not shown as successful saves',async()=>{
 const {client}=fixture({error:{code:'PGRST202'}});const repo=createLocationRepository(client);
 await assert.rejects(()=>repo.provinces(),/migración V5B.3/);await assert.rejects(()=>repo.create('18','Goya','Centro'),/confirmar/);
 const denied=fixture({error:{code:'42501'}});await assert.rejects(()=>createLocationRepository(denied.client).create('18','Goya','Centro'),AdminAccessDenied);
});
