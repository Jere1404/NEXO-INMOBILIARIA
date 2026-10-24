import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildSeed } from '../scripts/generate-supabase-seed.mjs';
import { adaptProperty, createPublicRepository } from '../assets/js/backend/repository.js';
import { createAdminAuth } from '../assets/js/backend/auth.js';
import { createBackendClient } from '../assets/js/backend/client.js';
const properties = JSON.parse(await readFile(new URL('../data/propiedades.json', import.meta.url)));
const seed = await readFile(new URL('../supabase/seeds/001_demo_properties.sql', import.meta.url), 'utf8');
function backendRow(p) {
  return { public_code:p.id,title:p.titulo,description:p.descripcion,property_type:p.tipo,operation:p.operacion,price:String(p.precio),currency:p.moneda,zone_slug:p.zona,zone:{name:p.ubicacion},city:p.ciudad,area:String(p.superficie),area_unit:p.unidadSuperficie,bedrooms:p.habitaciones,bathrooms:p.banos,approximate_location:p.ubicacionAproximada,featured:p.destacada,is_demo:p.ficticia,
    images:[{position:0,is_primary:true,processing_status:'ready',jpeg_path:p.imagen.src,width:p.imagen.width,height:p.imagen.height,alt:p.imagen.alt,webp_variants:p.imagen.webp,jpeg_variants:p.imagen.jpeg}],property_amenities:p.comodidades.map(amenity_slug=>({amenity_slug})) };
}
test('generated seed is reproducible and rejects duplicates or invalid data', () => {
  assert.equal(buildSeed(properties),seed);
  assert.throws(()=>buildSeed([...properties.slice(0,11),properties[0]]));
  assert.throws(()=>buildSeed(properties.map((p,i)=>i===0?{...p,precio:-1}:p)));
  assert(!seed.includes("'published'"));
});
test('adapter preserves the twelve existing public records', () => {
  for (const p of properties) assert.deepEqual(adaptProperty(backendRow(p)),p);
});
test('adapter handles missing or pending images without inventing one', () => {
  const row=backendRow(properties[0]); row.images[0].processing_status='pending';
  assert.equal(adaptProperty(row).imagen,null);assert.deepEqual(adaptProperty({...row,images:null}).fotografias,[]);
  assert.throws(()=>adaptProperty({}));
});
function queryClient(result) {
  const calls=[];
  const q={};
  for(const method of ['select','eq','order','range'])q[method]=(...args)=>{calls.push([method,...args]);return q;};
  q.then=(resolve,reject)=>Promise.resolve(result).then(resolve,reject);
  q.maybeSingle=async()=>result;
  return {client:{from:table=>{calls.push(['from',table]);return q;}},calls};
}
test('repository always filters publication, pages and orders requests', async () => {
  const {client,calls}=queryClient({data:[backendRow(properties[0])],count:1});
  const result=await createPublicRepository(client).listPublished({page:2,pageSize:10});
  assert.equal(result.total,1);assert.equal(result.properties[0].id,'nexo-001');
  assert(calls.some(c=>c[0]==='eq'&&c[1]==='status'&&c[2]==='published'));
  assert(calls.some(c=>c[0]==='range'&&c[1]===20&&c[2]===29));
  await assert.rejects(()=>createPublicRepository(client).listPublished({pageSize:101}));
});
test('repository handles unknown codes and backend errors without JSON fallback', async () => {
  const {client,calls}=queryClient({data:null,error:null});
  assert.equal(await createPublicRepository(client).getPublished('nexo-404'),null);
  assert(calls.some(c=>c[0]==='eq'&&c[1]==='status'&&c[2]==='published'));
  assert.equal(await createPublicRepository(client).getPublished('../bad'),null);
  await assert.rejects(()=>createPublicRepository(queryClient({error:{message:'failed'}}).client).listPublished());
});
test('client factory rejects secret-like keys and never activates itself', () => {
  for(const publishableKey of ['sb_secret_fixture','service_role','']) assert.throws(()=>createBackendClient(()=>{}, {url:'https://example.test',publishableKey}));
  let called=false;
  const result=createBackendClient((url,key,options)=>{called=true;assert.equal(options.auth.persistSession,false);assert.equal(options.auth.flowType,'pkce');return 'client';},{url:'https://example.test',publishableKey:'sb_publishable_test_fixture'});
  assert(called);assert.equal(result,'client');
});
function authClient({member=true,enabled=true,user=true}={}) {
  let signedOut=false;
  return {client:{auth:{signInWithPassword:async()=>({error:null}),getUser:async()=>({data:{user:user?{id:'fixture-user'}:null}}),signOut:async()=>{signedOut=true;return {error:null};}},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:member?{role:'admin',enabled}:null})})})})},signedOut:()=>signedOut};
}
test('authentication verifies server identity and enabled membership', async () => {
  const {client}=authClient();assert.equal((await createAdminAuth(client).signIn('fixture@example.test','test-only')).id,'fixture-user');
  for(const setup of [{member:false},{enabled:false},{user:false}]){
    const mocked=authClient(setup);await assert.rejects(()=>createAdminAuth(mocked.client).signIn('fixture@example.test','test-only'));assert(mocked.signedOut());
  }
  assert.equal('signUp' in createAdminAuth(client),false);
});
