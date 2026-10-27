import {getPropertyImage} from '../property-cards.js';
export class PublicDataError extends Error {
  constructor(code='UNAVAILABLE'){super(code==='INVALID_REQUEST'?'Revisá los filtros seleccionados.':'No pudimos cargar las propiedades. Intentá nuevamente.');this.code=code;}
}
const nonempty=v=>typeof v==='string'&&!!v.trim();
function adaptImage(value){
 const image=getPropertyImage(value);if(!image)return null;
 const safe={src:image.src,width:image.width,height:image.height,alt:image.alt,webp:image.webp.map(v=>({src:v.src,width:v.width})),jpeg:image.jpeg.map(v=>({src:v.src,width:v.width}))};
 if(['ai','licensed','owner_authorized'].includes(image.sourceKind))safe.sourceKind=image.sourceKind;
 if(typeof image.illustrative==='boolean')safe.illustrative=image.illustrative;
 if(image.expiresAt)safe.expiresAt=image.expiresAt;
 return safe;
}
export function adaptPublicProperty(value,{detail=false}={}){
 if(!value||!/^([a-z0-9][a-z0-9_-]{2,79})$/.test(value.id||'')||!['casa','departamento','terreno'].includes(value.tipo)||!['venta','alquiler'].includes(value.operacion)||!['ARS','USD'].includes(value.moneda)||!Number.isFinite(value.precio)||value.precio<=0||!Number.isFinite(value.superficie)||value.superficie<=0||!['titulo','zona','ubicacion','ciudad','unidadSuperficie'].every(k=>nonempty(value[k]))||value.unidadSuperficie!=='m²'||typeof value.ficticia!=='boolean'||typeof value.destacada!=='boolean'||!Array.isArray(value.comodidades)||value.comodidades.some(v=>!nonempty(v))||!['habitaciones','banos'].every(k=>value[k]===null||(Number.isSafeInteger(value[k])&&value[k]>=0))||(value.tipo==='terreno'&&(value.habitaciones!==null||value.banos!==null)))throw new PublicDataError();
 const property=Object.fromEntries(['id','titulo','tipo','operacion','precio','moneda','zona','ubicacion','ciudad','superficie','unidadSuperficie','habitaciones','banos','destacada','ficticia'].map(k=>[k,value[k]]));
 property.comodidades=[...new Set(value.comodidades)];property.imagen=adaptImage(value.imagen);
 // Detail-only information is never invented from a card response.
 if(detail){if(!nonempty(value.descripcion)||!nonempty(value.ubicacionAproximada)||!Array.isArray(value.fotografias)||value.fotografias.length>19)throw new PublicDataError();property.descripcion=value.descripcion;property.ubicacionAproximada=value.ubicacionAproximada;property.fotografias=value.fotografias.map(adaptImage).filter(Boolean);}
 return property;
}
export function adaptPage(body,{page,pageSize,options=false}={}){
 const p=body?.pagination;
 if(body?.version!==1||!Array.isArray(body.data)||!p||p.page!==page||p.pageSize!==pageSize||!Number.isSafeInteger(p.total)||p.total<0||p.totalPages!==Math.ceil(p.total/pageSize)||p.hasNext!==(page*pageSize<p.total)||body.data.length>pageSize||body.data.length>p.total)throw new PublicDataError();
 const data=options?body.data.map(v=>{if(!nonempty(v?.value)||!nonempty(v.label))throw new PublicDataError();return {value:v.value,label:v.label};}):body.data.map(v=>adaptPublicProperty(v));
 if(new Set(data.map(v=>options?v.value:v.id)).size!==data.length)throw new PublicDataError();
 return {properties:options?undefined:data,options:options?data:undefined,...p};
}
