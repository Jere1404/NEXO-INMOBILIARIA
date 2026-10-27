import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createClient} from '../assets/vendor/supabase-js.js';
import {createPublicCatalogHandler} from '../supabase/functions/_shared/public-catalog-handler.mjs';
const origin='https://jere1404.github.io',project='https://fixture.supabase.co';
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const makeProperty=(n,overrides={})=>({id:uuid(n),public_code:`nexo-${String(n).padStart(3,'0')}`,status:'published',title:'Casa '+n,description:'Descripción existente',property_type:'casa',operation:'venta',price:100+n,currency:'USD',zone_slug:'centro',city:'Corrientes Capital',area:90+n,area_unit:'m²',bedrooms:2,bathrooms:1,featured:true,is_demo:true,created_at:`2026-10-${String(n).padStart(2,'0')}`,zone:{name:'Centro',locality:{id:uuid(100),province_code:'18'}},property_amenities:[{amenity_slug:'patio'},{amenity_slug:'cochera'}],approximate_location:'Zona Centro',...overrides});
const makeImage=(n,overrides={})=>{const prefix=`properties/${uuid(n)}/${uuid(1000+n)}/`,token=uuid(2000+n);return {id:uuid(1000+n),property_id:uuid(n),position:0,is_primary:true,storage_kind:'managed',processing_status:'ready',cleanup_requested_at:null,width:960,height:720,alt:'Frente',source_kind:'ai',illustrative:true,storage_prefix:prefix,processing_token:token,processed_at:'2026-10-27T00:00:00Z',original_sha256:'a'.repeat(64),verified_sha256:'a'.repeat(64),jpeg_path:`${prefix}v-${token}-960.jpg`,webp_variants:[480,960].map(width=>({src:`${prefix}v-${token}-${width}.webp`,width})),jpeg_variants:[480,960].map(width=>({src:`${prefix}v-${token}-${width}.jpg`,width})),...overrides};};
function fixture({properties=[makeProperty(1)],photos=[makeImage(1)],partial=false,storageFailure=false,dbFailure=false,revokeAt=0,delay=false,rangeError=false,countFailure=false}={}){
 const calls=[];let rechecks=0,factories=0;
 const fetch=async(input,init={})=>{
  const url=new URL(input);const headers=new Headers(init.headers);const body=init.body?JSON.parse(init.body):null;const method=init.method||'GET';calls.push({url,headers,body,method});
  if(delay)return new Promise(()=>{});
  const json=(data,status=200,total)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json',...(total===undefined?{}:{'Content-Range':`0-${Math.max(0,data.length-1)}/${total}`})}});
  if(url.pathname.startsWith('/storage/')){
   assert.equal(headers.get('apikey'),'server-test');assert.equal(method,'POST');assert.equal(url.pathname,'/storage/v1/object/sign/nexo-property-images');assert.equal(body.expiresIn,300);
   if(storageFailure)return json({message:'PRIVATE ERROR'},500);
   const paths=partial?body.paths.slice(1):body.paths;
   return json(paths.map(path=>({path,signedURL:`/object/sign/nexo-property-images/${path}?token=TEST_ONLY`}))); // SDK prefixes /storage/v1
  }
  assert(['GET','HEAD'].includes(method));if(method==='HEAD'&&countFailure)return json({message:'PRIVATE COUNT ERROR'},500);if(dbFailure)return json({message:'PRIVATE DATABASE ERROR'},500);
  const table=url.pathname.split('/').at(-1);assert(!url.searchParams.get('select').includes('*'));
  if(table==='property_images')assert.equal(headers.get('apikey'),'server-test');else assert.equal(headers.get('apikey'),'public-test');
  let data=structuredClone(table==='properties'?properties:table==='property_images'?photos:table==='provinces'?[{code:'18',name:'Corrientes'}]:table==='localities'?[{id:uuid(100),name:'Corrientes Capital',province_code:'18'}]:table==='zones'?[{slug:'centro',name:'Centro',locality_id:uuid(100)}]:table==='amenities'?[{slug:'patio',name:'Patio'}]:[]);
  if(table==='properties'&&url.searchParams.get('select')==='id'){rechecks++;if(revokeAt&&rechecks>=revokeAt)data=[];}
  const val=(row,key)=>key.split('.').reduce((v,k)=>v?.[k],row);
  for(const [key,expr] of url.searchParams){
   if(['select','order','limit','offset'].includes(key))continue;
   const dot=expr.indexOf('.'),op=expr.slice(0,dot),target=expr.slice(dot+1);
   data=data.filter(row=>{
    if(key.startsWith('match'))return row.property_amenities.some(v=>v.amenity_slug===target);
    const value=val(row,key);if(op==='eq')return String(value)===target;if(op==='neq')return String(value)!==target;
    if(op==='gte')return value!==null&&Number(value)>=Number(target);if(op==='lte')return value!==null&&Number(value)<=Number(target);
    if(op==='is')return value===null;if(op==='in')return target.slice(1,-1).split(',').includes(value);throw new Error('Unsupported fixture operator '+op);
   });
  }
  const ordering=(url.searchParams.get('order')||'').split(',').filter(Boolean).map(v=>v.split('.'));
  data.sort((a,b)=>{for(const [key,dir] of ordering){const av=val(a,key),bv=val(b,key);if(av!==bv)return (av<bv?-1:1)*(dir==='desc'?-1:1);}return 0;});
  const total=data.length,offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||total);
  if(method==='HEAD')return new Response(null,{status:200,headers:{'Content-Range':`*/${total}`}});
  if(rangeError&&offset>0&&offset>=total)return json({code:'PGRST103',message:'Requested range not satisfiable'},416);
  data=data.slice(offset,offset+limit);
  return json(data,200,total);
 };
 const settings={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch}};
 const handler=createPublicCatalogHandler({projectUrl:project,allowedOrigins:[origin],timeoutMs:delay?10:1000,now:()=>Date.parse('2026-10-27T12:00:00Z'),anonymousClient:(...args)=>{assert.equal(args.length,0);factories++;return createClient(project,'public-test',settings);},imageClient:(...args)=>{assert.equal(args.length,0);return createClient(project,'server-test',settings);}});
 const request=(path='list',init={})=>new Request(`${project}/functions/v1/nexo-public-catalog/${path}`,{headers:{origin,authorization:'Bearer ADMIN_MUST_NOT_PROPAGATE'},...init});
 return {handler,request,calls,stats:()=>({factories,rechecks})};
}
async function run(f,path='list',init){const response=await f.handler(f.request(path,init));return {status:response.status,body:await response.json(),headers:response.headers};}
test('anonymous public listing uses isolated SDK clients, exact count and five-minute derivatives only',async()=>{
 const f=fixture();const r=await run(f);assert.equal(r.status,200);assert.equal(r.body.data.length,1);assert.equal(r.body.pagination.total,1);assert.equal(r.body.data[0].imagen.expiresAt,'2026-10-27T12:05:00.000Z');assert.equal(r.headers.get('cache-control'),'no-store');
 assert(!JSON.stringify(r.body).includes('original'));assert(!JSON.stringify(r.body).includes('processing_token'));assert(f.calls.every(c=>!c.headers.get('authorization')?.includes('ADMIN_MUST_NOT_PROPAGATE')));assert.equal(f.stats().rechecks,2);
});
test('all filters reach Supabase before range; amenities are AND, currencies are not converted',async()=>{
 const properties=[makeProperty(1),makeProperty(2,{property_type:'terreno',bedrooms:null,bathrooms:null}),makeProperty(3,{property_amenities:[{amenity_slug:'patio'}]}),makeProperty(4,{currency:'ARS'})];const f=fixture({properties});
 const r=await run(f,`list?tipo=casa&operacion=venta&zona=centro&provincia=18&localidad=${uuid(100)}&moneda=USD&precioMin=100&precioMax=200&superficieMin=80&superficieMax=100&habitaciones=2&banos=1&comodidad=patio&comodidad=cochera&orden=precio-desc&pageSize=1`);
 assert.equal(r.status,200);assert.equal(r.body.pagination.total,1);assert.equal(r.body.data[0].id,'nexo-001');
 const u=f.calls[0].url;assert.equal(u.searchParams.get('limit'),'1');assert.equal(u.searchParams.get('bedrooms'),'gte.2');assert.equal(u.searchParams.get('match1.amenity_slug'),'eq.patio');assert.match(u.searchParams.get('select'),/match0:property_amenities!inner/);assert.equal(u.searchParams.get('order'),'currency.asc,price.desc,id.asc');
});
test('pagination, stable ordering, empty results and out-of-range pages',async()=>{
 const f=fixture({properties:Array.from({length:25},(_,i)=>makeProperty(i+1)),photos:[]});const r=await run(f,'list?page=2&pageSize=12');assert.equal(r.body.data.length,12);assert.equal(r.body.pagination.total,25);assert.equal(r.body.pagination.totalPages,3);assert.equal(r.body.data[0].id,'nexo-013');
 const empty=await run(f,'list?zona=nonexistent');assert.equal(empty.status,200);assert.equal(empty.body.pagination.total,0);
 const out=await run(f,'list?page=9');assert.equal(out.body.data.length,0);assert.equal(out.body.pagination.total,25);
});
test('drafts and archived properties are unavailable with or without admin headers',async()=>{
 const f=fixture({properties:[makeProperty(1,{status:'draft'}),makeProperty(2,{status:'archived'})]});
 assert.equal((await run(f)).body.data.length,0);
 for(const path of ['detail?id=nexo-001','detail?id=nexo-002','detail?id=nexo-999','similar?id=nexo-001']){const r=await run(f,path);assert.equal(r.status,404);assert.equal(r.body.error.code,'NOT_FOUND');}
 assert(!f.calls.some(c=>c.url.pathname.includes('/storage/')));
});
test('detail gallery and featured reuse existing DTO, correct cover and bounded queries',async()=>{
 const f=fixture({photos:[makeImage(1,{is_primary:false}),makeImage(1,{id:uuid(1999),position:1,is_primary:true,storage_prefix:'invalid'})]});
 const r=await run(f,'detail?id=nexo-001');assert.equal(r.status,200);assert.equal(r.body.data.descripcion,'Descripción existente');assert(r.body.data.imagen);assert.deepEqual(r.body.data.fotografias,[]);
 const featured=await run(f,'featured');assert.equal(featured.body.data.length,1);assert(f.calls.some(c=>c.url.searchParams.get('featured')==='eq.true'&&c.url.searchParams.get('limit')==='6'));
});
test('similar score bands are bounded, exclude current property, preserve priority and published-only',async()=>{
 const f=fixture({properties:[makeProperty(1),makeProperty(2,{operation:'alquiler'}),makeProperty(3),makeProperty(4,{property_type:'departamento'}),makeProperty(5,{status:'draft'})],photos:[]});
 const r=await run(f,'similar?id=nexo-001');assert.equal(r.status,200);assert.deepEqual(r.body.data.map(v=>v.id),['nexo-003','nexo-002','nexo-004']);assert(f.calls.filter(c=>c.url.pathname.endsWith('/properties')).every(c=>c.url.searchParams.get('status')==='eq.published'));
});
test('hierarchical options are paginated and never require privileged reads',async()=>{
 const f=fixture();
 for(const path of ['options','options?scope=localities&provincia=18',`options?scope=zones&localidad=${uuid(100)}&provincia=18`,'options?scope=amenities']){const r=await run(f,path);assert.equal(r.status,200);assert.equal(r.body.data.length,1);assert.deepEqual(Object.keys(r.body.data[0]),['value','label']);assert.equal(r.body.pagination.pageSize,12);}
 assert(!f.calls.some(c=>c.headers.get('apikey')==='server-test'));
 assert.equal((await run(f,`options?scope=zones&localidad=${uuid(100)}&provincia=06`)).body.data.length,0);
});
test('pending, failed, foreign, cleanup and forged original images never receive signatures',async()=>{
 const photos=[makeImage(1,{processing_status:'pending'}),makeImage(1,{processing_status:'failed'}),makeImage(2),makeImage(1,{cleanup_requested_at:'2026-10-27'}),makeImage(1,{jpeg_path:'properties/original.jpg'})];
 const f=fixture({photos});const r=await run(f);assert.equal(r.status,200);assert.equal(r.body.data[0].imagen,null);assert(!f.calls.some(c=>c.url.pathname.includes('/storage/')));
});
test('partial signing and Storage errors degrade to placeholder without leaking errors or originals',async()=>{
 for(const config of [{partial:true},{storageFailure:true}]){const f=fixture(config);const r=await run(f);assert.equal(r.status,200);assert.equal(r.body.data[0].imagen,null);assert(!JSON.stringify(r.body).includes('PRIVATE'));}
});
test('publication is checked before privileged reads and again after signing',async()=>{
 for(const revokeAt of [1,2]){const f=fixture({revokeAt});const r=await run(f);assert.equal(r.status,503);assert(!JSON.stringify(r.body).includes('TEST_ONLY'));if(revokeAt===1)assert(!f.calls.some(c=>c.headers.get('apikey')==='server-test'));}
});
test('invalid requests and unsupported methods/origins fail before creating SDK clients',async()=>{
 const f=fixture();for(const path of ['list?status=draft','list?bucket=nexo-property-originals','list?pageSize=49','detail?id=../original','options?scope=zones','options?scope=localities','list?comodidad=x)&select=*'])assert.equal((await run(f,path)).status,400);
 assert.equal((await run(f,'list',{method:'POST'})).status,405);assert.equal((await run(f,'list',{headers:{origin:'https://evil.test'}})).status,403);assert.equal(f.stats().factories,0);
 const preflight=await f.handler(f.request('list',{method:'OPTIONS'}));assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-methods'),'GET, OPTIONS');assert.match(preflight.headers.get('access-control-allow-headers'),/content-type/);
});
test('query failures and timeouts return sanitized 503 without frontend fallback',async()=>{
 for(const options of [{dbFailure:true},{delay:true}]){const f=fixture(options);const r=await run(f);assert.equal(r.status,503);assert.equal(r.body.error.code,'UNAVAILABLE');assert(!JSON.stringify(r.body).includes('PRIVATE'));}
});
test('entrypoint uses pinned SDK, separate clients and no WASM or visitor sessions',async()=>{
 const source=await readFile(new URL('../supabase/functions/nexo-public-catalog/index.js',import.meta.url),'utf8');assert.match(source,/supabase-js@2\.118\.0/);assert.match(source,/persistSession:false/);assert(!/magick|auth\.getSession|request\.headers/.test(source));
});
test('maximum page stays bounded and signs in batches of at most 100 keys',async()=>{
 const f=fixture({properties:Array.from({length:48},(_,i)=>makeProperty(i+1)),photos:Array.from({length:48},(_,i)=>makeImage(i+1))});
 const r=await run(f,'list?pageSize=48');assert.equal(r.status,200);assert.equal(r.body.data.length,48);assert(r.body.data.every(p=>p.imagen));
 const signatures=f.calls.filter(c=>c.url.pathname.startsWith('/storage/'));assert.equal(signatures.length,2);assert(signatures.every(c=>c.body.paths.length<=100));
 const metadata=f.calls.find(c=>c.url.pathname.endsWith('/property_images'));assert.equal(metadata.url.searchParams.get('limit'),'961');
});

test('real PostgREST 416 pages recover filtered total through bounded HEAD, not fabricated zero',async()=>{
 for(const path of ['list?page=9','options?scope=amenities&page=9','options?scope=localities&provincia=18&page=9']){
  const f=fixture({rangeError:true});const r=await run(f,path);assert.equal(r.status,200);assert.equal(r.body.pagination.total,1);assert.deepEqual(r.body.data,[]);assert.equal(f.calls.filter(c=>c.method==='HEAD').length,1);
 }
 const empty=fixture({properties:[],rangeError:true});assert.equal((await run(empty,'list?page=2')).body.pagination.total,0);
 const broken=fixture({rangeError:true,countFailure:true});assert.equal((await run(broken,'list?page=9')).status,503);
});
