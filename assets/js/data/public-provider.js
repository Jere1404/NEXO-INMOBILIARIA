import {publicDataConfig} from '../public-data-config.js';
import {loadProperties} from '../property-cards.js';
import {filterProperties,sortProperties,parseFilters,validateFilters} from '../catalog-filters.js';
import {getSimilarProperties} from '../property-details.js';
import {PublicDataError,adaptPublicProperty,adaptPage} from './public-adapter.js';
const keys=['operacion','tipo','zona','moneda','habitaciones','banos','orden','precioMin','precioMax','superficieMin','superficieMax','provincia','localidad'];
export function publicSearchParams(filters={}){
 const params=new URLSearchParams();
 for(const key of keys){const v=filters[key];if(v!==undefined&&v!==null&&v!=='')params.set(key,String(v));}
 const amenities=Array.isArray(filters.comodidades)?filters.comodidades:[];
 for(const v of [...new Set(amenities)])params.append('comodidad',v);
 return params;
}
function pagination(page,pageSize){if(!Number.isSafeInteger(page)||page<1||page>1000||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>48)throw new PublicDataError('INVALID_REQUEST');}
export function createPublicDataProvider(config,{fetchImpl=globalThis.fetch,loadJson=loadProperties,timeoutMs=22000}={}){
 if(!['json','supabase'].includes(config.provider))throw new PublicDataError();
 let jsonPromise;
 const all=()=>jsonPromise??=Promise.resolve().then(loadJson).catch(e=>{jsonPromise=undefined;throw e;});
 let base;
 if(config.provider==='supabase'){
  base=new URL(config.apiBaseUrl);if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||base.pathname!=='/functions/v1/nexo-public-catalog')throw new PublicDataError();
 }
 async function request(action,params,signal){
  const url=new URL(base.href+'/'+action);url.search=params.toString();
  const controller=new AbortController();let timedOut=false;
  const abort=()=>controller.abort();if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
  try{
   const response=await fetchImpl(url.href,{method:'GET',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',redirect:'error',headers:{Accept:'application/json'},signal:controller.signal});
   const body=await response.json();
   if(!response.ok){if(response.status===404)return null;throw new PublicDataError(response.status===400?'INVALID_REQUEST':'UNAVAILABLE');}
   if(body?.version!==1||body.error)throw new PublicDataError();return body;
  }catch(e){if(signal?.aborted&&!timedOut)throw new DOMException('Solicitud cancelada','AbortError');if(e instanceof PublicDataError)throw e;throw new PublicDataError();}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 }
 const simple=async(action,id,signal)=>{
  const body=await request(action,new URLSearchParams(id?{id}:{}),signal);if(!body){if(action==='similar')return [];throw new PublicDataError();}
  if(!Array.isArray(body.data)||body.data.length>(action==='featured'?6:3))throw new PublicDataError();
  const data=body.data.map(v=>adaptPublicProperty(v));if((action==='similar'&&data.some(p=>p.id===id))||(action==='featured'&&data.some(p=>!p.destacada))||new Set(data.map(v=>v.id)).size!==data.length)throw new PublicDataError();return data;
 };
 const provider={
  kind:config.provider,
  async list({filters={},page=1,pageSize=config.pageSize||12,signal}={}){
   pagination(page,pageSize);
   if(config.provider==='supabase'){
    const params=publicSearchParams(filters);params.set('page',page);params.set('pageSize',pageSize);
    const body=await request('list',params,signal);if(!body)throw new PublicDataError();return {...adaptPage(body,{page,pageSize}),availableTotal:null};
   }
   const properties=await all();const choices={operacion:['venta','alquiler'],tipo:['casa','departamento','terreno'],zona:[...new Set(properties.map(p=>p.zona))],moneda:['ARS','USD'],habitaciones:['1','2','3','4'],banos:['1','2','3'],comodidades:[...new Set(properties.flatMap(p=>p.comodidades))]};
   const parsedResult=parseFilters(publicSearchParams(filters),choices);const parsed=parsedResult.filters;if(parsedResult.warnings.length||validateFilters(parsed))throw new PublicDataError('INVALID_REQUEST');
   const matching=sortProperties(filterProperties(properties,parsed),parsed.orden);return {properties:matching.slice((page-1)*pageSize,page*pageSize),total:matching.length,page,pageSize,totalPages:Math.ceil(matching.length/pageSize),hasNext:page*pageSize<matching.length,availableTotal:properties.length};
  },
  async featured({signal}={}){return config.provider==='json'?(await all()).filter(p=>p.destacada).slice(0,6):simple('featured',null,signal);},
  async detail(id,{signal}={}){
   if(typeof id!=='string'||!/^[a-z0-9][a-z0-9_-]{2,79}$/.test(id))return null;
   if(config.provider==='json')return (await all()).find(p=>p.id===id)||null;
   const body=await request('detail',new URLSearchParams({id}),signal);if(!body)return null;const property=adaptPublicProperty(body.data,{detail:true});if(property.id!==id)throw new PublicDataError();return property;
  },
  async similar(id,{signal}={}){if(typeof id!=='string'||!/^[a-z0-9][a-z0-9_-]{2,79}$/.test(id))return [];if(config.provider==='supabase')return simple('similar',id,signal);const properties=await all(),current=properties.find(p=>p.id===id);return current?getSimilarProperties(properties,current):[];},
  async options({scope='zones',provincia,localidad,page=1,pageSize=48,signal}={}){
   pagination(page,pageSize);
   if(!['provinces','localities','zones','amenities'].includes(scope))throw new PublicDataError('INVALID_REQUEST');
   if(config.provider==='supabase'){
    const params=new URLSearchParams({scope,page,pageSize});if(provincia)params.set('provincia',provincia);if(localidad)params.set('localidad',localidad);
    const body=await request('options',params,signal);if(!body)throw new PublicDataError();return adaptPage(body,{page,pageSize,options:true});
   }
   const properties=await all();let values;
   if(scope==='zones')values=[...new Map(properties.map(p=>[p.zona,p.ubicacion]))].map(([value,label])=>({value,label}));
   else if(scope==='amenities')values=[...new Set(properties.flatMap(p=>p.comodidades))].map(value=>({value,label:value.replaceAll('-',' ')}));
   else throw new PublicDataError('INVALID_REQUEST');
   values.sort((a,b)=>a.label.localeCompare(b.label,'es'));return {options:values.slice((page-1)*pageSize,page*pageSize),total:values.length,page,pageSize,totalPages:Math.ceil(values.length/pageSize),hasNext:page*pageSize<values.length};
  },
  async allOptions(options){
   const values=[];let page=1;
   do{const result=await provider.options({...options,page,pageSize:48});values.push(...result.options);if(!result.hasNext)return values;page++;}while(page<=20);
   throw new PublicDataError(); // Never silently truncate an option catalog.
  },
 };
 return provider;
}
export const publicData=createPublicDataProvider(publicDataConfig);
