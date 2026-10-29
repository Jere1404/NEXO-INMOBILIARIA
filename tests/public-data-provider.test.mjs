import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {publicDataConfig} from '../assets/js/public-data-config.js';
import {createPublicDataProvider,publicSearchParams} from '../assets/js/data/public-provider.js';
import {adaptPublicProperty} from '../assets/js/data/public-adapter.js';
import {getPropertyImage} from '../assets/js/property-cards.js';
const data=JSON.parse(await readFile(new URL('../data/propiedades.json',import.meta.url)));
const api='https://ugrqstsuhamjjewusigh.supabase.co/functions/v1/nexo-public-catalog';
const id='11111111-1111-4111-8111-111111111111';
const signed=(format='jpg',expiresAt=new Date(Date.now()+240000).toISOString())=>({src:`${new URL(api).origin}/storage/v1/object/sign/nexo-property-images/properties/${id}/${id}/v-${id}-960.${format}?token=fake.payload.signature`,width:960,height:720,alt:'Frente',webp:[],jpeg:[],expiresAt,sourceKind:'owner_authorized',illustrative:true});
const envelope=(rows,total=rows.length,page=1,pageSize=12)=>({version:1,data:rows,pagination:{page,pageSize,total,totalPages:Math.ceil(total/pageSize),hasNext:page*pageSize<total}});
function remote(responder){const calls=[];const provider=createPublicDataProvider({...publicDataConfig,provider:'supabase'},{fetchImpl:async(url,options)=>{calls.push({url:new URL(url),options});return responder(new URL(url),options,calls.length);},loadJson:()=>{throw new Error('NO_JSON_FALLBACK');}});return {provider,calls};}
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
test('explicit JSON rollback keeps requests local and reuses existing data',async()=>{
 let loads=0;
 const provider=createPublicDataProvider({...publicDataConfig,provider:'json'},{loadJson:async()=>{loads++;return data;},fetchImpl:()=>{throw new Error('Unexpected remote access');}});
 const list=await provider.list();assert.equal(list.total,12);assert.equal(list.properties.length,12);assert.equal(list.availableTotal,12);
 assert.equal((await provider.featured()).length,6);assert.equal((await provider.detail('nexo-001')).id,'nexo-001');assert((await provider.similar('nexo-001')).length<=3);assert.equal((await provider.allOptions({scope:'zones'})).length,5);assert.equal(loads,1);
});
test('JSON provider preserves filters, currencies, pagination, reset and not-found',async()=>{
 const provider=createPublicDataProvider({...publicDataConfig,provider:'json'},{loadJson:async()=>data});
 const page=await provider.list({page:2,pageSize:5});assert.equal(page.properties.length,5);assert.equal(page.total,12);assert(page.hasNext);
 const matched=await provider.list({filters:{tipo:'casa',operacion:'venta',moneda:'USD',precioMin:1,comodidades:['patio'],orden:'precio-desc'}});
 assert(matched.properties.every(v=>v.tipo==='casa'&&v.operacion==='venta'&&v.moneda==='USD'&&v.comodidades.includes('patio')));
 assert.equal((await provider.list({filters:{precioMin:1e9,moneda:'USD'}})).total,0);assert.equal((await provider.list()).total,12);assert.equal(await provider.detail('nexo-missing'),null);
 await assert.rejects(()=>provider.list({pageSize:49}));await assert.rejects(()=>provider.list({filters:{precioMin:20,precioMax:1,moneda:'USD'}}));
});
test('public URL builder only transmits allowed filter keys and deduplicates amenities',()=>{
 const params=publicSearchParams({tipo:'casa',utm_source:'chatgpt.com',status:'draft',select:'*',apikey:'no',comodidades:['patio','patio'],precioMin:null,zona:''});
 assert.equal(params.toString(),'tipo=casa&comodidad=patio');
});
test('API list filters before server pagination, with no sessions or JSON fallback',async()=>{
 const f=remote(()=>response(envelope([data[0]],20,2,12)));
 const result=await f.provider.list({page:2,filters:{tipo:'casa',operacion:'venta',moneda:'USD',precioMin:10,orden:'precio-desc',comodidades:['patio'],utm_source:'chatgpt.com'}});
 assert.equal(result.total,20);assert.equal(result.properties.length,1);assert.equal(result.availableTotal,null);
 const call=f.calls[0];assert.equal(call.url.pathname,'/functions/v1/nexo-public-catalog/list');assert.equal(call.url.searchParams.get('page'),'2');assert.equal(call.url.searchParams.get('comodidad'),'patio');assert(!call.url.searchParams.has('utm_source'));assert.equal(call.options.credentials,'omit');assert.equal(call.options.cache,'no-store');assert.equal(call.options.redirect,'error');assert(!call.options.headers.Authorization);assert.equal(f.calls.length,1);
});
test('API featured, details, similar and hierarchical options use separate bounded endpoints',async()=>{
 const f=remote(url=>{
  const action=url.pathname.split('/').at(-1);
  if(action==='detail')return response({version:1,data:data[0]});
  if(action==='similar')return response({version:1,data:[data[1]]});
  if(action==='options')return response(envelope([{value:'centro',label:'Centro'}],1,1,48));
  return response({version:1,data:[data[0]]});
 });
 assert.equal((await f.provider.featured()).length,1);assert.equal((await f.provider.detail(data[0].id)).id,data[0].id);assert.equal((await f.provider.similar(data[0].id)).length,1);
 const opts=await f.provider.options({scope:'zones',localidad:id,provincia:'18'});assert.equal(opts.options[0].value,'centro');assert.equal(f.calls.at(-1).url.searchParams.get('localidad'),id);
});
test('empty API catalog, not-found and connection errors stay distinct',async()=>{
 assert.equal((await remote(()=>response(envelope([]))).provider.list()).total,0);
 assert.equal(await remote(()=>response({error:{code:'NOT_FOUND'}},404)).provider.detail('nexo-001'),null);
 await assert.rejects(()=>remote(()=>response({error:{code:'NOT_FOUND'}},404)).provider.featured(),e=>e.code==='UNAVAILABLE');
 for(const status of [400,403,500,503])await assert.rejects(()=>remote(()=>response({error:{message:'PRIVATE SERVER DETAIL'}},status)).provider.list(),e=>e.code===(status===400?'INVALID_REQUEST':'UNAVAILABLE')&&!e.message.includes('PRIVATE'));
 await assert.rejects(()=>remote(()=>{throw new Error('raw private network detail');}).provider.list(),e=>e.code==='UNAVAILABLE'&&!e.message.includes('private'));
});
test('malformed API envelopes, duplicate IDs and wrong detail associations fail closed',async()=>{
 for(const body of [envelope([data[0]],0),{version:2,data:[],pagination:{}},envelope([data[0],data[0]]),{...envelope([]),pagination:{...envelope([]).pagination,totalPages:99}}])await assert.rejects(()=>remote(()=>response(body)).provider.list());
 await assert.rejects(()=>remote(()=>response({version:1,data:data[1]})).provider.detail(data[0].id));
 assert.throws(()=>adaptPublicProperty({...data[0],precio:'100'}));
 const adapted=adaptPublicProperty({...data[0],private_field:'do not copy'});assert(!Object.hasOwn(adapted,'private_field'));assert(!Object.hasOwn(adapted,'descripcion'));
});
test('managed pictures accept only matching private derivatives, live expiry and safe srcset',()=>{
 const image=signed();image.webp=[{...signed('webp'),width:960}];const normalized=getPropertyImage(image);assert(normalized);assert.equal(normalized.webp.length,1);
 for(const src of [image.src.replace(new URL(api).origin,'https://evil.example'),image.src.replace('nexo-property-images','nexo-property-originals'),image.src.replace(/v-[^/]+\.jpg/,'original.jpg'),image.src+'&download=1',image.src+',https://evil.example/x.jpg'])assert.equal(getPropertyImage({...image,src}),null);
 assert.equal(getPropertyImage({...image,expiresAt:new Date(Date.now()-1000).toISOString()}),null);
 assert(getPropertyImage(data[0].imagen));
 const adapted=adaptPublicProperty({...data[0],imagen:{...image,secret_field:'do not copy'}});assert(!Object.hasOwn(adapted.imagen,'secret_field'));
});
test('location option pages are scoped and bounded without downloading properties',async()=>{
 const f=remote(url=>{assert(url.pathname.endsWith('/options'));const page=Number(url.searchParams.get('page'));return response(envelope(page===1?Array.from({length:48},(_,i)=>({value:'zone-'+i,label:'Zona '+i})):[{value:'last',label:'Última'}],49,page,48));});
 assert.equal((await f.provider.allOptions({scope:'zones',localidad:id})).length,49);assert.equal(f.calls.length,2);assert(f.calls.every(v=>v.url.searchParams.get('localidad')===id));
});
test('request cancellation is propagated without exposing transport messages',async()=>{
 const controller=new AbortController();const f=remote((url,{signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(new Error('internal secret')),{once:true});}));
 const pending=f.provider.list({signal:controller.signal});controller.abort();await assert.rejects(()=>pending,e=>e.name==='AbortError');
});
test('a failed JSON request can retry and an API timeout never falls back to JSON',async()=>{
 let attempts=0;const local=createPublicDataProvider({...publicDataConfig,provider:'json'},{loadJson:()=>{if(++attempts===1)throw new Error('temporary');return data;}});
 await assert.rejects(()=>local.list());assert.equal((await local.list()).total,12);
 const provider=createPublicDataProvider({...publicDataConfig,provider:'supabase'},{timeoutMs:5,fetchImpl:(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('private timeout detail')),{once:true})),loadJson:()=>{throw new Error('NO_FALLBACK');}});
 await assert.rejects(()=>provider.list(),e=>e.code==='UNAVAILABLE'&&!e.message.includes('private'));
});
test('featured and similar responses must match their purpose',async()=>{
 await assert.rejects(()=>remote(()=>response({version:1,data:[{...data[0],destacada:false}]})).provider.featured());
 await assert.rejects(()=>remote(()=>response({version:1,data:[data[0]]})).provider.similar(data[0].id));
});

test('deployment default uses Supabase without JSON fallback or admin credentials',async()=>{
 assert.equal(publicDataConfig.provider,'supabase');
 let calls=0;
 const provider=createPublicDataProvider(publicDataConfig,{
  fetchImpl:async(url,options)=>{
   calls++;assert.equal(new URL(url).origin,new URL(api).origin);
   assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');
   assert(!options.headers.Authorization&&!options.headers.apikey);
   return response(envelope([{...data[0],titulo:'Título actualizado en Supabase'}]));
  },loadJson:()=>{throw new Error('NO_JSON_FALLBACK');}
 });
 assert.equal((await provider.list()).properties[0].titulo,'Título actualizado en Supabase');assert.equal(calls,1);
});
