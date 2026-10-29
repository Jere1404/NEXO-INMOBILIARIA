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


insert into public.admin_memberships(user_id) values ('11111111-1111-4111-8111-111111111111');
select set_config('test.property',(select id::text from properties where public_code='nexo-001'),false);
update public.properties set status='published' where id=current_setting('test.property')::uuid;
select set_config('test.source',(select id::text from property_images where property_id=current_setting('test.property')::uuid and storage_kind='legacy'),false);
select set_config('test.request','66666666-6666-4666-8666-666666666666',false);
select set_config('test.original',(select to_jsonb(i)::text from property_images i where id=current_setting('test.source')::uuid),false);
create function pg_temp.prepare(id uuid) returns public.property_images language sql as $$
 select public.nexo_service_prepare_replacement('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,current_setting('test.source')::uuid,id,'jpg',100,repeat('a',64),'Synthetic replacement','ai',true)
$$;
create function pg_temp.finish(id uuid) returns void language plpgsql as $$
declare img public.property_images;
begin
 img:=public.nexo_service_claim_image('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,id);
 perform public.nexo_service_stage_image('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,id,img.processing_token,array[img.storage_prefix||'v-'||img.processing_token||'-480.jpg',img.storage_prefix||'v-'||img.processing_token||'-480.webp']);
 perform public.nexo_service_finalize_image('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,id,img.processing_token,repeat('a',64),480,360,'[{"format":"jpg","width":480,"height":360,"bytes":100},{"format":"webp","width":480,"height":360,"bytes":90}]'::jsonb);
end $$;
create function pg_temp.confirm_replacement(id uuid) returns public.image_replacements language sql as $$
 select public.nexo_service_confirm_replacement('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,id)
$$;
create function pg_temp.revert_replacement(id uuid) returns public.image_replacements language sql as $$
 select public.nexo_service_revert_replacement('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,id)
$$;
set role anon;
select pg_temp.expect_error($q$select pg_temp.prepare(current_setting('test.request')::uuid)$q$,'42501');
reset role;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
set role authenticated;
select pg_temp.expect_error($q$select pg_temp.prepare(current_setting('test.request')::uuid)$q$,'42501');
select pg_temp.expect_error($q$update property_images set image_active=false where id=current_setting('test.source')::uuid$q$,'42501');
reset role;
set role service_role;
select pg_temp.expect_error($q$select public.nexo_service_prepare_replacement('22222222-2222-4222-8222-222222222222',current_setting('test.property')::uuid,current_setting('test.source')::uuid,current_setting('test.request')::uuid,'jpg',100,repeat('a',64),'Synthetic replacement','ai',true)$q$,'42501');
select pg_temp.expect_error($q$select public.nexo_service_prepare_replacement('11111111-1111-4111-8111-111111111111',(select id from properties where public_code='nexo-002'),current_setting('test.source')::uuid,current_setting('test.request')::uuid,'jpg',100,repeat('a',64),'Synthetic replacement','ai',true)$q$,'22023');
select pg_temp.prepare(current_setting('test.request')::uuid);
select pg_temp.expect_error($q$select public.nexo_service_prepare_replacement('11111111-1111-4111-8111-111111111111',current_setting('test.property')::uuid,current_setting('test.source')::uuid,current_setting('test.request')::uuid,'jpg',101,repeat('a',64),'Synthetic replacement','ai',true)$q$,'22023');
select pg_temp.prepare(current_setting('test.request')::uuid);
select pg_temp.assert_true((select count(*)=1 from image_replacements),'duplicate reservation returns the same operation');
select pg_temp.expect_error($q$select pg_temp.prepare('77777777-7777-4777-8777-777777777777')$q$,'40001');
select pg_temp.expect_error($q$select pg_temp.confirm_replacement(current_setting('test.request')::uuid)$q$,'40001');
select pg_temp.assert_true((select not image_active and not is_primary from property_images where id=current_setting('test.request')::uuid),'pending candidate is hidden');
select pg_temp.finish(current_setting('test.request')::uuid);
select pg_temp.assert_true((select not image_active and not is_primary and processing_status='ready' from property_images where id=current_setting('test.request')::uuid),'ready candidate waits for explicit confirmation');
reset role;
-- Force a failure in the middle of the position swap: every change must roll back.
create function pg_temp.reject_swap() returns trigger language plpgsql as $$ begin
 if new.id=current_setting('test.source')::uuid and not new.image_active then raise exception 'Injected local failure'; end if;
 return new;
end $$;
create trigger test_reject_swap after update on public.property_images for each row execute function pg_temp.reject_swap();
set role service_role;
select pg_temp.expect_error($q$select pg_temp.confirm_replacement(current_setting('test.request')::uuid)$q$,'P0001');
select pg_temp.assert_true((select state='prepared' from image_replacements where id=current_setting('test.request')::uuid),'failed swap rolls back operation');
select pg_temp.assert_true((select image_active and is_primary and position=0 from property_images where id=current_setting('test.source')::uuid),'failed swap leaves cover intact');
reset role;
drop trigger test_reject_swap on public.property_images;
set role service_role;
select pg_temp.confirm_replacement(current_setting('test.request')::uuid);
select pg_temp.confirm_replacement(current_setting('test.request')::uuid);
select pg_temp.assert_true((select image_active and is_primary and position=0 from property_images where id=current_setting('test.request')::uuid),'candidate inherits original cover and position');
select pg_temp.assert_true((select not image_active and not is_primary and position=1 from property_images where id=current_setting('test.source')::uuid),'original retained in spare position');
select pg_temp.assert_true((select count(*)=1 from property_images where property_id=current_setting('test.property')::uuid and image_active and is_primary),'exactly one active cover');
reset role;
select set_config('request.jwt.claim.sub','',false);
set role anon;
select pg_temp.assert_true((select count(*)=0 from property_images where property_id=current_setting('test.property')::uuid),'retired legacy cannot bypass active RLS guard');
reset role;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
set role authenticated;
select pg_temp.assert_true((select count(*)=0 from image_replacements),'non-admin cannot inspect replacement operations');
select pg_temp.expect_error($q$update image_replacements set state='reverted'$q$,'42501');
reset role;
set role service_role;
select pg_temp.revert_replacement(current_setting('test.request')::uuid);
select pg_temp.revert_replacement(current_setting('test.request')::uuid);
reset role;
select pg_temp.assert_true((select to_jsonb(i)=current_setting('test.original')::jsonb from property_images i where id=current_setting('test.source')::uuid),'reversion restores original row exactly');
select pg_temp.assert_true((select count(*)=2 from property_images where property_id=current_setting('test.property')::uuid),'no physical deletion');
select pg_temp.assert_true((select not image_active from property_images where id=current_setting('test.request')::uuid),'reverted candidate retained but hidden');
set role service_role;
select pg_temp.expect_error($q$select pg_temp.confirm_replacement(current_setting('test.request')::uuid)$q$,'40001');
select pg_temp.expect_error($q$select pg_temp.prepare(current_setting('test.request')::uuid)$q$,'22023');
-- Cancel preparation, then process a late worker: it must stay hidden.
select pg_temp.prepare('77777777-7777-4777-8777-777777777777');
select pg_temp.revert_replacement('77777777-7777-4777-8777-777777777777');
select pg_temp.finish('77777777-7777-4777-8777-777777777777');
select pg_temp.assert_true((select not image_active and not is_primary from property_images where id='77777777-7777-4777-8777-777777777777'),'late finalization cannot publish cancelled candidate');
select pg_temp.prepare('88888888-8888-4888-8888-888888888888');
select pg_temp.finish('88888888-8888-4888-8888-888888888888');
reset role;
update property_images set alt='Changed since preparation' where id=current_setting('test.source')::uuid;
set role service_role;
select pg_temp.expect_error($q$select pg_temp.confirm_replacement('88888888-8888-4888-8888-888888888888')$q$,'40001');
select pg_temp.revert_replacement('88888888-8888-4888-8888-888888888888');
-- Source metadata change above was not silently overwritten by cancellation.
select pg_temp.assert_true((select alt='Changed since preparation' and image_active from property_images where id=current_setting('test.source')::uuid),'cancel preserves subsequent source edits');
reset role;
-- A non-cover replacement must preserve the unrelated cover and its position.
insert into public.property_images(property_id,position,is_primary,processing_status,source_kind,illustrative,jpeg_path,width,height,alt)
 values(current_setting('test.property')::uuid,10,false,'ready','ai',true,'assets/noncover.jpg',480,360,'Non-cover fixture');
select set_config('test.source',(select id::text from property_images where property_id=current_setting('test.property')::uuid and position=10),false);
set role service_role;
select pg_temp.prepare('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_temp.finish('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_temp.confirm_replacement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_temp.assert_true((select image_active and not is_primary and position=10 from property_images where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'non-cover candidate stays non-cover');
select pg_temp.assert_true((select count(*)=1 from property_images where property_id=current_setting('test.property')::uuid and image_active and is_primary),'unrelated cover preserved');
reset role;
update property_images set alt='Concurrent subsequent edit' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set role service_role;
select pg_temp.expect_error($q$select pg_temp.revert_replacement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$q$,'40001');
reset role;
update property_images set alt='Synthetic replacement' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set role service_role;
select pg_temp.revert_replacement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
reset role;
select pg_temp.assert_true((select image_active and not is_primary and position=10 from property_images where id=current_setting('test.source')::uuid),'non-cover original restored');
-- Retained candidates count toward the existing 20-row limit; no silent deletion.
insert into public.property_images(property_id,position,processing_status,source_kind,illustrative,jpeg_path,width,height,alt)
 select current_setting('test.property')::uuid,100+n,'ready','ai',true,'assets/fixture.jpg',480,360,'Capacity fixture'
 from generate_series(1,20-(select count(*)::integer from property_images where property_id=current_setting('test.property')::uuid)) n;
set role service_role;
select pg_temp.expect_error($q$select pg_temp.prepare('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$q$,'54000');
reset role;
update public.admin_memberships set enabled=false;
set role service_role;
select pg_temp.expect_error($q$select pg_temp.prepare('99999999-9999-4999-8999-999999999999')$q$,'42501');
reset role;
