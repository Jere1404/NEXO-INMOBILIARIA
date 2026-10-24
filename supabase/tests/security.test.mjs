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
  await db.exec(seed);
  const snapshot = await db.query('select id,public_code,version from properties order by public_code');
  await db.exec(seed);
  assert.deepEqual((await db.query('select id,public_code,version from properties order by public_code')).rows, snapshot.rows);
  assert.equal((await db.query('select count(*)::int n from property_images')).rows[0].n,12);
  assert.deepEqual((await db.query('select property_type,count(*)::int n from properties group by property_type order by property_type')).rows,
    [{property_type:'casa',n:4},{property_type:'departamento',n:5},{property_type:'terreno',n:3}]);
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
  await t.test('pending images and revoked administrator remain protected', async () => {
    await asRole('authenticated',admin);
    await db.exec("update properties set status='published' where public_code='nexo-001'; update property_images set processing_status='pending' where property_id=(select id from properties where public_code='nexo-001')");
    await asRole('anon');assert.equal(await count('properties'),1);assert.equal(await count('property_images'),0);
    await asRole('postgres');await db.query('update admin_memberships set enabled=false where user_id=$1',[admin]);
    await asRole('authenticated',admin);assert.equal(await count('properties'),1);assert.equal((await db.query("update properties set status='archived' returning id")).rows.length,0);
    await denied(()=>db.exec('update admin_memberships set enabled=true'));
  });
});
