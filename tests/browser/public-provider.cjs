// Local only: switch the provider in intercepted JS, never in the repository.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..'),prefix='/NEXO-INMOBILIARIA/';
const original=JSON.parse(fs.readFileSync(path.join(root,'data/propiedades.json')));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json'};
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/favicon.ico'){res.statusCode=204;return res.end();}
 const file=path.resolve(root,decodeURIComponent(pathname.slice(prefix.length)));
 if(!pathname.startsWith(prefix)||!file.startsWith(root+path.sep)){res.statusCode=404;return res.end();}
 try{res.setHeader('Content-Type',mime[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}
});
(async()=>{
 const {filterProperties,sortProperties,parseFilters}=await import(pathToFileURL(path.join(root,'assets/js/catalog-filters.js')));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const local=`http://127.0.0.1:${server.address().port}`,base=local+prefix,project='https://ugrqstsuhamjjewusigh.supabase.co';
 let browser;try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
 const errors=[],unexpected=[],calls=[];let mode='populated',imageMode='normal',slowGate,releaseSlow;
 await context.addCookies([{name:'nexo_admin_fixture',value:'local_fake_value',domain:'ugrqstsuhamjjewusigh.supabase.co',path:'/'}]);
 await context.addInitScript(()=>{sessionStorage.setItem('nexo-admin-fixture','local_fake_session');});
 page.on('pageerror',e=>errors.push(e.message));
 const id='11111111-1111-4111-8111-111111111111';
 const image={src:`${project}/storage/v1/object/sign/nexo-property-images/properties/${id}/${id}/v-${id}-960.jpg?token=fake.payload.signature`,width:960,height:720,alt:'Frente de referencia',webp:[],jpeg:[],expiresAt:new Date(Date.now()+240000).toISOString(),sourceKind:'owner_authorized',illustrative:true};
 image.webp=[{src:image.src.replace('-960.jpg','-960.webp'),width:960}];
 image.jpeg=[{src:image.src,width:960}];
 const rows=[...original.map(v=>({...v,imagen:image})),{...original[0],id:'nexo-013',titulo:'Propiedad de prueba trece',imagen:image}];
 const choices={operacion:['venta','alquiler'],tipo:['casa','departamento','terreno'],zona:[...new Set(rows.map(v=>v.zona))],moneda:['ARS','USD'],habitaciones:['1','2','3','4'],banos:['1','2','3'],comodidades:[...new Set(rows.flatMap(v=>v.comodidades))]};
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.origin===local){
   if(u.pathname.endsWith('/public-data-config.js'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'assets/js/public-data-config.js'),'utf8').replace("provider: 'json'","provider: 'supabase'")});
   if(u.pathname.endsWith('/data/propiedades.json')){unexpected.push('JSON fallback');return route.abort();}
   return route.continue();
  }
  if(u.origin===project&&u.pathname.startsWith('/storage/v1/object/sign/nexo-property-images/')){if(imageMode==='broken')return route.fulfill({status:403,body:'Expired fixture'});const webp=u.pathname.endsWith('.webp');return route.fulfill({contentType:webp?'image/webp':'image/jpeg',body:fs.readFileSync(path.join(root,'assets/images/propiedades/nexo-001/principal-480.'+(webp?'webp':'jpg')))});}
  if(u.origin!==project||!u.pathname.startsWith('/functions/v1/nexo-public-catalog/')){unexpected.push(u.origin+u.pathname);return route.abort();}
  const headersReceived=route.request().headers();assert(!headersReceived.authorization&&!headersReceived.cookie&&!headersReceived.apikey);assert(!headersReceived.referer);
  calls.push({action:u.pathname.split('/').at(-1),params:u.searchParams});assert(!u.searchParams.has('utm_source'));
  const action=calls.at(-1).action,headers={'Access-Control-Allow-Origin':local,'Content-Type':'application/json'};
  if(((mode==='error'||mode==='offline')&&action==='list')||(mode==='similar-error'&&action==='similar')){if(mode==='offline')return route.abort();return route.fulfill({status:503,headers,body:JSON.stringify({version:1,error:{code:'UNAVAILABLE'}})});}
  let body,status=200;
  const available=mode==='empty'?[]:rows;
  if(action==='options'){
   const options=u.searchParams.get('scope')==='zones'?[...new Map(rows.map(v=>[v.zona,v.ubicacion]))].map(([value,label])=>({value,label})):choices.comodidades.map(value=>({value,label:value}));
   body={version:1,data:options,pagination:{page:1,pageSize:48,total:options.length,totalPages:1,hasNext:false}};
  }else if(action==='list'){
   const filters=parseFilters(u.searchParams,choices).filters;
   const result=sortProperties(filterProperties(available,filters),filters.orden),current=Number(u.searchParams.get('page')),size=Number(u.searchParams.get('pageSize'));
   let pageRows=result.slice((current-1)*size,current*size);
   if(mode==='expired')pageRows=pageRows.map(v=>({...v,imagen:{...image,expiresAt:new Date(Date.now()-1000).toISOString()}}));
   if(mode==='jpeg')pageRows=pageRows.map(v=>({...v,imagen:{...image,webp:[]}}));
   if(mode==='local')pageRows=pageRows.map(v=>({...v,imagen:original[0].imagen}));
   body={version:1,data:pageRows,pagination:{page:current,pageSize:size,total:result.length,totalPages:Math.ceil(result.length/size),hasNext:current*size<result.length}};
   if(mode==='slow')await slowGate;
   else if(mode==='race'&&filters.tipo==='casa')await new Promise(r=>setTimeout(r,250));
  }else if(action==='featured')body={version:1,data:available.filter(v=>v.destacada).slice(0,6)};
  else if(action==='detail'){const found=available.find(v=>v.id===u.searchParams.get('id'));body=found?{version:1,data:found}:{version:1,error:{code:'NOT_FOUND'}};if(!found)status=404;}
  else if(action==='similar')body={version:1,data:available.filter(v=>v.id!==u.searchParams.get('id')).slice(0,3)};
  else throw new Error('Unexpected action');
  try{await route.fulfill({status,headers,body:JSON.stringify(body)});}catch{ /* A superseded query can be aborted. */ }
 });
 await page.setViewportSize({width:1440,height:1000});
 await page.goto(base+'propiedades.html?utm_source=chatgpt.com');
 await page.waitForFunction(()=>document.querySelectorAll('#catalog-properties .property-card').length===12);
 assert.match(await page.locator('#catalog-count').textContent(),/13 propiedades/);
 await page.getByRole('navigation',{name:'Páginas del catálogo'}).getByRole('button',{name:'Siguiente'}).click();
 await page.waitForFunction(()=>document.querySelectorAll('#catalog-properties .property-card').length===1);assert.match(page.url(),/page=2/);
 await page.goBack();await page.waitForFunction(()=>document.querySelectorAll('#catalog-properties .property-card').length===12);
 await page.goForward();await page.waitForFunction(()=>document.querySelectorAll('#catalog-properties .property-card').length===1);await page.goBack();await page.waitForFunction(()=>document.querySelectorAll('#catalog-properties .property-card').length===12);
 await page.locator('#filter-currency').selectOption('USD');await page.locator('#price-max').fill('0');await page.getByRole('button',{name:'Aplicar filtros'}).click();await page.locator('#empty-results').waitFor({state:'visible'});
 await page.locator('#clear-empty').click();await page.waitForFunction(()=>document.querySelectorAll('#catalog-properties .property-card').length===12);
 mode='race';await page.locator('#filter-type').selectOption('casa');await page.getByRole('button',{name:'Aplicar filtros'}).click();await page.locator('#filter-type').selectOption('departamento');await page.getByRole('button',{name:'Aplicar filtros'}).click();
 await page.waitForFunction(()=>[...document.querySelectorAll('#catalog-properties .property-type')].length>0&&[...document.querySelectorAll('#catalog-properties .property-type')].every(n=>n.textContent==='Departamento'));await page.waitForTimeout(300);
 assert((await page.locator('#catalog-properties .property-type').allTextContents()).every(v=>v==='Departamento'));
 mode='populated';await page.goto(base+'propiedades.html?page=99');await page.waitForFunction(()=>document.querySelector('#catalog-status').textContent.includes('Esta página'));await page.getByRole('navigation',{name:'Páginas del catálogo'}).getByRole('button',{name:'Anterior'}).click();await page.waitForFunction(()=>document.querySelectorAll('#catalog-properties .property-card').length===1);assert.match(page.url(),/page=2/);
 mode='empty';await page.goto(base+'propiedades.html');await page.waitForFunction(()=>document.querySelector('#catalog-status').textContent.includes('Todavía no hay'));assert(await page.locator('#empty-results').isHidden());
 mode='error';await page.reload();await page.waitForFunction(()=>document.querySelector('#catalog-count').textContent==='Catálogo no disponible');assert(await page.locator('#empty-results').isHidden());
 mode='populated';await page.goto(base+'index.html');await page.waitForFunction(()=>document.querySelectorAll('#featured-properties .property-card').length===6);
 await page.goto(base+'propiedad.html?id=nexo-001');await page.locator('#property-detail').waitFor({state:'visible'});assert.equal(await page.locator('#detail-title').textContent(),original[0].titulo);await page.waitForFunction(()=>document.querySelectorAll('#similar-properties .property-card').length===3);
 await page.waitForFunction(()=>document.querySelector('#gallery-image img')?.naturalWidth>0);assert.match(await page.locator('#gallery-caption').textContent(),/Imagen ilustrativa/);assert.match(await page.locator('#gallery-image source').getAttribute('srcset'),/960w/);assert.match(await page.locator('#gallery-image img').getAttribute('srcset'),/960w/);
 await page.goto(base+'propiedad.html?id=nexo-missing');await page.locator('#detail-error').waitFor({state:'visible'});
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});await page.goto(base+'propiedades.html');await page.waitForFunction(()=>document.querySelectorAll('#catalog-properties .property-card').length===12);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow at ${width}`);
  if(process.env.NEXO_PREVIEW_SCREENSHOTS&&[390,1440].includes(width)){const directory=path.resolve(process.env.NEXO_PREVIEW_SCREENSHOTS);fs.mkdirSync(directory,{recursive:true});await page.waitForFunction(()=>document.querySelector('#catalog-properties img')?.naturalWidth>0);await page.screenshot({path:path.join(directory,`catalog-api-${width}.png`)});}
 }
 // Extra V5D.4 scenarios: no administrative session, image fallbacks, expiry and loading.
 mode='jpeg';await page.goto(base+'propiedades.html');await page.waitForFunction(()=>document.querySelector('#catalog-properties img')?.naturalWidth>0);assert.equal(await page.locator('#catalog-properties source').count(),0);assert.match(await page.locator('#catalog-properties img').first().getAttribute('srcset'),/960w/);
 mode='local';await page.reload();await page.waitForFunction(()=>document.querySelector('#catalog-properties img')?.naturalWidth>0);assert.match(await page.locator('#catalog-properties img').first().getAttribute('src'),/^assets\//);
 mode='expired';await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#catalog-properties .property-card').length===12);assert.equal(await page.locator('#catalog-properties img').count(),0);assert(await page.locator('#catalog-properties .property-image-placeholder').first().isVisible());
 mode='populated';imageMode='broken';await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#catalog-properties .property-card').length===12);await page.waitForFunction(()=>!document.querySelector('#catalog-properties > li:first-child picture'));assert(await page.locator('#catalog-properties .property-image-placeholder').first().isVisible());imageMode='normal';
 mode='offline';await page.reload();await page.waitForFunction(()=>document.querySelector('#catalog-count').textContent==='Catálogo no disponible');assert(await page.locator('#empty-results').isHidden());
 slowGate=new Promise(resolve=>{releaseSlow=resolve;});mode='slow';await page.reload();await page.locator('#catalog-properties[aria-busy="true"]').waitFor({state:'attached'});assert.match(await page.locator('#catalog-count').textContent(),/Cargando/);releaseSlow();await page.waitForFunction(()=>document.querySelectorAll('#catalog-properties .property-card').length===12);
 mode='similar-error';await page.goto(base+'propiedad.html?id=nexo-001');await page.locator('#property-detail').waitFor({state:'visible'});assert(await page.locator('#similar-section').isHidden());
 assert(await page.locator('#whatsapp-link').isHidden());assert.match(await page.locator('#inquiry-message').inputValue(),/nexo-001/);assert.match(await page.locator('#inquiry-message').inputValue(),/propiedad\.html\?id=nexo-001/);
 mode='populated';await page.setViewportSize({width:390,height:900});await page.goto(base+'propiedades.html');await page.waitForFunction(()=>document.querySelectorAll('#catalog-properties .property-card').length===12);await page.locator('.menu-toggle').click();assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'true');await page.locator('.menu-toggle').click();assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'false');
 await page.locator('#filter-panel summary').focus();await page.keyboard.press('Enter');assert(await page.locator('#filter-panel').evaluate(n=>n.open));
 await page.waitForFunction(()=>document.querySelector('#catalog-properties img')?.naturalWidth>0);await page.clock.install();await page.clock.fastForward(310000);await page.evaluate(()=>{document.querySelector('#catalog-properties img').dispatchEvent(new Event('error'));});assert.match(await page.locator('#catalog-properties .property-image-placeholder').first().textContent(),/venció/);assert(await page.locator('#catalog-properties .property-image-placeholder').first().isVisible());
 assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);assert(calls.some(v=>v.action==='list'&&v.params.get('page')==='2'));
 console.log('PASS: Supabase provider simulated end-to-end, signed images, pages/history, filters/reset/races, empty/error/not-found, featured/detail/similar, 320/390/768/1440; no JSON fallback or remote requests; V5D.4 session isolation, JPEG/local/expired/broken images, timeout/offline/loading, keyboard/menu and WhatsApp checks.');
 await context.close();
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
