import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.NEXO_PGLITE_MODULE || '@electric-sql/pglite');
const migration = await readFile(new URL('../migrations/202610240001_v5a_schema.sql', import.meta.url), 'utf8');
const seed = await readFile(new URL('../seeds/001_demo_properties.sql', import.meta.url), 'utf8');
const admin = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';

test('PostgreSQL migrations, constraints, idempotent import and RLS', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  // Test-only emulation of identities normally supplied and verified by Supabase.
  await db.exec(`create role anon nologin; create role authenticated nologin;
    grant usage on schema public to anon, authenticated;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    insert into auth.users values ('${admin}'),('${other}');`);
  await db.exec(migration);
  await db.exec(await readFile(new URL('../migrations/202610240002_v5b2_property_management.sql', import.meta.url), 'utf8'));
  await db.exec(seed);
  const snapshot = await db.query('select id,public_code,version from properties order by public_code');
  await db.exec(seed);
  assert.deepEqual((await db.query('select id,public_code,version from properties order by public_code')).rows, snapshot.rows);
  assert.equal((await db.query('select count(*)::int n from property_images')).rows[0].n,12);
  assert.deepEqual((await db.query('select property_type,count(*)::int n from properties group by property_type order by property_type')).rows,
    [{property_type:'casa',n:4},{property_type:'departamento',n:5},{property_type:'terreno',n:3}]);
  const beforeLocations = (await db.query('select * from properties order by public_code')).rows;
  const beforeImages = (await db.query('select * from property_images order by id')).rows;
  const beforeLinks = (await db.query('select * from property_amenities order by property_id,amenity_slug')).rows;
  const beforeZones = (await db.query('select slug,name from zones order by slug')).rows;
  await db.exec(await readFile(new URL('../migrations/202610240003_v5b3_locations.sql', import.meta.url),'utf8'));
  await db.exec(seed); // Existing import remains compatible and idempotent after the additive migration.
  assert.deepEqual((await db.query('select * from properties order by public_code')).rows,beforeLocations);
  assert.deepEqual((await db.query('select * from property_images order by id')).rows,beforeImages);
  assert.deepEqual((await db.query('select * from property_amenities order by property_id,amenity_slug')).rows,beforeLinks);
  assert.deepEqual((await db.query('select slug,name from zones order by slug')).rows,beforeZones);
  await db.query('insert into admin_memberships(user_id) values ($1)',[admin]);
  const asRole = async (role, uid = '') => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
    await db.exec(`set role ${role}`);
  };
  const count = async table => (await db.query(`select count(*)::int n from ${table}`)).rows[0].n;
  const denied = async action => assert.rejects(action, error => error.code === '42501');
  await t.test('anon sees no drafts and cannot write or inspect membership', async () => {
    await asRole('anon');assert.equal(await count('properties'),0);assert.equal(await count('property_images'),0);assert.equal(await count('property_amenities'),0);
    await denied(()=>db.query("insert into zones values ('unauthorized','Denied')"));
    await denied(()=>db.query("update properties set status='published'"));
    await denied(()=>db.query('select * from admin_memberships'));
  });
  await t.test('admin reads drafts, publishes one, and version increments', async () => {
    await asRole('authenticated',admin);assert.equal(await count('properties'),12);
    const result = await db.query("update properties set status='published' where public_code='nexo-001' returning version");assert.equal(Number(result.rows[0].version),2);
    assert.equal(await count('property_images'),12);
    await denied(()=>db.query('insert into admin_memberships(user_id) values ($1)',[other]));
  });
  await t.test('public read only published properties and their ready children', async () => {
    await asRole('anon');assert.equal(await count('properties'),1);assert.equal(await count('property_images'),1);assert.equal(await count('property_amenities'),3);
    assert.equal((await db.query("select * from properties where public_code='nexo-002'")).rows.length,0);
  });
  await t.test('authenticated non-admin cannot mutate or self-promote', async () => {
    await asRole('authenticated',other);assert.equal(await count('properties'),1);
    assert.equal((await db.query("update properties set title='unauthorized' returning id")).rows.length,0);
    assert.equal((await db.query('delete from property_images returning id')).rows.length,0);
    await denied(()=>db.query('insert into admin_memberships(user_id) values ($1)',[other]));
    await denied(()=>db.query("insert into amenities values ('fake','Unauthorized')"));
    await denied(()=>db.query("insert into property_images(property_id,position,source_kind) select id,9,'ai' from properties"));
    await denied(()=>db.query("insert into properties(public_code,title,description,property_type,operation,price,currency,zone_slug,area,approximate_location) values ('unauthorized','Title','Description','casa','venta',1,'USD','centro',1,'Centro')"));
  });
  await t.test('unpublishing immediately removes property and metadata visibility', async () => {
    await asRole('authenticated',admin);await db.exec("update properties set status='draft' where public_code='nexo-001'");
    await asRole('anon');assert.equal(await count('properties'),0);assert.equal(await count('property_images'),0);assert.equal(await count('property_amenities'),0);
  });
  await t.test('administrator CRUD and SQL constraints', async () => {
    await asRole('authenticated',admin);
    const insert = (code,price=100,type='casa',bedrooms=null) => db.query("insert into properties(public_code,title,description,property_type,operation,price,currency,zone_slug,area,approximate_location,bedrooms) values ($1,'Title','Description',$2,'venta',$3,'USD','centro',100,'Centro',$4) returning id",[code,type,price,bedrooms]);
    await insert('test-property');
    await assert.rejects(()=>insert('test-property'),error=>error.code==='23505');
    await assert.rejects(()=>insert('bad-price',-1),error=>error.code==='23514');
    await assert.rejects(()=>insert('nan-price','NaN'),error=>error.code==='23514');
    await assert.rejects(()=>insert('bad-land',100,'terreno',2),error=>error.code==='23514');
    const changed=await db.query("update properties set public_code='renamed',version=999 where public_code='test-property' returning public_code,version");
    assert.equal(changed.rows[0].public_code,'test-property');assert.equal(Number(changed.rows[0].version),2);
    await db.exec("delete from properties where public_code='test-property'");
  });
  const payload = { public_code:'rpc-property',title:'Created property',description:'Description',property_type:'casa',operation:'venta',status:'draft',price:100,currency:'USD',zone_slug:'centro',city:'Corrientes Capital',area:100,bedrooms:2,bathrooms:1,approximate_location:'Centro',featured:false,is_demo:true };
  const save = async (id,version,data,amenities=[]) => (await db.query('select * from public.admin_save_property($1::uuid,$2::bigint,$3::jsonb,$4::text[])',[id,version,JSON.stringify(data),amenities])).rows[0];
  await t.test('transactional management creates, edits, changes status, and detects stale versions', async () => {
    await asRole('authenticated',admin);
    let row = await save(null,null,payload,['cochera']);
    assert.equal(row.status,'draft');assert.equal(Number(row.version),1);
    await assert.rejects(()=>save(null,null,payload),e=>e.code==='23505');
    await assert.rejects(()=>save(null,null,{...payload,public_code:'invalid-new',status:'published'}),e=>e.code==='22023');
    const id = row.id;
    row = await save(id,row.version,{...payload,title:'Edited property'},['patio']);
    assert.equal(row.title,'Edited property');assert.equal(Number(row.version),2);
    await assert.rejects(()=>save(id,1,payload),e=>e.code==='40001');
    for (const status of ['published','draft','archived','draft']) {
      row = await save(id,row.version,{...payload,status},['patio']);
      assert.equal(row.status,status);
    }
    await asRole('anon');assert.equal((await db.query('select id from properties where id=$1',[id])).rows.length,0);
    await asRole('authenticated',admin);assert.equal((await db.query('select id from properties where id=$1',[id])).rows.length,1);
  });
  await t.test('invalid amenities and constraints roll back all property changes', async () => {
    await asRole('authenticated',admin);
    const before = (await db.query("select * from properties where public_code='rpc-property'")).rows[0];
    const links = (await db.query('select * from property_amenities where property_id=$1',[before.id])).rows;
    await assert.rejects(()=>save(before.id,before.version,{...payload,title:'Must not persist'},['missing-amenity']),e=>e.code==='23503');
    await assert.rejects(()=>save(before.id,before.version,{...payload,price:-1},['cochera']),e=>e.code==='23514');
    await assert.rejects(()=>save(before.id,before.version,{...payload,property_type:'terreno'},[]),e=>e.code==='23514');
    await assert.rejects(()=>save(before.id,before.version,{...payload,id:before.id}),e=>e.code==='22023');
    assert.deepEqual((await db.query('select * from properties where id=$1',[before.id])).rows[0],before);
    assert.deepEqual((await db.query('select * from property_amenities where property_id=$1',[before.id])).rows,links);
  });
  await t.test('RPC rejects anonymous and authenticated non-admin writers without side effects', async () => {
    await asRole('anon');await denied(()=>save(null,null,{...payload,public_code:'rpc-denied'}));
    await asRole('authenticated',other);await denied(()=>save(null,null,{...payload,public_code:'rpc-denied'}));
    await asRole('authenticated',admin);
    assert.equal((await db.query("select id from properties where public_code='rpc-denied'")).rows.length,0);
    assert.equal(await count('property_images'),12);
    await db.query("delete from properties where public_code='rpc-property'");
  });
  const createLocation = async (province,locality,zone) => (await db.query('select * from public.admin_create_location($1,$2,$3)',[province,locality,zone])).rows[0];
  await t.test('location references are readable, but anonymous and non-admin creation is denied',async()=>{
    await asRole('anon');assert.equal(await count('provinces'),24);assert.equal(await count('localities'),1);
    await denied(()=>createLocation('18','Goya','Centro'));
    await denied(()=>db.query("insert into localities(province_code,name) values ('18','Goya')"));
    await asRole('authenticated',other);
    await denied(()=>createLocation('18','Goya','Centro'));
    await denied(()=>db.query("insert into localities(province_code,name) values ('18','Goya')"));
  });
  await t.test('SECURITY INVOKER zone INSERT and conflict reuse work without UPDATE privileges or RLS bypass',async()=>{
    await asRole('postgres');
    const signature='public.admin_create_location(text,text,text)';
    const metadata=(await db.query("select prosecdef from pg_proc where oid=$1::regprocedure",[signature])).rows[0];
    assert.equal(metadata.prosecdef,false);
    assert.equal((await db.query("select has_function_privilege('anon',$1,'EXECUTE') allowed",[signature])).rows[0].allowed,false);
    assert.equal((await db.query("select has_function_privilege('authenticated',$1,'EXECUTE') allowed",[signature])).rows[0].allowed,true);
    await db.exec('revoke update,delete on public.zones from authenticated');
    let created;
    try {
      await asRole('authenticated',admin);
      const role=(await db.query('select current_user as name,rolsuper,rolbypassrls from pg_roles where rolname=current_user')).rows[0];
      assert.equal(role.name,'authenticated');assert.equal(role.rolsuper,false);assert.equal(role.rolbypassrls,false);
      const permissions=(await db.query("select has_table_privilege(current_user,'public.zones','INSERT') can_insert,has_table_privilege(current_user,'public.zones','SELECT') can_select,has_table_privilege(current_user,'public.zones','UPDATE') can_update")).rows[0];
      assert.deepEqual(permissions,{can_insert:true,can_select:true,can_update:false});
      const before=(await db.query('select * from public.zones order by slug')).rows;
      const existing=await createLocation('18','  CORRIENTES   CAPITAL  ','  CENTRO  ');
      assert.equal(existing.slug,'centro');
      assert.deepEqual((await db.query('select * from public.zones order by slug')).rows,before);
      created=await createLocation('18','Corrientes Capital','Prueba permisos');
      assert.equal(created.locality_id,existing.locality_id);
      assert.equal((await createLocation('18','Corrientes Capital','prueba permisos')).slug,created.slug);
      await asRole('authenticated',other);await denied(()=>createLocation('18','Corrientes Capital','Centro'));
      await asRole('anon');await denied(()=>createLocation('18','Corrientes Capital','Centro'));
    } finally {
      await asRole('postgres');await db.exec('grant update,delete on public.zones to authenticated');
      if(created)await db.query('delete from public.zones where slug=$1',[created.slug]);
      await asRole('authenticated',admin);
    }
  });
  await t.test('admin creates reusable locations across provinces without duplicate names or slugs',async()=>{
    await asRole('authenticated',admin);
    const zone=await createLocation('82','Rosario','Centro');
    const same=await createLocation('82','  ROSARIO  ','  centro  ');
    assert.equal(zone.slug,same.slug);assert.equal(zone.locality_id,same.locality_id);
    assert.notEqual(zone.slug,'centro');
    assert.equal((await db.query("select count(*)::int n from localities where province_code='82'")).rows[0].n,1);
    const goya=await createLocation('18','Goya','Centro');assert.notEqual(goya.slug,zone.slug);
    await assert.rejects(()=>createLocation('99','Rosario','Centro'),e=>e.code==='23503');
    await assert.rejects(()=>createLocation('18',' ','Centro'),e=>e.code==='22023');
    await assert.rejects(()=>createLocation('18','Goya','x'.repeat(101)),e=>e.code==='22023');
  });
  await t.test('property locality must match its zone and existing location identifiers cannot move',async()=>{
    await asRole('authenticated',admin);
    const zone=await createLocation('82','Rosario','Centro');
    await assert.rejects(()=>save(null,null,{...payload,public_code:'location-test',zone_slug:zone.slug,city:'Corrientes Capital'}),e=>e.code==='23514');
    const row=await save(null,null,{...payload,public_code:'location-test',zone_slug:zone.slug,city:'Rosario'});
    assert.equal(row.city,'Rosario');assert.equal(row.zone_slug,zone.slug);
    await assert.rejects(()=>db.query("update zones set locality_id='00000000-0000-4000-8000-000000000018' where slug=$1",[zone.slug]),e=>e.code==='23514');
    await denied(()=>db.query("update localities set name='Changed' where id=$1",[zone.locality_id]));
    await db.query('delete from properties where id=$1',[row.id]);
    assert.equal(await count('properties'),12);assert.equal(await count('property_images'),12);
  });
  await t.test('pending images and revoked administrator remain protected', async () => {
    await asRole('authenticated',admin);
    await db.exec("update properties set status='published' where public_code='nexo-001'; update property_images set processing_status='pending' where property_id=(select id from properties where public_code='nexo-001')");
    await asRole('anon');assert.equal(await count('properties'),1);assert.equal(await count('property_images'),0);
    await asRole('postgres');await db.query('update admin_memberships set enabled=false where user_id=$1',[admin]);
    await asRole('authenticated',admin);assert.equal(await count('properties'),1);assert.equal((await db.query("update properties set status='archived' returning id")).rows.length,0);
    await denied(()=>db.exec('update admin_memberships set enabled=true'));
    await denied(()=>save(null,null,{...payload,public_code:'rpc-revoked'}));
    await denied(()=>createLocation('18','Goya','Denied'));
  });
});

test('V5B.3 aborts on unexpected legacy cities instead of remapping property data',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec("create table public.properties(city text); insert into public.properties values ('Rosario');");
  const sql=await readFile(new URL('../migrations/202610240003_v5b3_locations.sql',import.meta.url),'utf8');
  await assert.rejects(()=>db.exec(sql),/Review legacy city values/);
  await db.exec('rollback');
  assert.deepEqual((await db.query('select * from properties')).rows,[{city:'Rosario'}]);
  assert.equal((await db.query("select to_regclass('public.provinces') as table_name")).rows[0].table_name,null);
});
