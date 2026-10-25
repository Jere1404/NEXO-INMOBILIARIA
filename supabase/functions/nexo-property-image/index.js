import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import * as magick from 'npm:@imagemagick/magick-wasm@0.0.45';
import { createMagickCodec } from '../_shared/magick-codec.mjs';
import { createImageHandler } from '../_shared/handler.mjs';

const url=Deno.env.get('SUPABASE_URL');
const publicKey=Deno.env.get('NEXO_SUPABASE_PUBLISHABLE_KEY');
const serverKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const allowedOrigins=(Deno.env.get('NEXO_ALLOWED_ORIGINS')||'').split(',').map(v=>v.trim()).filter(Boolean);
const settings={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const configured=!!url&&publicKey?.startsWith('sb_publishable_')&&!!serverKey&&allowedOrigins.length>0&&!allowedOrigins.includes('*');
const handler=configured?createImageHandler({
 publicClient:authorization=>createClient(url,publicKey,{...settings,global:{headers:{Authorization:authorization}}}),
 serverClient:()=>createClient(url,serverKey,settings),
 codec:createMagickCodec(magick,()=>Deno.readFile(new URL('./magick.wasm',import.meta.url))),
 allowedOrigins,
}):()=>new Response(JSON.stringify({code:'BACKEND_NOT_CONFIGURED'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(handler);
