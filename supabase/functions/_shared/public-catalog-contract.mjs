// V5D.1: pure, fail-closed contract. No clients, credentials, network or signing.
export const PUBLIC_API_VERSION = 1;
export const SIGNED_IMAGE_TTL_SECONDS = 300;
export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 48;
export const PUBLIC_PROPERTY_FIELDS = Object.freeze(['id','titulo','tipo','operacion','precio','moneda','zona','ubicacion','ciudad','superficie','unidadSuperficie','habitaciones','banos','destacada','ficticia','comodidades','imagen']);
export const PUBLIC_DETAIL_FIELDS = Object.freeze([...PUBLIC_PROPERTY_FIELDS,'descripcion','ubicacionAproximada','fotografias']);
export class PublicRequestError extends Error {
  constructor(){ super('Parámetros de consulta inválidos.'); this.code='INVALID_REQUEST'; this.status=400; }
}
const invalid=()=>{throw new PublicRequestError();};
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const positive=value=>Number.isSafeInteger(value)&&value>0;
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
export function validPublicId(value){ return typeof value==='string'&&/^[a-z0-9][a-z0-9_-]{2,79}$/.test(value); }
const enums={operacion:['venta','alquiler'],tipo:['casa','departamento','terreno'],moneda:['ARS','USD'],habitaciones:['1','2','3','4'],banos:['1','2','3'],orden:['precio-asc','precio-desc','superficie-asc','superficie-desc']};
const numeric=['precioMin','precioMax','superficieMin','superficieMax'];
const filterKeys=[...Object.keys(enums),'zona','provincia','localidad','comodidad',...numeric];
const queryKeys={list:[...filterKeys,'page','pageSize'],detail:['id'],featured:[],similar:['id'],options:['provincia','localidad','scope','page','pageSize']};
export function parsePublicQuery(action,params=new URLSearchParams()){
  if(!Object.hasOwn(queryKeys,action)||!(params instanceof URLSearchParams)||params.toString().length>4096)invalid();
  for(const key of params.keys())if(!queryKeys[action].includes(key)||(key!=='comodidad'&&params.getAll(key).length!==1))invalid();
  const result={action};
  if(action==='detail'||action==='similar'){if(!validPublicId(params.get('id')))invalid();result.id=params.get('id');}
  const filters={comodidades:[]};
  for(const key of filterKeys){
    const value=params.get(key);if(key==='comodidad'&&params.has(key)&&params.getAll(key).some(v=>v===''))invalid();if(value===null||value==='')continue;
    if(Object.hasOwn(enums,key)){if(!enums[key].includes(value))invalid();filters[key]=value;}
    else if(numeric.includes(key)){
      if(!/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(value))invalid();filters[key]=Number(value);
    }else if(key==='comodidad'){
      const values=params.getAll(key);if(values.length>30||values.some(v=>!text(v,100)||!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v)))invalid();
      filters.comodidades=[...new Set(values)].sort();
    }else if(key==='provincia'){if(!/^\d{2}$/.test(value))invalid();filters[key]=value;}
    else if(key==='localidad'){if(!uuid(value))invalid();filters[key]=value;}
    else {if(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)||value.length>100)invalid();filters[key]=value;}
  }
  if((filters.precioMin!==undefined||filters.precioMax!==undefined)&&!filters.moneda)invalid();
  for(const [min,max] of [['precioMin','precioMax'],['superficieMin','superficieMax']])if(filters[min]!==undefined&&filters[max]!==undefined&&filters[min]>filters[max])invalid();
  if(action==='options'){
    result.scope=params.get('scope')||'provinces';
    if(!['provinces','localities','zones','amenities'].includes(result.scope))invalid();
    if(result.scope==='localities'&&!filters.provincia)invalid();
    if(result.scope==='zones'&&!filters.localidad)invalid();
  }
  if(action==='list'||action==='options'){
    const integer=(key,fallback,max)=>{const v=params.get(key);if(v===null)return fallback;if(!/^[1-9]\d*$/.test(v)||Number(v)>max)invalid();return Number(v);};
    result.page=integer('page',1,1000);result.pageSize=integer('pageSize',DEFAULT_PAGE_SIZE,MAX_PAGE_SIZE);
  }
  if(action==='list'||action==='options')result.filters=filters;
  return result;
}
// Called only with a row selected by an anonymous, session-isolated DB client.
// This second check remains mandatory even if the caller accidentally uses admin data.
export function projectPublishedProperty(row,{detail=false}={}){
  if(row?.status!=='published')return null;
  if(!validPublicId(row.public_code)||!text(row.title,200)||!['casa','departamento','terreno'].includes(row.property_type)||!['venta','alquiler'].includes(row.operation)||!['ARS','USD'].includes(row.currency))return null;
  const price=typeof row.price==='string'&&/^\d+(\.\d{1,2})?$/.test(row.price)?Number(row.price):row.price;
  const area=typeof row.area==='string'&&/^\d+(\.\d{1,2})?$/.test(row.area)?Number(row.area):row.area;
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(area)||area<=0||!text(row.zone_slug,100)||!text(row.zone?.name,100)||!text(row.city,100)||row.area_unit!=='m²'||typeof row.is_demo!=='boolean'||typeof row.featured!=='boolean')return null;
  if(![row.bedrooms,row.bathrooms].every(v=>v===null||(Number.isSafeInteger(v)&&v>=0))||(row.property_type==='terreno'&&(row.bedrooms!==null||row.bathrooms!==null)))return null;
  const data={id:row.public_code,titulo:row.title,tipo:row.property_type,operacion:row.operation,precio:price,moneda:row.currency,zona:row.zone_slug,ubicacion:row.zone.name,ciudad:row.city,superficie:area,unidadSuperficie:row.area_unit,habitaciones:row.bedrooms,banos:row.bathrooms,destacada:row.featured,ficticia:row.is_demo,comodidades:[...new Set((row.property_amenities||[]).map(v=>v.amenity_slug).filter(v=>typeof v==='string'&&/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v)))],imagen:null};
  if(detail){if(!text(row.description,20000)||!text(row.approximate_location,1000))return null;data.descripcion=row.description;data.ubicacionAproximada=row.approximate_location;data.fotografias=[];}
  return data;
}
// Internal delivery plan, NOT a public DTO. Never accept these paths from a request.
export function authorizePublicImage(property,image){
  if(image?.image_active===false||!projectPublishedProperty(property)||!uuid(property.id)||image?.property_id!==property.id||!uuid(image.id)||image.processing_status!=='ready'||image.cleanup_requested_at!==null||!positive(image.width)||!positive(image.height)||!text(image.alt,500)||!['ai','licensed','owner_authorized'].includes(image.source_kind)||typeof image.illustrative!=='boolean'||(image.source_kind==='ai'&&!image.illustrative))return null;
  const base={width:image.width,height:image.height,alt:image.alt,sourceKind:image.source_kind,illustrative:image.illustrative};
  const prefix=`properties/${property.id}/${image.id}/`;
  let allowed;
  if(image.storage_kind==='managed'){
    if(!uuid(image.processing_token)||!text(image.processed_at,100)||!Number.isFinite(Date.parse(image.processed_at))||!/^\d{4}-/.test(image.processed_at)||! /^[a-f0-9]{64}$/.test(image.original_sha256)||image.verified_sha256!==image.original_sha256||image.storage_prefix!==prefix)return null;
    allowed=(src,width,ext)=>src===`${prefix}v-${image.processing_token}-${width}.${ext}`&&[...new Set([Math.min(480,image.width),Math.min(960,image.width),Math.min(1600,image.width)])].includes(width);
  }else if(image.storage_kind==='legacy'){
    allowed=(src,width,ext)=>typeof src==='string'&&new RegExp(`^assets/images/propiedades/${property.public_code}/[a-zA-Z0-9_-]+\\.${ext}$`).test(src)&&width<=image.width;
  }else return null;
  const variants=[];
  for(const [format,items] of [['webp',image.webp_variants],['jpg',image.jpeg_variants]]){
    if(!Array.isArray(items)||items.length<1||items.length>3)return null;
    const seen=new Set();
    for(const item of items){if(!positive(item.width)||seen.has(item.width)||!allowed(item.src,item.width,format))return null;seen.add(item.width);variants.push({format,width:item.width,key:item.src});}
    if(image.storage_kind==='managed'){
      const expected=[...new Set([Math.min(480,image.width),Math.min(960,image.width),Math.min(1600,image.width)])];
      if(seen.size!==expected.length||expected.some(w=>!seen.has(w)))return null;
    }
  }
  const largest=variants.filter(v=>v.format==='jpg').sort((a,b)=>b.width-a.width)[0];
  if(image.jpeg_path!==largest.key)return null;
  return {...base,delivery:image.storage_kind==='managed'?'signed':'local',bucket:image.storage_kind==='managed'?'nexo-property-images':null,variants,primaryKey:largest.key,ttlSeconds:image.storage_kind==='managed'?SIGNED_IMAGE_TTL_SECONDS:null};
}
export function publicImageDto(plan,urls,{projectUrl,issuedAt}={}){
  if(!plan)return null;
  const resolve=key=>{
    if(plan.delivery==='local')return key;
    try{
      const url=new URL(urls?.[key]);const origin=new URL(projectUrl);
      if(origin.protocol!=='https:'||url.origin!==origin.origin||url.username||url.password||url.hash||decodeURIComponent(url.pathname)!==`/storage/v1/object/sign/nexo-property-images/${key}`||!url.searchParams.get('token')||[...url.searchParams.keys()].some(k=>k!=='token'))return null;
      return url.href;
    }catch{return null;}
  };
  if(plan.delivery==='signed'&&(!Number.isSafeInteger(issuedAt)||issuedAt<0))return null;
  const converted=plan.variants.map(v=>({...v,src:resolve(v.key)}));if(converted.some(v=>!v.src))return null;
  return {src:resolve(plan.primaryKey),width:plan.width,height:plan.height,alt:plan.alt,sourceKind:plan.sourceKind,illustrative:plan.illustrative,webp:converted.filter(v=>v.format==='webp').map(v=>({src:v.src,width:v.width})),jpeg:converted.filter(v=>v.format==='jpg').map(v=>({src:v.src,width:v.width})),expiresAt:plan.delivery==='signed'?new Date(issuedAt+SIGNED_IMAGE_TTL_SECONDS*1000).toISOString():null};
}
function assertPublicDto(data,detail=false){
  const fields=detail?PUBLIC_DETAIL_FIELDS:PUBLIC_PROPERTY_FIELDS;
  if(!data||Object.keys(data).length!==fields.length||Object.keys(data).some(k=>!fields.includes(k)))throw new Error('Campos públicos inválidos.');
  const imageFields=['src','width','height','alt','sourceKind','illustrative','webp','jpeg','expiresAt'];
  for(const image of [data.imagen,...(detail?data.fotografias:[])]){
    if(image===null)continue;
    if(!image||Object.keys(image).length!==imageFields.length||Object.keys(image).some(k=>!imageFields.includes(k)))throw new Error('Campos de imagen inválidos.');
    for(const variants of [image.webp,image.jpeg])if(!Array.isArray(variants)||variants.some(v=>!v||Object.keys(v).length!==2||!Object.hasOwn(v,'src')||!Object.hasOwn(v,'width')))throw new Error('Variantes públicas inválidas.');
  }
}
export function detailEnvelope(data){assertPublicDto(data,true);return {version:PUBLIC_API_VERSION,data};}
export function publicError(code){
  const errors={INVALID_REQUEST:[400,'Parámetros de consulta inválidos.'],NOT_FOUND:[404,'Propiedad no disponible.'],UNAVAILABLE:[503,'Catálogo temporalmente no disponible.']};
  const safeCode=typeof code==='string'&&Object.hasOwn(errors,code)?code:'UNAVAILABLE';
  const [status,message]=errors[safeCode];return {status,body:{version:PUBLIC_API_VERSION,error:{code:safeCode,message}}};
}
export function listEnvelope(data,{page=1,pageSize=DEFAULT_PAGE_SIZE,total}={}){
  if(!Number.isSafeInteger(total)||total<0||!Number.isSafeInteger(page)||page<1||page>1000||!positive(pageSize)||pageSize>MAX_PAGE_SIZE||!Array.isArray(data)||data.length>pageSize)throw new Error('Respuesta pública inválida.');
  data.forEach(item=>assertPublicDto(item));
  return {version:PUBLIC_API_VERSION,data,pagination:{page,pageSize,total,totalPages:Math.ceil(total/pageSize),hasNext:page*pageSize<total}};
}
