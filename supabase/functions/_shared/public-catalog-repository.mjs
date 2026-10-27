import {projectPublishedProperty,authorizePublicImage,publicImageDto,SIGNED_IMAGE_TTL_SECONDS} from './public-catalog-contract.mjs';
// No wildcard selects. Image metadata uses a separate, narrowly scoped client.
const fields='id,public_code,status,title,property_type,operation,price,currency,zone_slug,city,area,area_unit,bedrooms,bathrooms,featured,is_demo,zone:zones!inner(name,locality:localities!inner(id,province_code)),property_amenities(amenity_slug)';
const detailFields=fields+',description,approximate_location';
const imageFields='id,property_id,position,is_primary,storage_kind,processing_status,cleanup_requested_at,width,height,alt,source_kind,illustrative,storage_prefix,processing_token,processed_at,original_sha256,verified_sha256,jpeg_path,webp_variants,jpeg_variants';
export class CatalogUnavailable extends Error {}
export class CatalogNotFound extends Error {}
const fail=()=>{throw new CatalogUnavailable();};
async function rows(query,max){const r=await query;if(r.error||!Array.isArray(r.data)||r.data.length>max)fail();return r;}
export function createPublicCatalogRepository({anonymous,images,projectUrl,signal,now=Date.now}){
 const bounded=q=>q.abortSignal(signal);
 async function pageRows(query,countQuery,max,offset){
  const r=await query;
  if(r.status===416&&r.error?.code==='PGRST103'){
   const count=await countQuery();
   if(count.error||!Number.isSafeInteger(count.count)||count.count<0||count.count>offset)fail();
   return {data:[],count:count.count};
  }
  if(r.error||!Array.isArray(r.data)||r.data.length>max||!Number.isSafeInteger(r.count)||r.count<r.data.length)fail();
  return r;
 }
 function search(filters={},detail=false,counted=false,head=false){
  const aliases=(filters.comodidades||[]).map((_,i)=>`,match${i}:property_amenities!inner(amenity_slug)`).join('');
  let q=anonymous.from('properties').select((detail?detailFields:fields)+aliases,counted?{count:'exact',head}:{}).eq('status','published');
  for(const [key,column] of [['operacion','operation'],['tipo','property_type'],['zona','zone_slug'],['moneda','currency']])if(filters[key])q=q.eq(column,filters[key]);
  if(filters.provincia)q=q.eq('zone.locality.province_code',filters.provincia);
  if(filters.localidad)q=q.eq('zone.locality.id',filters.localidad);
  for(const [key,column,op] of [['precioMin','price','gte'],['precioMax','price','lte'],['superficieMin','area','gte'],['superficieMax','area','lte'],['habitaciones','bedrooms','gte'],['banos','bathrooms','gte']])if(filters[key]!==undefined)q=q[op](column,Number(filters[key]));
  if(filters.habitaciones||filters.banos)q=q.neq('property_type','terreno');
  (filters.comodidades||[]).forEach((slug,i)=>{q=q.eq(`match${i}.amenity_slug`,slug);});
  return q;
 }
 function order(q,sort){
  if(sort?.startsWith('precio'))q=q.order('currency',{ascending:true}).order('price',{ascending:sort==='precio-asc'});
  else if(sort?.startsWith('superficie'))q=q.order('area',{ascending:sort==='superficie-asc'});
  else q=q.order('created_at',{ascending:false});
  return q.order('id',{ascending:true});
 }
 async function getRaw(id,detail=false){const r=await bounded(search({},detail).eq('public_code',id).limit(1).maybeSingle());if(r.error)fail();if(!r.data)throw new CatalogNotFound();if(!projectPublishedProperty(r.data,{detail}))fail();return r.data;}
 async function stillPublished(ids){
  const r=await rows(bounded(anonymous.from('properties').select('id').eq('status','published').in('id',ids).limit(ids.length)),ids.length);
  const found=new Set(r.data.map(v=>v.id));if(ids.some(id=>!found.has(id)))fail();
 }
 async function decorate(input,detail=false){
  if(!input.length)return [];
  const data=input.map(row=>projectPublishedProperty(row,{detail}));if(data.some(v=>!v))fail();
  const ids=input.map(v=>v.id);if(new Set(ids).size!==ids.length)fail();
  // Recheck using anonymous RLS before reading privileged metadata and after signing.
  await stillPublished(ids);
  const max=ids.length*20;
  const r=await rows(bounded(images.from('property_images').select(imageFields).in('property_id',ids).eq('processing_status','ready').is('cleanup_requested_at',null).order('position').order('id').limit(max+1)),max);
  if(r.data.some(v=>!ids.includes(v.property_id)))fail();
  const plans=input.map(property=>{
   const candidates=r.data.filter(v=>v.property_id===property.id);if(candidates.length>20)fail();
   const sorted=[...candidates].sort((a,b)=>Number(b.is_primary)-Number(a.is_primary)||a.position-b.position||a.id.localeCompare(b.id));
   const authorized=sorted.map(i=>authorizePublicImage(property,i)).filter(Boolean);
   return detail?authorized:authorized.slice(0,1);
  });
  const keys=[...new Set(plans.flat().filter(p=>p.delivery==='signed').flatMap(p=>p.variants.map(v=>v.key)))];
  const urls=Object.create(null);const issuedAt=now();
  for(let i=0;i<keys.length;i+=100){
   if(signal?.aborted)fail();
   const batch=keys.slice(i,i+100);let signed;
   try{signed=await images.storage.from('nexo-property-images').createSignedUrls(batch,SIGNED_IMAGE_TTL_SECONDS);}catch{continue;}
   if(signed.error||!Array.isArray(signed.data))continue;
   for(const item of signed.data)if(batch.includes(item.path)&&!item.error&&typeof item.signedUrl==='string')urls[item.path]=item.signedUrl;
  }
  await stillPublished(ids);
  return data.map((item,i)=>{
   const photos=plans[i].map(p=>publicImageDto(p,urls,{projectUrl,issuedAt})).filter(Boolean);
   item.imagen=photos[0]||null;if(detail)item.fotografias=photos.slice(1);return item;
  });
 }
 return {
  async list({filters,page,pageSize}){
   const r=await pageRows(bounded(order(search(filters,false,true),filters.orden).range((page-1)*pageSize,page*pageSize-1)),()=>bounded(search(filters,false,true,true).limit(1)),pageSize,(page-1)*pageSize);
   if(!Number.isSafeInteger(r.count)||r.count<r.data.length)fail();
   return {data:await decorate(r.data),total:r.count};
  },
  async detail(id){return (await decorate([await getRaw(id,true)],true))[0];},
  async featured(){const r=await rows(bounded(order(search().eq('featured',true)).limit(6)),6);return decorate(r.data);},
  async similar(id){
   const current=await getRaw(id);const found=[];
   // Seven disjoint score bands preserve V4's type(4)+operation(2)+zone(1).
   // Every band is ordered and limited in Postgres, never a full client-side scan.
   for(let score=7;score>=1&&found.length<3;score--){
    let q=search().neq('id',current.id);
    for(const [weight,key] of [[4,'property_type'],[2,'operation'],[1,'zone_slug']])q=q[(score&weight)?'eq':'neq'](key,current[key]);
    const r=await rows(bounded(q.order('public_code').order('id').limit(3-found.length)),3-found.length);found.push(...r.data);
   }
   await stillPublished([current.id]);return decorate(found);
  },
  async options({scope,filters,page,pageSize}){
   const specs={provinces:['provinces','code'],localities:['localities','id'],zones:['zones','slug'],amenities:['amenities','slug']};
   const [table,key]=specs[scope];let q=anonymous.from(table).select(`${key},name`,{count:'exact'});
   if(scope==='localities')q=q.eq('province_code',filters.provincia);
   if(scope==='zones'){
    if(filters.provincia){const parent=await bounded(anonymous.from('localities').select('id').eq('id',filters.localidad).eq('province_code',filters.provincia).maybeSingle());if(parent.error)fail();if(!parent.data)return {data:[],total:0};}
    q=q.eq('locality_id',filters.localidad);
   }
   const r=await pageRows(bounded(q.order('name').order(key).range((page-1)*pageSize,page*pageSize-1)),()=>{
    let count=anonymous.from(table).select(key,{count:'exact',head:true});
    if(scope==='localities')count=count.eq('province_code',filters.provincia);
    if(scope==='zones')count=count.eq('locality_id',filters.localidad);
    return bounded(count.limit(1));
   },pageSize,(page-1)*pageSize);
   if(!Number.isSafeInteger(r.count)||r.count<r.data.length)fail();
   const data=r.data.map(v=>({value:v[key],label:v.name}));if(data.some(v=>typeof v.value!=='string'||typeof v.label!=='string'||!v.label.trim()))fail();return {data,total:r.count};
  },
 };
}
