import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const read = path => readFile(new URL(path, import.meta.url),'utf8');

test('reversible replacement migration and transactional SQL behavior', async t => {
  const db = new PGlite(); t.after(()=>db.close());
  await db.exec(await read('./fixtures/v5c-local-platform.sql'));
  for (const file of ['202610240001_v5a_schema.sql','202610240002_v5b2_property_management.sql','202610240003_v5b3_locations.sql','202610250001_v5c1_image_contract.sql','202610250002_v5c1_private_storage.sql','202610250003_v5c2_image_processing.sql']) await db.exec(await read('../migrations/'+file));
  await db.exec(await read('../seeds/001_demo_properties.sql'));
  const before=(await db.query('select * from public.property_images order by id')).rows;
  await db.exec(await read('../migrations/202610280001_legacy_image_replacement.sql'));
  const after=(await db.query('select * from public.property_images order by id')).rows;
  assert.deepEqual(after.map(({image_active,...row})=>row),before);
  assert(after.every(row=>row.image_active));
  await db.exec(await read('./image-replacement-behavior.sql'));
});
