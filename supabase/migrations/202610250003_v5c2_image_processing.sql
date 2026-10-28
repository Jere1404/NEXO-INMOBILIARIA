-- Reconstructed from read-only Supabase catalog exports; not the original historical text.
-- See docs/V5C-MIGRATION-RECOVERY.md. Do not reapply to an already installed project.
begin;
set local search_path = public, nexo_private, pg_catalog;

alter table public.property_images add column original_sha256 text;

alter table public.property_images add column verified_sha256 text;

alter table public.property_images add column processing_token uuid;

alter table public.property_images add column processing_started_at timestamp with time zone;

alter table public.property_images add column processing_attempts integer default 0 not null;

alter table public.property_images add column processing_error text;

alter table public.property_images add column processed_at timestamp with time zone;

create table nexo_private.image_processing_attempts (
  token uuid not null,
  image_id uuid not null,
  object_keys text[] default '{}'::text[] not null,
  status text default 'running'::text not null,
  cleanup_required boolean default false not null,
  created_at timestamp with time zone default now() not null
);

alter table nexo_private.image_processing_attempts add constraint image_processing_attempts_image_id_fkey FOREIGN KEY (image_id) REFERENCES property_images(id);

alter table nexo_private.image_processing_attempts add constraint image_processing_attempts_pkey PRIMARY KEY (token);

alter table nexo_private.image_processing_attempts add constraint image_processing_attempts_status_check CHECK ((status = ANY (ARRAY['running'::text, 'ready'::text, 'failed'::text])));

alter table public.property_images add constraint managed_image_processing_contract CHECK ((((storage_kind = 'legacy'::text) AND (original_sha256 IS NULL) AND (verified_sha256 IS NULL) AND (processing_token IS NULL) AND (processing_started_at IS NULL) AND (processing_attempts = 0) AND (processing_error IS NULL) AND (processed_at IS NULL)) OR ((storage_kind = 'managed'::text) AND (original_sha256 IS NOT NULL) AND (original_sha256 ~ '^[0-9a-f]{64}$'::text) AND (((processing_status = ANY (ARRAY['pending'::text, 'failed'::text])) AND (NOT is_primary) AND (jpeg_path IS NULL) AND (width IS NULL) AND (height IS NULL) AND (webp_variants = '[]'::jsonb) AND (jpeg_variants = '[]'::jsonb) AND (verified_sha256 IS NULL) AND (processed_at IS NULL)) OR ((processing_status = 'ready'::text) AND (processing_token IS NOT NULL) AND (processed_at IS NOT NULL) AND (verified_sha256 IS NOT NULL) AND (verified_sha256 = original_sha256) AND (processing_started_at IS NULL) AND (processing_error IS NULL) AND ((width >= 1) AND (width <= 1600)) AND ((height >= 1) AND (height <= 8192)) AND ((jsonb_array_length(webp_variants) >= 1) AND (jsonb_array_length(webp_variants) <= 3)) AND ((jsonb_array_length(jpeg_variants) >= 1) AND (jsonb_array_length(jpeg_variants) <= 3)) AND (jpeg_path = (((((storage_prefix || 'v-'::text) || (processing_token)::text) || '-'::text) || (width)::text) || '.jpg'::text)))))));

alter table public.property_images add constraint property_images_processing_attempts_check CHECK (((processing_attempts >= 0) AND (processing_attempts <= 5)));

alter table public.property_images add constraint property_images_processing_error_check CHECK (((processing_error IS NULL) OR ((length(processing_error) >= 1) AND (length(processing_error) <= 100))));

CREATE OR REPLACE FUNCTION nexo_private.keep_original_hash()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.original_sha256 is distinct from old.original_sha256 then
    raise exception 'Original checksum is immutable' using errcode='23514';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION nexo_private.require_image_admin(p_actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  perform 1 from public.admin_memberships
    where user_id=p_actor and role='admin' and enabled for share;
  if not found then
    raise exception 'Administrative membership required' using errcode='42501';
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.nexo_service_claim_image(p_actor uuid, p_property uuid, p_image uuid)
 RETURNS property_images
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result public.property_images;
begin
  perform nexo_private.require_image_admin(p_actor);

  perform 1 from public.properties where id=p_property for update;

  select * into result
  from public.property_images
  where id=p_image and property_id=p_property
    and storage_kind='managed'
    and cleanup_requested_at is null for update;

  if not found then
    raise exception 'Image unavailable' using errcode='22023';
  end if;

  if result.processing_status='ready' then
    return result;
  end if;

  if result.processing_started_at>now()-interval '3 minutes' then
    raise exception 'Processing already running' using errcode='55P03';
  end if;

  if result.processing_attempts>=5 then
    raise exception 'Processing retry limit reached' using errcode='54000';
  end if;

  update public.property_images
  set processing_status='pending',
      processing_token=gen_random_uuid(),
      processing_started_at=now(),
      processing_attempts=processing_attempts+1,
      processing_error=null
  where id=p_image returning * into result;

  insert into nexo_private.image_processing_attempts(token,image_id)
  values(result.processing_token,result.id);

  return result;
end $function$;

CREATE OR REPLACE FUNCTION public.nexo_service_fail_image(p_actor uuid, p_property uuid, p_image uuid, p_token uuid, p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform nexo_private.require_image_admin(p_actor);

  if p_code is null or p_code !~ '^[A-Z_]{1,80}$' then
    raise exception 'Invalid error code' using errcode='22023';
  end if;

  update nexo_private.image_processing_attempts
  set status='failed'
  where token=p_token and image_id=p_image and status<>'ready';

  update public.property_images
  set processing_status='failed',
      processing_started_at=null,
      processing_error=p_code
  where id=p_image and property_id=p_property
    and processing_token=p_token
    and processing_status='pending'
    and storage_kind='managed'
    and cleanup_requested_at is null;
end $function$;

CREATE OR REPLACE FUNCTION public.nexo_service_finalize_image(p_actor uuid, p_property uuid, p_image uuid, p_token uuid, p_sha256 text, p_width integer, p_height integer, p_manifest jsonb)
 RETURNS property_images
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  result public.property_images;
  item jsonb;
  w integer;
  h integer;
  fmt text;
  sz integer;
  jpg jsonb:='[]';
  webp jsonb:='[]';
  expected integer[];
  seen text[]:=array[]::text[];
  path text;
begin
  perform nexo_private.require_image_admin(p_actor);

  perform 1 from public.properties where id=p_property for update;

  select * into result
  from public.property_images
  where id=p_image and property_id=p_property
    and storage_kind='managed'
    and cleanup_requested_at is null for update;

  if not found or p_token is null
    or result.processing_token is distinct from p_token then
    raise exception 'Processing attempt changed' using errcode='40001';
  end if;

  if result.processing_status='ready' then
    return result;
  end if;

  if result.processing_status<>'pending'
    or result.processing_started_at is null
    or p_sha256 is distinct from result.original_sha256 then
    raise exception 'Original verification failed' using errcode='22023';
  end if;

  if p_width is null or p_height is null
    or p_width not between 1 and 8192
    or p_height not between 1 and 8192
    or p_width::bigint*p_height>12582912
    or p_manifest is null
    or jsonb_typeof(p_manifest)<>'array' then
    raise exception 'Invalid decoded image dimensions' using errcode='22023';
  end if;

  select array_agg(v order by v) into expected
  from (
    select distinct unnest(
      array[least(480,p_width),least(960,p_width),least(1600,p_width)]
    ) v
  ) x;

  if jsonb_array_length(p_manifest)<>2*cardinality(expected) then
    raise exception 'Incomplete variants' using errcode='22023';
  end if;

  for item in select * from jsonb_array_elements(p_manifest) loop
    if jsonb_typeof(item)<>'object'
      or item->>'width' is null
      or item->>'height' is null
      or item->>'bytes' is null
      or (item->>'width') !~ '^[0-9]{1,4}$'
      or (item->>'height') !~ '^[0-9]{1,4}$'
      or (item->>'bytes') !~ '^[0-9]{1,7}$'
      or not(item ?& array['width','height','bytes','format'])
      or exists(
        select 1 from jsonb_object_keys(item) k
        where k not in ('width','height','bytes','format')
      ) then
      raise exception 'Invalid variant manifest' using errcode='22023';
    end if;

    w:=(item->>'width')::integer;
    h:=(item->>'height')::integer;
    sz:=(item->>'bytes')::integer;
    fmt:=item->>'format';

    if fmt is null
      or fmt not in ('jpg','webp')
      or not(w=any(expected))
      or h not between 1 and 8192
      or sz not between 1 and 2097152
      or abs(h-p_height::numeric*w/p_width)>1
      or (fmt||w::text)=any(seen) then
      raise exception 'Invalid or duplicate variant' using errcode='22023';
    end if;

    seen:=array_append(seen,fmt||w::text);

    path:=result.storage_prefix||'v-'||p_token::text||'-'||w::text||'.'||fmt;

    if fmt='jpg' then
      jpg:=jpg||jsonb_build_array(
        jsonb_build_object('src',path,'width',w)
      );
    else
      webp:=webp||jsonb_build_array(
        jsonb_build_object('src',path,'width',w)
      );
    end if;
  end loop;

  select jsonb_agg(v order by (v->>'width')::integer)
  into jpg from jsonb_array_elements(jpg) v;

  select jsonb_agg(v order by (v->>'width')::integer)
  into webp from jsonb_array_elements(webp) v;

  if not exists(
    select 1 from nexo_private.image_processing_attempts a
    where a.token=p_token and a.image_id=p_image
      and cardinality(a.object_keys)=cardinality(seen)
      and a.object_keys @> array(
        select value->>'src' from jsonb_array_elements(jpg||webp)
      )
  ) then
    raise exception 'Variants were not staged for this attempt' using errcode='22023';
  end if;

  update public.property_images
  set processing_status='ready',
      verified_sha256=p_sha256,
      processed_at=now(),
      processing_started_at=null,
      processing_error=null,
      jpeg_variants=jpg,
      webp_variants=webp,
      width=least(1600,p_width),
      height=(
        select (v->>'height')::integer
        from jsonb_array_elements(p_manifest) v
        where v->>'format'='jpg'
          and (v->>'width')::integer=least(1600,p_width)
      ),
      jpeg_path=result.storage_prefix||'v-'||p_token::text||'-'
        ||least(1600,p_width)::text||'.jpg',
      is_primary=not exists(
        select 1 from public.property_images
        where property_id=p_property and is_primary
      )
  where id=p_image returning * into result;

  update nexo_private.image_processing_attempts
  set status='ready',cleanup_required=false
  where token=p_token and image_id=p_image;

  return result;
end $function$;

CREATE OR REPLACE FUNCTION public.nexo_service_get_image(p_actor uuid, p_property uuid, p_image uuid)
 RETURNS property_images
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result public.property_images;
begin
  perform nexo_private.require_image_admin(p_actor);

  select * into result
  from public.property_images
  where id=p_image and property_id=p_property
    and storage_kind='managed' and cleanup_requested_at is null;

  if not found then
    raise exception 'Image unavailable' using errcode='22023';
  end if;

  return result;
end $function$;

CREATE OR REPLACE FUNCTION public.nexo_service_reserve_image(p_actor uuid, p_property uuid, p_request uuid, p_extension text, p_bytes bigint, p_sha256 text, p_alt text, p_source text, p_illustrative boolean)
 RETURNS property_images
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result public.property_images; next_position integer;
begin
  perform nexo_private.require_image_admin(p_actor);

  if p_request is null or p_extension is null
    or p_extension not in ('jpg','png','webp')
    or p_bytes is null or p_bytes not between 1 and 10485760
    or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
    or p_alt is null or length(btrim(p_alt)) not between 1 and 500
    or p_source is null
    or p_source not in ('ai','licensed','owner_authorized')
    or p_illustrative is null
    or (p_source='ai' and not p_illustrative) then
    raise exception 'Invalid image reservation' using errcode='22023';
  end if;

  perform 1 from public.properties where id=p_property for update;
  if not found then
    raise exception 'Property unavailable' using errcode='22023';
  end if;

  select * into result from public.property_images where id=p_request;

  if found then
    if result.property_id<>p_property
      or result.storage_kind<>'managed'
      or result.original_extension<>p_extension
      or result.original_bytes<>p_bytes
      or result.original_sha256<>p_sha256
      or result.alt<>btrim(p_alt)
      or result.source_kind<>p_source
      or result.illustrative<>p_illustrative
      or result.cleanup_requested_at is not null then
      raise exception 'Reservation does not match the original request' using errcode='22023';
    end if;

    if result.processing_status='failed' and result.processing_attempts<5 then
      update public.property_images
      set processing_status='pending',processing_error=null
      where id=result.id returning * into result;
    end if;

    return result;
  end if;

  if (select count(*) from public.property_images where property_id=p_property)>=20 then
    raise exception 'Property image limit reached' using errcode='54000';
  end if;

  select coalesce(max(position),-1)+1 into next_position
  from public.property_images where property_id=p_property;

  insert into public.property_images(
    id,property_id,position,storage_kind,original_extension,
    original_bytes,original_sha256,alt,source_kind,illustrative
  )
  values(
    p_request,p_property,next_position,'managed',p_extension,
    p_bytes,p_sha256,btrim(p_alt),p_source,p_illustrative
  )
  returning * into result;

  return result;
end $function$;

CREATE OR REPLACE FUNCTION public.nexo_service_stage_image(p_actor uuid, p_property uuid, p_image uuid, p_token uuid, p_keys text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare image_row public.property_images; key text;
begin
  perform nexo_private.require_image_admin(p_actor);

  select * into image_row
  from public.property_images
  where id=p_image and property_id=p_property
    and processing_status='pending'
    and processing_token=p_token
    and cleanup_requested_at is null for update;

  if not found or p_keys is null
    or cardinality(p_keys) not between 2 and 6
    or array_position(p_keys,null) is not null then
    raise exception 'Invalid staging request' using errcode='22023';
  end if;

  foreach key in array p_keys loop
    if key !~ (
      '^'||image_row.storage_prefix||'v-'||p_token::text
      ||'-[0-9]{1,4}\.(jpg|webp)$'
    ) then
      raise exception 'Variant path outside processing attempt' using errcode='22023';
    end if;
  end loop;

  if (
    select count(distinct v) from unnest(p_keys) v
  )<>cardinality(p_keys) then
    raise exception 'Duplicate staging paths' using errcode='22023';
  end if;

  update nexo_private.image_processing_attempts
  set object_keys=p_keys,cleanup_required=true
  where token=p_token and image_id=p_image
    and status='running' and cardinality(object_keys)=0;

  if not found then
    raise exception 'Attempt already staged or changed' using errcode='40001';
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.nexo_service_cleanup_attempt(p_actor uuid, p_image uuid, p_token uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform nexo_private.require_image_admin(p_actor);

  update nexo_private.image_processing_attempts
  set cleanup_required=false,status='failed'
  where token=p_token and image_id=p_image and status<>'ready';
end $function$;

CREATE TRIGGER property_images_keep_hash BEFORE UPDATE ON public.property_images FOR EACH ROW EXECUTE FUNCTION nexo_private.keep_original_hash();

create policy nexo_managed_backend_insert on public.property_images as RESTRICTIVE for INSERT to anon,authenticated with check ((storage_kind = 'legacy'::text));

create policy nexo_managed_backend_update on public.property_images as RESTRICTIVE for UPDATE to anon,authenticated using ((storage_kind = 'legacy'::text)) with check ((storage_kind = 'legacy'::text));

alter function nexo_private.keep_original_hash() owner to postgres;

revoke all on function nexo_private.keep_original_hash() from public, anon, authenticated, service_role;

alter function nexo_private.require_image_admin(p_actor uuid) owner to postgres;

revoke all on function nexo_private.require_image_admin(p_actor uuid) from public, anon, authenticated, service_role;

alter function public.nexo_service_claim_image(p_actor uuid, p_property uuid, p_image uuid) owner to postgres;

revoke all on function public.nexo_service_claim_image(p_actor uuid, p_property uuid, p_image uuid) from public, anon, authenticated, service_role;

grant execute on function public.nexo_service_claim_image(p_actor uuid, p_property uuid, p_image uuid) to service_role;

alter function public.nexo_service_cleanup_attempt(p_actor uuid, p_image uuid, p_token uuid) owner to postgres;

revoke all on function public.nexo_service_cleanup_attempt(p_actor uuid, p_image uuid, p_token uuid) from public, anon, authenticated, service_role;

grant execute on function public.nexo_service_cleanup_attempt(p_actor uuid, p_image uuid, p_token uuid) to service_role;

alter function public.nexo_service_fail_image(p_actor uuid, p_property uuid, p_image uuid, p_token uuid, p_code text) owner to postgres;

revoke all on function public.nexo_service_fail_image(p_actor uuid, p_property uuid, p_image uuid, p_token uuid, p_code text) from public, anon, authenticated, service_role;

grant execute on function public.nexo_service_fail_image(p_actor uuid, p_property uuid, p_image uuid, p_token uuid, p_code text) to service_role;

alter function public.nexo_service_finalize_image(p_actor uuid, p_property uuid, p_image uuid, p_token uuid, p_sha256 text, p_width integer, p_height integer, p_manifest jsonb) owner to postgres;

revoke all on function public.nexo_service_finalize_image(p_actor uuid, p_property uuid, p_image uuid, p_token uuid, p_sha256 text, p_width integer, p_height integer, p_manifest jsonb) from public, anon, authenticated, service_role;

grant execute on function public.nexo_service_finalize_image(p_actor uuid, p_property uuid, p_image uuid, p_token uuid, p_sha256 text, p_width integer, p_height integer, p_manifest jsonb) to service_role;

alter function public.nexo_service_get_image(p_actor uuid, p_property uuid, p_image uuid) owner to postgres;

revoke all on function public.nexo_service_get_image(p_actor uuid, p_property uuid, p_image uuid) from public, anon, authenticated, service_role;

grant execute on function public.nexo_service_get_image(p_actor uuid, p_property uuid, p_image uuid) to service_role;

alter function public.nexo_service_reserve_image(p_actor uuid, p_property uuid, p_request uuid, p_extension text, p_bytes bigint, p_sha256 text, p_alt text, p_source text, p_illustrative boolean) owner to postgres;

revoke all on function public.nexo_service_reserve_image(p_actor uuid, p_property uuid, p_request uuid, p_extension text, p_bytes bigint, p_sha256 text, p_alt text, p_source text, p_illustrative boolean) from public, anon, authenticated, service_role;

grant execute on function public.nexo_service_reserve_image(p_actor uuid, p_property uuid, p_request uuid, p_extension text, p_bytes bigint, p_sha256 text, p_alt text, p_source text, p_illustrative boolean) to service_role;

alter function public.nexo_service_stage_image(p_actor uuid, p_property uuid, p_image uuid, p_token uuid, p_keys text[]) owner to postgres;

revoke all on function public.nexo_service_stage_image(p_actor uuid, p_property uuid, p_image uuid, p_token uuid, p_keys text[]) from public, anon, authenticated, service_role;

grant execute on function public.nexo_service_stage_image(p_actor uuid, p_property uuid, p_image uuid, p_token uuid, p_keys text[]) to service_role;

alter table nexo_private.image_processing_attempts enable row level security;

revoke all on nexo_private.image_processing_attempts from public, anon, authenticated, service_role;

commit;
