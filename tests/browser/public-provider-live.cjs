// Read-only browser preview: local public files at the Pages origin, live API/Storage GETs.
// Never writes the config, deploys, publishes, or forwards a browser session.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'../..'),pages='https://jere1404.github.io',prefix='/NEXO-INMOBILIARIA/';
const configPath=path.join(root,'assets/js/public-data-config.js'),originalConfig=fs.readFileSync(configPath,'utf8');
assert(originalConfig.includes("provider: 'json'"),'Repository must stay on JSON');
const api=new URL(/apiBaseUrl:\s*'([^']+)'/.exec(originalConfig)[1]);
const publicCode=process.env.NEXO_PREVIEW_PUBLIC_CODE;
if(publicCode)assert(/^[a-z0-9][a-z0-9_-]{2,79}$/.test(publicCode),'Invalid public code');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
(async()=>{
 let browser;const counts={api:0,images:0,blocked:0},operations={},errors=[];
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:process.env.NEXO_PREVIEW_HEADED!=='1',args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.name));
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   const deny=()=>{counts.blocked++;return route.abort();};
   if(request.method()!=='GET')return deny();
   if(url.origin===pages){
    if(url.pathname==='/favicon.ico')return route.fulfill({status:204});
    if(!url.pathname.startsWith(prefix))return deny();
    const relative=decodeURIComponent(url.pathname.slice(prefix.length));
    if(relative==='data/propiedades.json'||relative.startsWith('admin/')||relative.includes('/admin/')||relative.includes('/backend/'))return deny();
    if(!['index.html','propiedades.html','propiedad.html'].includes(relative)&&!relative.startsWith('assets/'))return deny();
    const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))return deny();
    try{
     let body=fs.readFileSync(file);if(file===configPath)body=Buffer.from(originalConfig.replace("provider: 'json'","provider: 'supabase'"));
     return route.fulfill({contentType:mime[path.extname(file)]||'application/octet-stream',body});
    }catch{return route.fulfill({status:404});}
   }
   if(url.origin!==api.origin)return deny();
   const isApi=url.pathname.startsWith(api.pathname+'/');
   const isImage=url.pathname.startsWith('/storage/v1/object/sign/nexo-property-images/properties/');
   if(!isApi&&!isImage)return deny();
   if(isApi){
    assert(['list','detail','featured','similar','options'].includes(url.pathname.slice(api.pathname.length+1)));
    assert(!request.headers().authorization&&!request.headers().cookie,'Unexpected public session');
    assert(!url.searchParams.has('utm_source'),'Tracking forwarded');
    assert.equal(request.headers().origin,pages,'Unexpected preview origin');
   }
   try{
    // Protected environment HTTPS transport; no token, apikey, cookies or visitor headers.
    const response=await fetch(url.href,{method:'GET',redirect:'error',headers:{Accept:isApi?'application/json':'image/*',...(isApi?{Origin:pages}:{})},signal:AbortSignal.timeout(25000)});
    const headers={};for(const name of ['content-type','cache-control','access-control-allow-origin','access-control-expose-headers']){const value=response.headers.get(name);if(value)headers[name]=value;}
    if(isApi){counts.api++;const action=url.pathname.slice(api.pathname.length+1);operations[action]=(operations[action]||0)+1;assert.equal(headers['access-control-allow-origin'],pages,'Live CORS mismatch');}
    else counts.images++;
    return route.fulfill({status:response.status,headers,body:Buffer.from(await response.arrayBuffer())});
   }catch{errors.push('LiveTransportError');return route.abort();} // Never log signed URLs/headers.
  });
  await page.goto(pages+prefix+'index.html');
  await page.waitForFunction(()=>document.querySelector('#featured-status').textContent.includes('Todavía')||document.querySelectorAll('#featured-properties .property-card').length>0);
  await page.goto(pages+prefix+'propiedades.html?utm_source=preview');
  await page.waitForFunction(()=>document.querySelector('#catalog-count').textContent.includes('propiedad'));
  assert(!await page.locator('#filter-controls').isDisabled());
  const visible=await page.locator('#catalog-properties .property-card').count();
  if(!visible){assert(await page.locator('#catalog-status').isVisible());assert(await page.locator('#empty-results').isHidden());}
  for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  if(publicCode){
   await page.goto(pages+prefix+'propiedad.html?id='+encodeURIComponent(publicCode));
   await page.locator('#property-detail').waitFor({state:'visible'});
   await page.waitForFunction(()=>document.querySelector('#gallery-image img')?.naturalWidth>0);
  }else{
   await page.goto(pages+prefix+'propiedad.html?id=nexo-preview-no-existe');await page.locator('#detail-error').waitFor({state:'visible'});
  }
  assert.deepEqual(errors,[]);assert.equal(counts.blocked,0);assert.equal(fs.readFileSync(configPath,'utf8'),originalConfig);
  console.log(JSON.stringify({result:'PASS',mode:'live-read-only',visibleOnFirstPage:visible,publishedDetailTest:!!publicCode,counts,operations,repositoryProvider:'json'}));
  if(process.env.NEXO_PREVIEW_HEADED==='1'){
   await page.goto(pages+prefix+'index.html');
   await page.evaluate(()=>{document.title='NEXO V5D.4 — PREVIEW AISLADA';});
   console.log('Isolated preview open; close with Ctrl+C. Do not use the address bar for administration.');
   await new Promise(resolve=>process.once('SIGINT',resolve));
  }
  await context.close();
 }finally{await browser?.close();assert.equal(fs.readFileSync(configPath,'utf8'),originalConfig);}
})().catch(error=>{console.error('Live preview failed: '+error.name);process.exitCode=1;});
