import {parsePublicQuery,listEnvelope,detailEnvelope,publicError,PublicRequestError,PUBLIC_API_VERSION} from './public-catalog-contract.mjs';
import {createPublicCatalogRepository,CatalogNotFound} from './public-catalog-repository.mjs';
export function createPublicCatalogHandler({anonymousClient,imageClient,projectUrl,allowedOrigins=[],timeoutMs=20000,now}){
 return async request=>{
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
  const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  const origin=request.headers.get('origin');
  if(origin&&!allowedOrigins.includes(origin))return respond({version:1,error:{code:'ORIGIN_DENIED',message:'Origen no permitido.'}},403);
  if(origin)headers['Access-Control-Allow-Origin']=origin;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'apikey, authorization, content-type, x-client-info','Access-Control-Max-Age':'300'}});
  if(request.method!=='GET')return respond({version:1,error:{code:'METHOD_NOT_ALLOWED',message:'Solo se admiten consultas GET.'}},405);
  let timer;
  try{
   const url=new URL(request.url);const match=/\/nexo-public-catalog(?:\/(list|detail|featured|similar|options))?\/?$/.exec(url.pathname);
   if(!match)throw new PublicRequestError();
   const query=parsePublicQuery(match[1]||'list',url.searchParams);
   const controller=new AbortController();timer=setTimeout(()=>controller.abort(),timeoutMs);
   // Never pass request Authorization, cookies, actor IDs or sessions to either factory.
   const repository=createPublicCatalogRepository({anonymous:anonymousClient(),images:imageClient(),projectUrl,signal:controller.signal,now});
   const execute=async()=>{
    if(query.action==='detail')return detailEnvelope(await repository.detail(query.id));
    if(query.action==='list'){const {data,total}=await repository.list(query);return listEnvelope(data,{...query,total});}
    if(query.action==='options'){const {data,total}=await repository.options(query);return {version:PUBLIC_API_VERSION,data,pagination:{page:query.page,pageSize:query.pageSize,total,totalPages:Math.ceil(total/query.pageSize),hasNext:query.page*query.pageSize<total}};}
    return {version:PUBLIC_API_VERSION,data:await repository[query.action](query.id)};
   };
   const abort=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(new Error('timeout')),{once:true}));
   return respond(await Promise.race([execute(),abort]));
  }catch(error){const result=publicError(error instanceof PublicRequestError?'INVALID_REQUEST':error instanceof CatalogNotFound?'NOT_FOUND':'UNAVAILABLE');return respond(result.body,result.status);}
  finally{clearTimeout(timer);}
 };
}
