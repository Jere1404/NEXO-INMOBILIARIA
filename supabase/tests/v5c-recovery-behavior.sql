-- TEST ONLY. Run only after fixtures/v5c-local-platform.sql, V5A/V5B,
-- the demo seed and reconstructed V5C, in a disposable local database.
create function pg_temp.assert_true(ok boolean, label text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'Assertion failed: %', label; end if;
end $$;
create function pg_temp.expect_error(statement text, expected_state text) returns void
language plpgsql as $$
declare actual_state text;
begin
  begin execute statement;
  exception when others then get stacked diagnostics actual_state = returned_sqlstate;
  end;
  if actual_state is distinct from expected_state then
    raise exception 'Expected SQLSTATE %, got % for %', expected_state, actual_state, statement;
  end if;
end $$;

-- Simulate unrelated permissive policies: NEXO restrictive guards must still win.
create policy test_other_app_access on storage.objects for all to public using (true) with check (true);
create policy test_other_app_access on storage.buckets for all to public using (true) with check (true);

insert into public.admin_memberships(user_id) values ('11111111-1111-4111-8111-111111111111');
select set_config('test.property', (select id::text from public.properties where public_code='nexo-001'),false);
select set_config('test.image','33333333-3333-4333-8333-333333333333',false);
update public.properties set status='published' where id=current_setting('test.property')::uuid;

select set_config('request.jwt.claim.sub','',false);
set role anon;
select pg_temp.assert_true((select count(*)=1 from public.property_images where property_id=current_setting('test.property')::uuid),'anon sees published legacy image');
select pg_temp.expect_error($q$select public.nexo_service_reserve_image('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,current_setting('test.image')::uuid,'jpg',100,repeat('a',64),'Synthetic test','ai',true)$q$,'42501');
select pg_temp.assert_true((select count(*)=0 from storage.buckets),'anon cannot read NEXO buckets');
reset role;

set role service_role;
select pg_temp.expect_error($q$select public.nexo_service_reserve_image('22222222-2222-4222-8222-222222222222',current_setting('test.property')::uuid,current_setting('test.image')::uuid,'jpg',100,repeat('a',64),'Synthetic test','ai',true)$q$,'42501');
select public.nexo_service_reserve_image('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,current_setting('test.image')::uuid,'jpg',100,repeat('a',64),'Synthetic test','ai',true);
select public.nexo_service_reserve_image('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,current_setting('test.image')::uuid,'jpg',100,repeat('a',64),'Synthetic test','ai',true);
select pg_temp.assert_true((select count(*)=1 from public.property_images where id=current_setting('test.image')::uuid),'reservation retry does not duplicate');
select pg_temp.expect_error($q$select public.nexo_service_reserve_image('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,current_setting('test.image')::uuid,'jpg',101,repeat('a',64),'Synthetic test','ai',true)$q$,'22023');
reset role;

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
set role authenticated;
select pg_temp.expect_error($q$select public.nexo_service_claim_image('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,current_setting('test.image')::uuid)$q$,'42501');
-- Even an admin cannot directly edit a managed row.
do $$ declare affected integer; begin
  update public.property_images set alt='forbidden' where id=current_setting('test.image')::uuid;
  get diagnostics affected = row_count;
  perform pg_temp.assert_true(affected=0,'managed update blocked by restrictive RLS');
end $$;
insert into storage.objects(bucket_id,name)
select 'nexo-property-originals',original_object_key from public.property_images where id=current_setting('test.image')::uuid;
select pg_temp.expect_error($q$insert into storage.objects(bucket_id,name) values ('nexo-property-originals','outside/original.jpg')$q$,'42501');
select pg_temp.expect_error($q$insert into storage.objects(bucket_id,name) select 'nexo-property-images',storage_prefix||'arbitrary.jpg' from public.property_images where id=current_setting('test.image')::uuid$q$,'42501');
select pg_temp.expect_error($q$insert into storage.buckets(id,name) values ('nexo-property-originals','other')$q$,'42501');
reset role;

set role service_role;
select public.nexo_service_claim_image('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,current_setting('test.image')::uuid);
select set_config('test.token',(public.nexo_service_get_image('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,current_setting('test.image')::uuid)).processing_token::text,false);
select pg_temp.expect_error($q$select public.nexo_service_claim_image('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,current_setting('test.image')::uuid)$q$,'55P03');
select pg_temp.expect_error($q$select public.nexo_service_stage_image('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,current_setting('test.image')::uuid,current_setting('test.token')::uuid,array['outside/a.jpg','outside/b.webp'])$q$,'22023');
select public.nexo_service_stage_image('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,current_setting('test.image')::uuid,current_setting('test.token')::uuid,
 (select array_agg(storage_prefix||'v-'||current_setting('test.token')||'-'||v) from public.property_images cross join unnest(array['480.jpg','480.webp','640.jpg','640.webp']) v where id=current_setting('test.image')::uuid));
select pg_temp.expect_error($q$select public.nexo_service_finalize_image('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,current_setting('test.image')::uuid,current_setting('test.token')::uuid,repeat('b',64),640,480,'[]'::jsonb)$q$,'22023');
select public.nexo_service_finalize_image('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,current_setting('test.image')::uuid,current_setting('test.token')::uuid,repeat('a',64),640,480,
 '[{"format":"jpg","width":480,"height":360,"bytes":100},{"format":"webp","width":480,"height":360,"bytes":90},{"format":"jpg","width":640,"height":480,"bytes":120},{"format":"webp","width":640,"height":480,"bytes":110}]'::jsonb);
select public.nexo_service_fail_image('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,current_setting('test.image')::uuid,current_setting('test.token')::uuid,'LATE_FAILURE');
select public.nexo_service_cleanup_attempt('11111111-1111-4111-8111-111111111111',current_setting('test.image')::uuid,current_setting('test.token')::uuid);
select pg_temp.assert_true((public.nexo_service_get_image('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,current_setting('test.image')::uuid)).processing_status='ready','late fail and cleanup preserve ready row');
reset role;
select pg_temp.assert_true((select status='ready' and not cleanup_required from nexo_private.image_processing_attempts where token=current_setting('test.token')::uuid),'ready ledger retained');
select pg_temp.expect_error($q$update public.property_images set original_sha256=repeat('b',64) where id=current_setting('test.image')::uuid$q$,'23514');
select pg_temp.expect_error($q$delete from public.property_images where id=current_setting('test.image')::uuid$q$,'23514');

select set_config('request.jwt.claim.sub','',false);
set role anon;
select pg_temp.assert_true((select count(*)=1 from public.property_images where property_id=current_setting('test.property')::uuid),'public still sees only legacy, not managed ready');
reset role;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
set role authenticated;
select pg_temp.assert_true((select count(*)=0 from storage.objects),'non-admin cannot read originals');
reset role;

-- Separate failed attempt: staging remains pending until explicit cleanup confirmation.
select set_config('test.failed','44444444-4444-4444-8444-444444444444',false);
set role service_role;
select public.nexo_service_reserve_image('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,current_setting('test.failed')::uuid,'jpg',100,repeat('c',64),'Synthetic failure','ai',true);
select public.nexo_service_claim_image('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,current_setting('test.failed')::uuid);
select set_config('test.failed_token',(public.nexo_service_get_image('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,current_setting('test.failed')::uuid)).processing_token::text,false);
select public.nexo_service_stage_image('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,current_setting('test.failed')::uuid,current_setting('test.failed_token')::uuid,
 (select array_agg(storage_prefix||'v-'||current_setting('test.failed_token')||'-'||v) from public.property_images cross join unnest(array['480.jpg','480.webp']) v where id=current_setting('test.failed')::uuid));
select public.nexo_service_fail_image('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,current_setting('test.failed')::uuid,current_setting('test.failed_token')::uuid,'VARIANT_UPLOAD_FAILED');
reset role;
select pg_temp.assert_true((select status='failed' and cleanup_required from nexo_private.image_processing_attempts where token=current_setting('test.failed_token')::uuid),'failed staged attempt needs cleanup');
set role service_role;
select public.nexo_service_cleanup_attempt('11111111-1111-4111-8111-111111111111',current_setting('test.failed')::uuid,current_setting('test.failed_token')::uuid);
reset role;
select pg_temp.assert_true((select status='failed' and not cleanup_required from nexo_private.image_processing_attempts where token=current_setting('test.failed_token')::uuid),'cleanup confirmed');
update public.admin_memberships set enabled=false where user_id='11111111-1111-4111-8111-111111111111';
set role service_role;
select pg_temp.expect_error($q$select public.nexo_service_get_image('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,current_setting('test.image')::uuid)$q$,'42501');
reset role;
