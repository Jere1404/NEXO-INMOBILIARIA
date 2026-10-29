// Optional local Chromium integration. All Supabase HTTP is intercepted; other remote requests are blocked.
// Install Playwright outside the project and set PLAYWRIGHT_MODULE to its absolute module path if needed.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '../..');
const host = 'ugrqstsuhamjjewusigh.supabase.co';
const property = '33333333-3333-4333-8333-333333333333';
const locality = '00000000-0000-4000-8000-000000000018';
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'fixture@example.test', aud: 'authenticated', role: 'authenticated' };
const jpg = fs.readFileSync(path.join(root, 'assets/images/propiedades/nexo-001/principal-480.jpg'));
const prefix = '/NEXO-INMOBILIARIA/';
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/favicon.ico') { res.statusCode = 204; return res.end(); }
  const file = path.resolve(root, decodeURIComponent(pathname.slice(prefix.length)));
  if (!pathname.startsWith(prefix) || !file.startsWith(root + path.sep)) { res.statusCode = 404; return res.end(); }
  try { res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file)); }
  catch { res.statusCode = 404; res.end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`, base = origin + prefix;
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    const page = await context.newPage(), errors = [], unexpected = [];
    page.on('pageerror', error => errors.push(error.message));
    const state = { enabled: true, failProcess: true, failList: false, failListAfterProcess: false, failSigned: false, failImage: false, originals: new Set(), images: [], replacements: [], reserves: [], uploads: 0, processes: 0, saves: 0 };
    let jsonRollback = false;
    let row = { id: property, version: 1, public_code: 'nexo-local-fixture', title: 'Casa ficticia local', description: 'Descripción de prueba local', property_type: 'casa', operation: 'venta', status: 'draft', price: 150000, currency: 'USD', zone_slug: 'centro', city: 'Corrientes Capital', area: 120, bedrooms: 2, bathrooms: 1, approximate_location: 'Zona Centro', featured: false, is_demo: true };
    await context.addInitScript(({ host, user }) => {
      const token = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) + '.' + btoa(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })) + '.local-fixture';
      sessionStorage.setItem('sb-' + host.split('.')[0] + '-auth-token', JSON.stringify({ access_token: token, refresh_token: 'local-refresh-fixture', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user }));
    }, { host, user });
    await context.routeWebSocket(/.*/, route => { unexpected.push('WebSocket blocked'); route.close(); });
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url()), pathname = url.pathname;
      if (jsonRollback && url.origin === origin && pathname.endsWith('/public-data-config.js')) return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(root, 'assets/js/public-data-config.js'), 'utf8').replace("provider: 'supabase'", "provider: 'json'") });
      if (url.origin === origin) return route.continue();
      if (url.origin !== 'https://' + host) { unexpected.push(req.method() + ' ' + url.origin); return route.abort(); }
      const headers = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization,apikey,content-type,x-client-info', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
      const reply = (data, status = 200) => route.fulfill({ status, json: data, headers });
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (pathname === '/auth/v1/user') return reply(user);
      if (pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers });
      if (pathname.endsWith('/admin_memberships')) return reply({ user_id: user.id, enabled: state.enabled, role: 'admin' });
      if (pathname.endsWith('/amenities')) return reply([{ slug: 'patio', name: 'Patio' }]);
      if (pathname.endsWith('/property_amenities')) return reply([{ amenity_slug: 'patio' }]);
      if (pathname.endsWith('/properties')) return reply(row);
      if (pathname.endsWith('/provinces')) return reply([{ code: '18', name: 'Corrientes' }]);
      if (pathname.endsWith('/localities')) {
        const values = [{ id: locality, name: 'Corrientes Capital', province_code: '18' }];
        return reply(url.searchParams.has('id') ? values[0] : values);
      }
      if (pathname.endsWith('/zones')) {
        const values = [{ slug: 'centro', name: 'Centro', locality_id: locality }];
        return reply(url.searchParams.has('slug') ? values[0] : values);
      }
      if (pathname.endsWith('/image_replacements')) return reply(state.replacements);
      if (pathname.endsWith('/property_images')) {
        let rows=state.images;
        if(url.searchParams.has('image_active')) rows=rows.filter(r=>r.image_active!==false);
        if(url.searchParams.has('id')){const ids=url.searchParams.get('id').slice(4,-1).split(',');rows=rows.filter(r=>ids.includes(r.id));}
        return state.failList ? reply({ message: 'Local simulated failure' }, 503) : reply(rows);
      }
      if (pathname.endsWith('/rpc/admin_save_property')) {
        state.saves++; const args = req.postDataJSON(); row = { ...row, ...args.p_data, id: property, version: row.version + 1 }; return reply(row);
      }
      if (pathname === '/functions/v1/nexo-property-image') {
        assert.equal(req.method(), 'POST'); assert(req.headers().authorization?.startsWith('Bearer ')); assert.equal(JSON.parse(Buffer.from(req.headers().authorization.slice(7).split('.')[1], 'base64').toString()).sub, user.id);
        const body = req.postDataJSON();
        if (['confirmReplacement','revertReplacement'].includes(body.action)) {
          const op=state.replacements.find(op=>op.id===body.requestId);assert(op);
          const source=state.images.find(r=>r.id===op.source_image_id),candidate=state.images.find(r=>r.id===op.candidate_image_id);
          if(body.action==='confirmReplacement'){
            assert.equal(candidate.processing_status,'ready');
            candidate.position=source.position;candidate.is_primary=source.is_primary;candidate.image_active=true;
            source.position=op.candidate_position;source.is_primary=false;source.image_active=false;op.state='confirmed';
          }else{
            if(op.state==='confirmed')Object.assign(source,op.original);
            candidate.position=op.candidate_position;candidate.is_primary=false;candidate.image_active=false;op.state='reverted';
          }
          return reply({id:op.id,property_id:property,state:op.state});
        }
        if (body.action === 'reserve'||body.action === 'prepareReplacement') {
          state.reserves.push(body);
          let image = state.images.find(value => value.id === body.requestId);
          if (image && (image.alt !== body.alt || image.source_kind !== body.sourceKind || image.illustrative !== body.illustrative)) return reply({ code: 'INVALID_REQUEST' }, 400);
          if (!image) { image = { id: body.requestId, property_id: property, storage_kind: 'managed', image_active:body.action!=='prepareReplacement',is_primary:false,position:state.images.length, processing_status: 'pending', processing_attempts: 0, alt: body.alt, source_kind: body.sourceKind, illustrative: body.illustrative, storage_prefix: `properties/${property}/${body.requestId}/`, original_object_key: `properties/${property}/${body.requestId}/original.jpg` }; state.images.push(image); }
          if(body.action==='prepareReplacement'&&!state.replacements.some(op=>op.id===image.id)){
            const source=state.images.find(r=>r.id===body.sourceImageId);assert(source);
            state.replacements.push({id:image.id,property_id:property,source_image_id:source.id,candidate_image_id:image.id,state:'prepared',candidate_position:image.position,original:{...source}});
          }
          return reply(image);
        }
        assert.equal(body.action, 'process'); state.processes++;
        const image = state.images.find(value => value.id === body.imageId); assert(image); image.processing_attempts++;
        if (state.failProcess) { image.processing_status = 'failed'; image.processing_error = 'DECODE_FAILED'; return reply({ code: 'DECODE_FAILED' }, 400); }
        image.processing_status = 'ready'; image.processing_error = null; image.width = 480; image.height = 360;
        image.jpeg_path = image.storage_prefix + 'v-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-480.jpg';
        if (state.failListAfterProcess) state.failList = true;
        return reply(image);
      }
      if (pathname.startsWith('/storage/v1/object/nexo-property-originals/')) {
        assert.equal(req.method(), 'POST'); state.uploads++; if (state.originals.has(pathname)) return reply({ statusCode: '409', message: 'Already exists' }, 409); state.originals.add(pathname); return reply({ Key: pathname });
      }
      if (pathname.startsWith('/storage/v1/object/sign/nexo-property-images/')) {
        if (req.method() === 'POST') return state.failSigned ? reply({ error: 'Fixture signature failure' }, 503) : reply({ signedURL: pathname.replace('/storage/v1', '') + '?token=local-preview-fixture' });
        return state.failImage ? reply({ message: 'Fixture image download failure' }, 503) : route.fulfill({ headers, contentType: 'image/jpeg', body: jpg });
      }
      unexpected.push(req.method() + ' ' + pathname); return route.abort();
    });
    const open = async (id = property) => {
      await page.goto(base + 'admin/propiedad.html' + (id ? '?id=' + id : ''));
      await page.locator('#property-form').waitFor({ state: 'visible' });
      await page.locator('#image-panel').waitFor({ state: 'visible' });
    };
    const select = async () => {
      // setInputFiles bypasses native actionability; wait until a user could select files.
      await page.waitForFunction(() => !document.querySelector('#image-controls').disabled);
      await page.locator('#image-files').setInputFiles({ name: 'fotografia.jpg', mimeType: 'image/jpeg', buffer: jpg });
      await page.locator('#image-alt-0').fill('Casa ficticia ilustrativa');
      await page.locator('#image-source').selectOption('ai');
    };
    const upload = () => page.locator('#upload-images').click();
    const legacy = { id: '44444444-4444-4444-8444-444444444444', property_id: property, storage_kind: 'legacy', image_active:true,is_primary:true,position:0, processing_status: 'ready', processing_attempts: 0, alt: 'Fotografía heredada de referencia', jpeg_path: 'assets/images/propiedades/nexo-001/principal-960.jpg', width: 960, height: 720, webp_variants: [], jpeg_variants: [] };
    state.images.push(legacy);
    const legacyBefore = JSON.stringify(legacy);
    const managed = () => state.images.find(value => value.storage_kind === 'managed');
    await open();
    await page.locator('#image-gallery img').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('#image-gallery img[alt="Fotografía heredada de referencia"]')?.naturalWidth > 0);
    assert.equal(await page.locator('#image-gallery img').getAttribute('src'), base + legacy.jpeg_path);
    await page.locator('#image-files').setInputFiles({ name: 'foto.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
    await page.waitForFunction(() => document.querySelector('#image-status').textContent.includes('Solo se admiten'));
    assert.equal(state.reserves.length, 0);
    await page.locator('#image-files').setInputFiles({ name: 'grande.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(10485761) });
    await page.waitForFunction(() => document.querySelector('#image-status').textContent.includes('10 MiB'));
    assert.equal(state.reserves.length, 0);
    await page.locator('#image-files').setInputFiles({ name: 'contenido-incorrecto.png', mimeType: 'image/png', buffer: jpg });
    await page.locator('#image-alt-0').fill('Archivo inválido local'); await page.locator('#image-source').selectOption('ai'); await upload();
    await page.waitForFunction(() => document.querySelector('#image-queue').textContent.includes('no coincide'));
    assert.equal(state.reserves.length, 0);
    await select(); await upload();
    await page.waitForFunction(() => document.querySelector('#image-status').textContent.includes('Algunas fotografías'));
    assert.equal(state.images.length, 2); assert.equal(state.uploads, 1);
    assert(await page.locator('#image-alt-0').isDisabled()); assert(await page.locator('#image-source').isDisabled());
    assert((await page.locator('#image-gallery').textContent()).includes('decodificar'));
    // Replay the same queue after an uncertain processing result: same UUID and metadata.
    state.failProcess = false; state.failListAfterProcess = true;
    await upload();
    await page.waitForFunction(() => document.querySelector('#image-status').textContent.includes('No pudimos cargar'));
    assert.equal(state.images.length, 2); assert.equal(state.originals.size, 1); assert.deepEqual(state.reserves[0], state.reserves[1]);
    assert(!(await page.locator('#image-status').textContent()).includes('Todas las fotografías'));
    state.failList = false; state.failListAfterProcess = false; state.failSigned = true;
    await page.locator('#refresh-images').click();
    await page.waitForFunction(() => document.querySelector('#image-status').textContent.includes('vista previa'));
    assert((await page.locator('#image-gallery').textContent()).includes('guardada'));
    state.failSigned = false; state.failImage = true; await page.locator('#refresh-images').click();
    await page.waitForFunction(() => document.querySelector('#image-status').textContent.includes('vista previa'));
    state.failImage = false; await page.locator('#refresh-images').click();
    await page.waitForFunction(() => document.querySelector('#image-gallery img[alt="Casa ficticia ilustrativa"]')?.naturalWidth > 0);
    assert.equal(await page.locator('#image-gallery img[alt="Casa ficticia ilustrativa"]').getAttribute('alt'), 'Casa ficticia ilustrativa');
    // Existing-row retry does not create a reservation or upload the original again.
    managed().processing_status = 'failed'; managed().processing_error = 'DECODE_FAILED';
    await page.locator('#refresh-images').click(); await page.getByRole('button', { name: 'Reintentar procesamiento', exact: true }).waitFor();
    const count = state.reserves.length, uploads = state.uploads;
    await page.getByRole('button', { name: 'Reintentar procesamiento', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#image-status').textContent.includes('procesada correctamente'));
    assert.equal(state.reserves.length, count); assert.equal(state.uploads, uploads);
    await page.locator('#title').fill('Cambio sin guardar');
    await page.waitForFunction(() => document.querySelector('#image-controls').disabled);
    await page.locator('#save-property').click(); await page.waitForFunction(() => !document.querySelector('#image-controls').disabled);
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 950 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow at ' + width);
      assert.equal(await page.locator('#image-gallery').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(/\s+/).length), width < 640 ? 1 : width < 1024 ? 2 : 3);
    }
    await page.locator('#refresh-images').focus();
    await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'refresh-images');
    assert.notEqual(await page.locator('#refresh-images').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    if (process.env.SCREENSHOT_DIR) {
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'nexo-admin-desktop.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'nexo-admin-mobile.png'), fullPage: true });
    }
    assert.equal(JSON.stringify(legacy), legacyBefore);
    // Reversible replacement: preparation is hidden, survives reload, and requires explicit confirmation.
    await page.locator('#image-replacement-source').selectOption(legacy.id);
    await select();
    await upload();
    await page.getByRole('button',{name:'Confirmar reemplazo',exact:true}).waitFor();
    assert.equal(legacy.image_active,true);assert.equal(state.replacements.length,1);
    const replacement=state.images.find(r=>r.id===state.replacements[0].candidate_image_id);
    assert.equal(replacement.image_active,false);
    await page.reload();
    const confirmButton=page.getByRole('button',{name:'Confirmar reemplazo',exact:true});
    await confirmButton.waitFor();
    await page.waitForFunction(()=>!Array.from(document.querySelectorAll('#image-replacements button')).find(b=>b.textContent==='Confirmar reemplazo')?.disabled);
    page.once('dialog',dialog=>dialog.accept());await confirmButton.click();
    await page.getByRole('button',{name:'Revertir a la original',exact:true}).waitFor();
    assert.equal(legacy.image_active,false);assert.equal(replacement.image_active,true);assert.equal(replacement.is_primary,true);assert.equal(replacement.position,0);
    assert.equal(await page.locator('#image-gallery img[alt="Fotografía heredada de referencia"]').count(),0);
    for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:950});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Replacement overflow '+width);}
    page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Revertir a la original',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#image-replacements')?.textContent.includes('Reemplazo revertido'));
    assert.equal(JSON.stringify(legacy),legacyBefore);assert.equal(replacement.image_active,false);assert(state.images.includes(replacement));

    await open(null); assert(await page.locator('#image-files').isDisabled());
    await open(); await page.locator('#admin-logout').click(); await page.locator('#editor-login').waitFor({ state: 'visible' }); assert(await page.locator('#image-panel').isHidden());
    await open(); const beforeDenied = [state.reserves.length, state.uploads, state.processes]; state.enabled = false;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.locator('#editor-login').waitFor({ state: 'visible' });
    assert(await page.locator('#image-panel').isHidden()); assert.equal(await page.locator('#image-gallery img').count(), 0); assert.deepEqual([state.reserves.length, state.uploads, state.processes], beforeDenied);
    // Explicit rollback regression; the default Supabase path is covered in public-provider.cjs.
    jsonRollback = true;
    await page.setViewportSize({ width: 1440, height: 1000 });
    const data = JSON.parse(fs.readFileSync(path.join(root, 'data/propiedades.json'), 'utf8'));
    await page.goto(base + 'index.html'); await page.waitForFunction(() => document.querySelectorAll('.property-card').length === 6);
    await page.locator('#operacion').selectOption('venta'); await page.locator('#tipo').selectOption('casa'); await page.locator('#zona').selectOption('centro');
    await Promise.all([page.waitForURL('**/propiedades.html?**'), page.locator('.property-search button[type=submit]').click()]);
    await page.waitForFunction(count => document.querySelectorAll('.property-card').length === count, data.filter(value => value.operacion === 'venta' && value.tipo === 'casa' && value.zona === 'centro').length);
    await page.locator('#clear-filters').click(); await page.waitForFunction(() => document.querySelectorAll('.property-card').length === 12);
    for (const value of data) {
      await page.goto(base + 'propiedad.html?id=' + value.id); await page.locator('#property-detail').waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.querySelector('#property-detail img')?.naturalWidth > 0);
    }
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    console.log('PASS: authenticated admin UI, validation, immutable retries, failure visibility, signed previews, saved-property/dirty guards, 320/390/768/1024/1440 responsive, keyboard focus, revocation, six home cards, search/reset, twelve public details. All Supabase requests simulated.');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
