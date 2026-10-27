import {publicDataConfig} from '../public-data-config.js';
const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export function isSignedPropertyImage(src,extension,{expiresAt,now=Date.now(),apiBaseUrl=publicDataConfig.apiBaseUrl}={}){
 try{
  const url=new URL(src),base=new URL(apiBaseUrl);const expiry=Date.parse(expiresAt);
  const expected=new RegExp(`^/storage/v1/object/sign/nexo-property-images/properties/${uuid}/${uuid}/v-${uuid}-[0-9]{1,4}\\.${extension}$`);
  return url.protocol==='https:'&&url.origin===base.origin&&!url.username&&!url.password&&!url.hash&&expected.test(url.pathname)&&url.searchParams.getAll('token').length===1&&/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(url.searchParams.get('token')||'')&&[...url.searchParams.keys()].every(k=>k==='token')&&Number.isFinite(expiry)&&expiry>now&&expiry<=now+301000;
 }catch{return false;}
}
export function imageCaption(image){return image?.sourceKind==='ai'||image?.src?.startsWith('assets/images/propiedades/')?'Ilustración generada con IA':image?.illustrative?'Imagen ilustrativa':'Fotografía de referencia';}
