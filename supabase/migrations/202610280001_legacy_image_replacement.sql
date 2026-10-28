-- New additive feature; historical V5A/V5B/V5C must NOT be reapplied.
-- Apply only through a separately authorized, reviewed deployment procedure.
begin;
set local search_path = public, nexo_private, pg_catalog;

alter table public.property_images add column image_active boolean not null default true;
create table public.image_replacements (
  id uuid primary key,
  property_id uuid not null references public.properties(id),
  source_image_id uuid not null references public.property_images(id),
  candidate_image_id uuid not null unique references public.property_images(id),
  state text not null default 'prepared' check (state in ('prepared','confirmed','reverted')),
  source_snapshot jsonb not null,
  candidate_position integer not null check (candidate_position >= 0),
  confirmed_source_snapshot jsonb,
  confirmed_candidate_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (id = candidate_image_id and source_image_id <> candidate_image_id)
);
create unique index image_replacement_open_source on public.image_replacements(source_image_id)
  where state in ('prepared','confirmed');
create index image_replacements_property_created on public.image_replacements(property_id,created_at desc);
alter table public.image_replacements enable row level security;
revoke all on public.image_replacements from public, anon, authenticated, service_role;
grant select on public.image_replacements to authenticated, service_role;
create policy image_replacements_admin_read on public.image_replacements for select to authenticated
  using ((select nexo_private.is_admin()));
create policy image_active_read_guard on public.property_images as restrictive for select to anon, authenticated
  using (image_active or (select nexo_private.is_admin()));

-- Runs as the statement's caller: privileged RPCs execute as their owner postgres.
-- The browser cannot bypass this with the existing legacy write policies.
create function nexo_private.guard_replacement_images() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op='DELETE' then
    if exists(select 1 from public.image_replacements r where r.property_id=old.property_id and r.state in ('prepared','confirmed')) then
      raise exception 'Replacement gallery retains its originals' using errcode='40001';
    end if;
    return old;
  end if;
  if current_user <> 'postgres' then
    if (tg_op='INSERT' and not new.image_active) then
      raise exception 'Replacement state is backend-only' using errcode='42501';
    end if;
    if tg_op='UPDATE' then
      if new.image_active is distinct from old.image_active then
        raise exception 'Replacement state is backend-only' using errcode='42501';
      end if;
      if (new.position is distinct from old.position or new.is_primary is distinct from old.is_primary)
        and exists (select 1 from public.image_replacements r where r.property_id=old.property_id and r.state in ('prepared','confirmed')) then
        raise exception 'Gallery changed by replacement workflow' using errcode='40001';
      end if;
    end if;
  end if;
  -- Existing finalization must never promote an unconfirmed replacement candidate.
  if exists (select 1 from public.image_replacements r where r.candidate_image_id=new.id and r.state in ('prepared','reverted')) then
    new.is_primary := false;
    new.image_active := false;
  end if;
  return new;
end $$;
revoke all on function nexo_private.guard_replacement_images() from public, anon, authenticated, service_role;
create trigger property_images_replacement_guard before insert or update or delete on public.property_images
  for each row execute function nexo_private.guard_replacement_images();

create function public.nexo_service_prepare_replacement(
  p_actor uuid, p_property uuid, p_source uuid, p_request uuid,
  p_extension text, p_bytes bigint, p_sha256 text, p_alt text,
  p_source_kind text, p_illustrative boolean
) returns public.property_images
language plpgsql security definer set search_path = '' as $$
declare op public.image_replacements; source public.property_images; candidate public.property_images;
begin
  perform nexo_private.require_image_admin(p_actor);
  perform 1 from public.properties where id=p_property for update;
  if not found then raise exception 'Property unavailable' using errcode='22023'; end if;
  select * into op from public.image_replacements where id=p_request for update;
  if found then
    if op.property_id<>p_property or op.source_image_id<>p_source or op.state='reverted' then
      raise exception 'Replacement request mismatch' using errcode='22023';
    end if;
    return public.nexo_service_reserve_image(p_actor,p_property,p_request,p_extension,p_bytes,p_sha256,p_alt,p_source_kind,p_illustrative);
  end if;
  if exists(select 1 from public.property_images where id=p_request)
    or exists(select 1 from public.image_replacements where source_image_id=p_source and state in ('prepared','confirmed')) then
    raise exception 'Replacement already exists' using errcode='40001';
  end if;
  select * into source from public.property_images where id=p_source and property_id=p_property for update;
  if not found or source.storage_kind<>'legacy' or not source.image_active or source.processing_status<>'ready' then
    raise exception 'Active legacy image required' using errcode='22023';
  end if;
  if (select count(*) from public.property_images where property_id=p_property and image_active and is_primary)<>1 then
    raise exception 'Review gallery cover before replacement' using errcode='40001';
  end if;
  candidate := public.nexo_service_reserve_image(p_actor,p_property,p_request,p_extension,p_bytes,p_sha256,p_alt,p_source_kind,p_illustrative);
  update public.property_images set image_active=false where id=candidate.id returning * into candidate;
  insert into public.image_replacements(id,property_id,source_image_id,candidate_image_id,source_snapshot,candidate_position)
    values(p_request,p_property,p_source,candidate.id,to_jsonb(source),candidate.position);
  return candidate;
end $$;

create function public.nexo_service_confirm_replacement(p_actor uuid,p_property uuid,p_request uuid)
returns public.image_replacements language plpgsql security definer set search_path = '' as $$
declare op public.image_replacements; source public.property_images; candidate public.property_images; spare integer;
begin
  perform nexo_private.require_image_admin(p_actor);
  perform 1 from public.properties where id=p_property for update;
  select * into op from public.image_replacements where id=p_request and property_id=p_property for update;
  if not found then raise exception 'Replacement unavailable' using errcode='22023'; end if;
  if op.state='confirmed' then return op; end if;
  if op.state<>'prepared' then raise exception 'Replacement changed' using errcode='40001'; end if;
  select * into source from public.property_images where id=op.source_image_id for update;
  select * into candidate from public.property_images where id=op.candidate_image_id for update;
  if to_jsonb(source) is distinct from op.source_snapshot
    or candidate.property_id<>p_property or candidate.storage_kind<>'managed'
    or candidate.processing_status<>'ready' or candidate.image_active
    or candidate.cleanup_requested_at is not null or candidate.position<>op.candidate_position
    or candidate.original_sha256 is distinct from candidate.verified_sha256
    or candidate.processing_token is null or candidate.processed_at is null then
    raise exception 'Images changed or candidate not ready' using errcode='40001';
  end if;
  if (select count(*) from public.property_images where property_id=p_property and image_active and is_primary)<>1 then
    raise exception 'Gallery cover changed' using errcode='40001'; end if;
  select coalesce(max(position),-1)+1 into spare from public.property_images where property_id=p_property;
  update public.image_replacements set state='confirmed',updated_at=now() where id=op.id;
  update public.property_images set position=spare,is_primary=false,image_active=false where id=source.id;
  update public.property_images set position=source.position,is_primary=source.is_primary,image_active=true where id=candidate.id;
  update public.property_images set position=candidate.position where id=source.id;
  update public.image_replacements set
    confirmed_source_snapshot=(select to_jsonb(i) from public.property_images i where id=source.id),
    confirmed_candidate_snapshot=(select to_jsonb(i) from public.property_images i where id=candidate.id)
    where id=op.id returning * into op;
  return op;
end $$;

-- Reverting a prepared operation cancels it; reverting a confirmed one restores it.
-- Neither path deletes rows or Storage objects.
create function public.nexo_service_revert_replacement(p_actor uuid,p_property uuid,p_request uuid)
returns public.image_replacements language plpgsql security definer set search_path = '' as $$
declare op public.image_replacements; source public.property_images; candidate public.property_images; spare integer;
begin
  perform nexo_private.require_image_admin(p_actor);
  perform 1 from public.properties where id=p_property for update;
  select * into op from public.image_replacements where id=p_request and property_id=p_property for update;
  if not found then raise exception 'Replacement unavailable' using errcode='22023'; end if;
  if op.state='reverted' then return op; end if;
  select * into source from public.property_images where id=op.source_image_id for update;
  select * into candidate from public.property_images where id=op.candidate_image_id for update;
  if op.state='confirmed' then
    if (select count(*) from public.property_images where property_id=p_property and image_active and is_primary)<>1 then
      raise exception 'Gallery cover changed' using errcode='40001'; end if;
    if to_jsonb(source) is distinct from op.confirmed_source_snapshot
      or to_jsonb(candidate) is distinct from op.confirmed_candidate_snapshot then
      raise exception 'Images changed after confirmation' using errcode='40001'; end if;
    select coalesce(max(position),-1)+1 into spare from public.property_images where property_id=p_property;
    update public.image_replacements set state='reverted',updated_at=now() where id=op.id;
    update public.property_images set position=spare,is_primary=false,image_active=false where id=candidate.id;
    update public.property_images set position=(op.source_snapshot->>'position')::integer,
      is_primary=(op.source_snapshot->>'is_primary')::boolean,image_active=true where id=source.id;
    update public.property_images set position=op.candidate_position where id=candidate.id;
  else
    update public.image_replacements set state='reverted',updated_at=now() where id=op.id;
  end if;
  select * into op from public.image_replacements where id=op.id;
  return op;
end $$;

revoke all on function public.nexo_service_prepare_replacement(uuid,uuid,uuid,uuid,text,bigint,text,text,text,boolean) from public,anon,authenticated,service_role;
revoke all on function public.nexo_service_confirm_replacement(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.nexo_service_revert_replacement(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nexo_service_prepare_replacement(uuid,uuid,uuid,uuid,text,bigint,text,text,text,boolean) to service_role;
grant execute on function public.nexo_service_confirm_replacement(uuid,uuid,uuid) to service_role;
grant execute on function public.nexo_service_revert_replacement(uuid,uuid,uuid) to service_role;
commit;
