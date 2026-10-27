// Runs under Deno with cached imports and WITHOUT --allow-net.
// Uses the actual entrypoint and npm SDK, with only synthetic credentials/data.
const assert=(condition,message='Assertion failed')=>{if(!condition)throw new Error(message);};
const origin='https://fixture.example';
const project='https://fixture.supabase.co';
const names=['SUPABASE_URL','NEXO_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY','NEXO_ALLOWED_ORIGINS'];
const previous=Object.fromEntries(names.map(k=>[k,Deno.env.get(k)]));
const originalFetch=globalThis.fetch,originalServe=Deno.serve;
let handler;
const calls=[];
let mode='empty';
Deno.env.set('SUPABASE_URL',project);
Deno.env.set('NEXO_SUPABASE_PUBLISHABLE_KEY','sb_publishable_deno_fixture');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','server_deno_fixture');
Deno.env.set('NEXO_ALLOWED_ORIGINS',origin);
Deno.serve=callback=>{handler=callback;return {};};
globalThis.fetch=async(input,init={})=>{
 const url=new URL(input);const headers=new Headers(init.headers);calls.push({url,headers,method:init.method||'GET'});
 assert(url.origin===project,'Unexpected target');
 assert(headers.get('apikey')==='sb_publishable_deno_fixture','Only public client expected');
 assert(!headers.get('authorization')?.includes('VISITOR_SESSION'),'Visitor credential propagated');
 assert(url.pathname.startsWith('/rest/v1/'),'Unexpected request');
 if(mode==='error')return new Response(JSON.stringify({message:'PRIVATE DATABASE ERROR'}),{status:500});
 const isOptions=url.pathname.endsWith('/provinces');
 const count=isOptions?1:0;
 if(init.method==='HEAD')return new Response(null,{headers:{'Content-Range':`*/${count}`}});
 if(Number(url.searchParams.get('offset'))>0)return new Response(JSON.stringify({code:'PGRST103',message:'Requested range not satisfiable'}),{status:416});
 return new Response(JSON.stringify(isOptions?[{code:'18',name:'Corrientes'}]:[]),{headers:{'Content-Type':'application/json','Content-Range':`*/${count}`}});
};
try{
 await import('../../supabase/functions/nexo-public-catalog/index.js');
 assert(typeof handler==='function','Entrypoint failed to register handler');
 const request=(path,init={})=>new Request(`${project}/functions/v1/nexo-public-catalog/${path}`,{headers:{origin,authorization:'Bearer VISITOR_SESSION'},...init});
 Deno.test('Deno entrypoint + npm SDK: anonymous empty catalog and real 416 normalization',async()=>{
  for(const path of ['list','list?page=3']){
   const response=await handler(request(path));const result=await response.json();assert(response.status===200);assert(result.pagination.total===0);assert(result.data.length===0);assert(response.headers.get('Cache-Control')==='no-store');
  }
  assert(calls.some(c=>c.method==='HEAD'),'Missing HEAD recovery');
 });
 Deno.test('Deno entrypoint: hierarchical options, CORS and read-only HTTP methods',async()=>{
  const response=await handler(request('options'));const body=await response.json();assert(response.status===200);assert(body.data[0].value==='18');assert(response.headers.get('Access-Control-Allow-Origin')===origin);
  assert((await handler(request('list',{method:'POST'}))).status===405);
  assert((await handler(request('list',{headers:{origin:'https://evil.example'}}))).status===403);
  const preflight=await handler(request('list',{method:'OPTIONS'}));assert(preflight.status===204);
 });
 Deno.test('Deno entrypoint: validation and sanitized failures',async()=>{
  assert((await handler(request('list?status=draft'))).status===400);
  mode='error';const response=await handler(request('list'));assert(response.status===503);assert(!(await response.text()).includes('PRIVATE'));mode='empty';
 });
 Deno.test('Deno misconfigured entrypoint fails closed without any network request',async()=>{
  const size=calls.length;Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');
  await import('../../supabase/functions/nexo-public-catalog/index.js?missing-config');
  const response=await handler(request('list'));assert(response.status===503);assert(calls.length===size);
 });
 // Restore globals only after registered tests complete.
 globalThis.addEventListener('unload',()=>{
  globalThis.fetch=originalFetch;Deno.serve=originalServe;
  for(const [name,value] of Object.entries(previous))value===undefined?Deno.env.delete(name):Deno.env.set(name,value);
 });
}catch(error){globalThis.fetch=originalFetch;Deno.serve=originalServe;throw error;}
