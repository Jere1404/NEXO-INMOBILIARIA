import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePublicQuery,projectPublishedProperty,authorizePublicImage,publicImageDto,listEnvelope,publicError,detailEnvelope,PUBLIC_PROPERTY_FIELDS,PUBLIC_DETAIL_FIELDS,MAX_PAGE_SIZE,SIGNED_IMAGE_TTL_SECONDS} from '../supabase/functions/_shared/public-catalog-contract.mjs';
const pid='11111111-1111-4111-8111-111111111111',iid='22222222-2222-4222-8222-222222222222',token='33333333-3333-4333-8333-333333333333';
const row=()=>({id:pid,public_code:'nexo-001',status:'published',title:'Casa de prueba',description:'Descripción existente.',property_type:'casa',operation:'venta',price:'120000.00',currency:'USD',zone_slug:'centro',zone:{name:'Centro'},city:'Corrientes Capital',area:'120.00',area_unit:'m²',bedrooms:2,bathrooms:1,featured:true,is_demo:true,approximate_location:'Zona Centro',property_amenities:[{amenity_slug:'patio'}],admin_memberships:['secret'],original_sha256:'secret',processing_error:'secret'});
function image(){const prefix=`properties/${pid}/${iid}/`;return {id:iid,property_id:pid,storage_kind:'managed',storage_prefix:prefix,processing_token:token,processed_at:'2026-10-27T00:00:00Z',processing_status:'ready',cleanup_requested_at:null,original_sha256:'a'.repeat(64),verified_sha256:'a'.repeat(64),width:1200,height:900,alt:'Frente',source_kind:'ai',illustrative:true,jpeg_path:`${prefix}v-${token}-1200.jpg`,webp_variants:[480,960,1200].map(width=>({src:`${prefix}v-${token}-${width}.webp`,width})),jpeg_variants:[480,960,1200].map(width=>({src:`${prefix}v-${token}-${width}.jpg`,width}))};}
const query=s=>new URLSearchParams(s);
test('public query has bounded 12-item default and preserves existing filters',()=>{
 const q=parsePublicQuery('list',query('operacion=venta&tipo=casa&zona=centro&moneda=USD&precioMin=100&precioMax=200000&habitaciones=2&banos=1&superficieMin=80&superficieMax=180&comodidad=patio&comodidad=cochera&orden=precio-asc'));
 assert.equal(q.pageSize,12);assert.equal(q.page,1);assert.deepEqual(q.filters.comodidades,['cochera','patio']);assert.equal(q.filters.precioMin,100);assert.equal(parsePublicQuery('list',query(`pageSize=${MAX_PAGE_SIZE}`)).pageSize,MAX_PAGE_SIZE);
 assert.equal(parsePublicQuery('options',query(`provincia=18&localidad=${pid}`)).filters.localidad,pid);
});
test('rejects arbitrary queries, duplicate scalars, excessive pagination and ambiguous prices',()=>{
 for(const s of ['status=draft','select=*','bucket=originals','page=0','page=-1','page=1.2','page=1001','pageSize=49','pageSize=999999','pageSize=12&pageSize=24','tipo=casa&tipo=terreno','id=nexo-001','precioMin=100','precioMin=NaN&moneda=USD','precioMin=1e3&moneda=USD','precioMin=-1&moneda=USD','precioMin=2&precioMax=1&moneda=USD','superficieMin=2&superficieMax=1','tipo=oficina','zona=centro.or.status.eq.draft','comodidad=patio)&comodidad=x','localidad=bad','provincia=xx','unknown='+ 'x'.repeat(4096)])assert.throws(()=>parsePublicQuery('list',query(s)),{code:'INVALID_REQUEST'});
 for(const action of ['write','reserve','delete','__proto__'])assert.throws(()=>parsePublicQuery(action));
});
test('validates permanent public codes and restricts operation parameters',()=>{
 assert.equal(parsePublicQuery('detail',query('id=nexo-001')).id,'nexo-001');
 for(const s of ['','id=NEXO-001','id=../original.png','id=nexo-001&id=nexo-002','id=nexo-001&status=published'])assert.throws(()=>parsePublicQuery('detail',query(s)));
 assert.throws(()=>parsePublicQuery('featured',query('pageSize=999')));assert.throws(()=>parsePublicQuery('similar',query('id=nexo-001&limit=999')));
});
test('projection denies drafts, archived and malformed rows even from a privileged source',()=>{
 for(const status of ['draft','archived',null,undefined,'Published'])assert.equal(projectPublishedProperty({...row(),status}),null);
 for(const patch of [{currency:'EUR'},{price:'NaN'},{area:null},{bedrooms:undefined},{zone:null},{is_demo:undefined},{property_type:'terreno',bedrooms:1}])assert.equal(projectPublishedProperty({...row(),...patch}),null);
 const data=projectPublishedProperty(row());assert.deepEqual(Object.keys(data),PUBLIC_PROPERTY_FIELDS);assert.equal(data.precio,120000);assert(!JSON.stringify(data).includes('secret'));
 assert.deepEqual(Object.keys(projectPublishedProperty(row(),{detail:true})),PUBLIC_DETAIL_FIELDS);
});
test('managed image authorization requires published parent, ready, trusted verification and exact association',()=>{
 assert(authorizePublicImage(row(),image()));
 for(const patch of [{property_id:token},{processing_status:'pending'},{processing_status:'failed'},{cleanup_requested_at:'2026-10-27'},{cleanup_requested_at:undefined},{storage_kind:'unknown'},{verified_sha256:'b'.repeat(64)},{original_sha256:null},{processed_at:null},{processing_token:null},{storage_prefix:'properties/other/'},{source_kind:'unknown'},{illustrative:false},{jpeg_path:`properties/${pid}/${iid}/original.jpg`},{webp_variants:[]},{width:0}])assert.equal(authorizePublicImage(row(),{...image(),...patch}),null,JSON.stringify(patch));
 for(const status of ['draft','archived'])assert.equal(authorizePublicImage({...row(),status},image()),null);
});
test('signing plan only contains verified derivatives, never original or foreign keys',()=>{
 const i=image();const plan=authorizePublicImage(row(),i);assert.equal(plan.bucket,'nexo-property-images');assert.equal(plan.ttlSeconds,300);assert(!JSON.stringify(plan).includes('original'));
 for(const key of [`properties/${pid}/${iid}/original.jpg`,`properties/${token}/${iid}/v-${token}-480.webp`,`properties/${pid}/${iid}/../original.webp`,`properties/${pid}/${iid}/v-${iid}-480.webp`,'https://evil.test/a.webp']){
  const changed=image();changed.webp_variants[0].src=key;assert.equal(authorizePublicImage(row(),changed),null);
 }
 const missing=image();missing.jpeg_variants.pop();assert.equal(authorizePublicImage(row(),missing),null);
 const duplicate=image();duplicate.webp_variants[1]=duplicate.webp_variants[0];assert.equal(authorizePublicImage(row(),duplicate),null);
});
test('image response validates signed URL origin and exact key, with five-minute expiry',()=>{
 const plan=authorizePublicImage(row(),image());const origin='https://example.supabase.co';const issuedAt=Date.parse('2026-10-27T12:00:00Z');
 const urls=Object.fromEntries(plan.variants.map(v=>[v.key,`${origin}/storage/v1/object/sign/nexo-property-images/${v.key}?token=TEST_ONLY`]));
 const dto=publicImageDto(plan,urls,{projectUrl:origin,issuedAt});assert.equal(dto.expiresAt,'2026-10-27T12:05:00.000Z');assert.equal(SIGNED_IMAGE_TTL_SECONDS,300);assert(!JSON.stringify(dto).includes('original_sha256'));assert.equal(dto.webp.length,3);
 for(const bad of ['https://evil.test/photo','https://example.supabase.co/storage/v1/object/sign/nexo-property-originals/original.jpg?token=x',urls[plan.primaryKey]+'&download=original',urls[plan.primaryKey]+'#x'])assert.equal(publicImageDto(plan,{...urls,[plan.primaryKey]:bad},{projectUrl:origin,issuedAt}),null);
 assert.equal(publicImageDto(plan,{}, {projectUrl:origin,issuedAt}),null);
});
test('legacy images retain local paths and require correct published property association',()=>{
 const i={...image(),storage_kind:'legacy',width:960,height:720,jpeg_path:'assets/images/propiedades/nexo-001/principal-960.jpg',webp_variants:[480,960].map(width=>({src:`assets/images/propiedades/nexo-001/principal-${width}.webp`,width})),jpeg_variants:[480,960].map(width=>({src:`assets/images/propiedades/nexo-001/principal-${width}.jpg`,width}))};
 const plan=authorizePublicImage(row(),i);assert(plan);assert.equal(plan.delivery,'local');assert.equal(publicImageDto(plan).expiresAt,null);
 i.jpeg_path='assets/images/propiedades/nexo-002/principal-960.jpg';assert.equal(authorizePublicImage(row(),i),null);
});
test('pagination reports empty results without treating them as failure',()=>{
 const empty=listEnvelope([],{page:1,pageSize:12,total:0});assert.equal(empty.pagination.totalPages,0);assert.equal(empty.pagination.hasNext,false);
 const page=listEnvelope([projectPublishedProperty(row())],{page:1,pageSize:12,total:13});assert.equal(page.pagination.hasNext,true);assert.equal(page.version,1);
 assert.throws(()=>listEnvelope(Array(49).fill({}),{pageSize:49,total:100}));
});
test('response envelopes reject unexpected property and image fields',()=>{
 assert.throws(()=>listEnvelope([{...projectPublishedProperty(row()),original_sha256:'secret'}],{total:1}));
 assert.throws(()=>listEnvelope([{...projectPublishedProperty(row()),imagen:{src:'x',original_object_key:'secret'}}],{total:1}));
 assert.throws(()=>parsePublicQuery('list',query('comodidad=&comodidad=patio')));
});

test('public errors never return SDK details or distinguish unpublished IDs',()=>{
 for(const code of ['__proto__','secret SQL stack',undefined])assert.deepEqual(publicError(code),{status:503,body:{version:1,error:{code:'UNAVAILABLE',message:'Catálogo temporalmente no disponible.'}}});
 assert.equal(publicError('NOT_FOUND').status,404);assert.equal(publicError('INVALID_REQUEST').status,400);
 assert.equal(detailEnvelope(projectPublishedProperty(row(),{detail:true})).version,1);
});
