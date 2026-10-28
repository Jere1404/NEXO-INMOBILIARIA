import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const audit = JSON.parse(await read('./fixtures/v5c-audit.json'));
const norm = value => value == null ? null : value.replace(/\s+/g, ' ').trim();
const ownTables = r => ['property_images', 'image_processing_attempts'].includes(r.table_name);

test('V5C reconstruction: audited catalog and SQL security/processing scenarios', async t => {
 const db = new PGlite(); t.after(() => db.close());
 await db.exec(await read('./fixtures/v5c-local-platform.sql'));
 for (const file of ['202610240001_v5a_schema.sql','202610240002_v5b2_property_management.sql','202610240003_v5b3_locations.sql']) await db.exec(await read('../migrations/'+file));
 await db.exec(await read('../seeds/001_demo_properties.sql'));
 const before = (await db.query('select * from property_images order by id')).rows;
 const oldColumns = Object.keys(before[0]);
 const baselineFunctions = (await db.query(`select n.nspname,p.proname,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','nexo_private') and p.prokind='f'`)).rows;
 for (const file of ['202610250001_v5c1_image_contract.sql','202610250002_v5c1_private_storage.sql','202610250003_v5c2_image_processing.sql']) await db.exec(await read('../migrations/'+file));
 await t.test('legacy rows and V5A/V5B functions survive unchanged', async () => {
  const after=(await db.query('select * from property_images order by id')).rows;
  assert.deepEqual(after.map(r=>Object.fromEntries(oldColumns.map(c=>[c,r[c]]))),before);
  assert(after.every(r=>r.storage_kind==='legacy'));
  for(const r of baselineFunctions){const result=await db.query(`select pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 and p.proname=$2`,[r.nspname,r.proname]); assert.equal(result.rows[0].definition,r.definition);}
 });
 await t.test('all audited image columns, expressions and constraints match', async () => {
  const columns=(await db.query(`select n.nspname schema_name,c.relname table_name,a.attname column_name,format_type(a.atttypid,a.atttypmod) data_type,a.attnotnull not_null,a.attgenerated generated_kind,pg_get_expr(d.adbin,d.adrelid) expression from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attnum>0 and not a.attisdropped and (n.nspname,c.relname) in (('public','property_images'),('nexo_private','image_processing_attempts'))`)).rows;
  const expected=audit['3'].filter(ownTables); assert.equal(columns.length,expected.length);
  for(const r of expected){const c=columns.find(c=>c.schema_name===r.schema_name&&c.table_name===r.table_name&&c.column_name===r.column_name);assert(c,r.column_name);assert.equal(c.data_type,r.data_type);assert.equal(c.not_null,r.not_null==='true');assert.equal(c.generated_kind,r.generated_kind);assert.equal(norm(c.expression),r.default_or_generation_expression==='null'?null:norm(r.default_or_generation_expression));}
  for(const r of audit['4'].filter(ownTables)){const actual=(await db.query(`select pg_get_constraintdef(k.oid,false) definition,k.convalidated from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1 and c.relname=$2 and k.conname=$3`,[r.schema_name,r.table_name,r.constraint_name])).rows[0];assert(actual,r.constraint_name);assert.equal(norm(actual.definition),norm(r.definition));assert.equal(actual.convalidated,r.validated==='true');}
 });
 await t.test('audited indexes, policies, triggers and RLS match', async () => {
  for(const r of audit['5'].filter(ownTables)){const actual=(await db.query(`select pg_get_indexdef(c.oid) definition from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1 and c.relname=$2`,[r.schema_name,r.index_name])).rows[0];assert.equal(norm(actual?.definition),norm(r.definition));}
  const policies=(await db.query('select * from pg_policies')).rows;
  for(const r of audit['7']){const p=policies.find(p=>p.schemaname===r.schema_name&&p.tablename===r.table_name&&p.policyname===r.policy_name);assert(p,r.policy_name);assert.equal(p.permissive,r.permissive);assert.equal(p.cmd,r.command);assert.deepEqual([...p.roles].sort(),r.roles.slice(1,-1).split(',').sort());assert.equal(norm(p.qual),r.using_expression==='null'?null:norm(r.using_expression));assert.equal(norm(p.with_check),r.check_expression==='null'?null:norm(r.check_expression));}
  for(const r of audit['6'].filter(ownTables)){const p=(await db.query(`select pg_get_triggerdef(t.oid,false) definition,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1 and c.relname=$2 and t.tgname=$3`,[r.schema_name,r.table_name,r.trigger_name])).rows[0];assert.equal(norm(p?.definition),norm(r.definition));assert.equal(p.tgenabled,r.enabled_mode);}
  for(const r of audit['2'].filter(r=>r.object_name==='property_images'||r.object_name==='image_processing_attempts')){const p=(await db.query(`select relrowsecurity,relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1 and c.relname=$2`,[r.schema_name,r.object_name])).rows[0];assert.equal(p.relrowsecurity,r.rls_enabled==='true');assert.equal(p.relforcerowsecurity,r.rls_forced==='true');}
 });
 await t.test('seven RPC bodies and explicit function privileges match the exports', async () => {
  for(const r of audit['8'].concat(audit['12'].map(r=>({...r,function_definition:r.definition})))){
   const p=(await db.query(`select pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 and p.proname=$2`,[r.schema_name,r.function_name])).rows[0];assert.equal(norm(p?.definition),norm(r.function_definition),r.function_name);
  }
  for(const r of audit['13']){
   const p=(await db.query(`select p.*,pg_get_userbyid(p.proowner) owner_role from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 and p.proname=$2`,[r.schema_name,r.function_name])).rows[0];
   assert.equal(p.owner_role,r.owner_role);assert.equal(p.prosecdef,r.security_definer==='true');assert.equal(p.proisstrict,r.strict==='true');assert.equal(p.proleakproof,r.leakproof==='true');assert.equal(p.provolatile,r.volatility);assert.equal(p.proparallel,r.parallel_mode);assert.equal(Number(p.procost),Number(r.execution_cost));assert.equal(Number(p.prorows),Number(r.estimated_rows));
   assert.deepEqual(p.proconfig,JSON.parse(r.configuration).map(v=>v.replaceAll('\\"','"')));
   assert.deepEqual([...p.proacl].sort(),r.explicit_acl.slice(1,-1).split(',').sort(),r.function_name);
  }
  for(const r of audit['14'].filter(r=>r.object_type==='table'&&['property_images','image_processing_attempts'].includes(r.object_name))){
   const p=(await db.query(`select c.relacl,pg_get_userbyid(c.relowner) owner_role from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1 and c.relname=$2`,[r.schema_name,r.object_name])).rows[0];
   assert.equal(p.owner_role,r.owner_role);assert.deepEqual([...p.relacl].sort(),r.explicit_acl.slice(1,-1).split(',').sort());
  }
  for(const r of audit['10'].filter(ownTables)){const p=(await db.query(`select has_table_privilege($1,$2,'select') s,has_table_privilege($1,$2,'insert') i,has_table_privilege($1,$2,'update') u,has_table_privilege($1,$2,'delete') d`,[r.role_name,r.schema_name+'.'+r.table_name])).rows[0];assert.deepEqual(p,{s:r.can_select==='true',i:r.can_insert==='true',u:r.can_update==='true',d:r.can_delete==='true'});}
 });
 await t.test('private buckets, MIME types and limits match', async () => {
  for(const r of audit['11']){const p=(await db.query('select * from storage.buckets where id=$1',[r.id])).rows[0];assert.equal(p.public,false);assert.equal(Number(p.file_size_limit),Number(r.file_size_limit));assert.deepEqual(p.allowed_mime_types,JSON.parse(r.allowed_mime_types));
   const extra=JSON.parse(audit['16'].find(e=>e.id===r.id).additional_configuration);
   for(const [key,value] of Object.entries(extra)) assert.deepEqual(p[key],value,key);}
 });
 await t.test('SQL behavior: authorization, idempotency, RLS, processing, failure and cleanup',async()=>{await db.exec(await read('./v5c-recovery-behavior.sql'));});
});
