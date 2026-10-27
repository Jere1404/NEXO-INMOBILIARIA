import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {createPublicCatalogHandler} from '../_shared/public-catalog-handler.mjs';
const url=Deno.env.get('SUPABASE_URL');
const publishableKey=Deno.env.get('NEXO_SUPABASE_PUBLISHABLE_KEY');
const serverKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const origins=(Deno.env.get('NEXO_ALLOWED_ORIGINS')||'').split(',').map(v=>v.trim()).filter(Boolean);
const settings={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
let handler;
try{
 const parsed=new URL(url);
 if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||!['','/'].includes(parsed.pathname)||!publishableKey?.startsWith('sb_publishable_')||!serverKey||!origins.length||origins.some(origin=>new URL(origin).origin!==origin||origin==='*'))throw new Error();
 handler=createPublicCatalogHandler({projectUrl:parsed.origin,allowedOrigins:origins,
  anonymousClient:()=>createClient(parsed.origin,publishableKey,settings),
  imageClient:()=>createClient(parsed.origin,serverKey,settings),
 });
}catch{
 handler=()=>new Response(JSON.stringify({version:1,error:{code:'UNAVAILABLE',message:'Catálogo temporalmente no disponible.'}}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
}
Deno.serve(handler);
