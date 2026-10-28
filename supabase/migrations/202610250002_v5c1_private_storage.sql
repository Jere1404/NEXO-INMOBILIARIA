-- Reconstructed from read-only Supabase catalog exports; not the original historical text.
-- See docs/V5C-MIGRATION-RECOVERY.md. Do not reapply to an already installed project.
begin;
set local search_path = public, nexo_private, pg_catalog;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types,type,versioning_status,avif_autodetection,lifecycle_configuration,lifecycle_configuration_generation) values
  ('nexo-property-images','nexo-property-images',false,2097152,array['image/jpeg','image/webp']::text[],'STANDARD','DISABLED',false,null,null),
  ('nexo-property-originals','nexo-property-originals',false,10485760,array['image/jpeg','image/png','image/webp']::text[],'STANDARD','DISABLED',false,null,null);

CREATE OR REPLACE FUNCTION nexo_private.image_object_allowed(p_bucket text, p_name text, p_action text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select case when not (select nexo_private.is_admin()) then false else exists (
    select 1 from public.property_images i
    where i.storage_kind = 'managed'
      and i.storage_prefix = substring(p_name from '^properties/[^/]+/[^/]+/')
      and (
        (p_bucket = 'nexo-property-originals' and p_name = i.original_object_key and (
          p_action = 'read'
          or (p_action = 'insert' and i.processing_status = 'pending' and i.cleanup_requested_at is null)
          or (p_action = 'delete' and i.cleanup_requested_at is not null)
        ))
        or (p_bucket = 'nexo-property-images' and p_action in ('read','delete')
          and (p_action <> 'delete' or i.cleanup_requested_at is not null)
          and p_name ~ ('^' || i.storage_prefix || '[a-z0-9_-]+\.(jpg|webp)$')
          and (p_name = i.jpeg_path or exists (
            select 1 from jsonb_array_elements(i.webp_variants || i.jpeg_variants) v
            where v ->> 'src' = p_name
          ))
        )
      )
  ) end;
$function$;

create policy nexo_bucket_delete_guard on storage.buckets as RESTRICTIVE for DELETE to anon,authenticated using (((id <> ALL (ARRAY['nexo-property-originals'::text, 'nexo-property-images'::text])) AND (name <> ALL (ARRAY['nexo-property-originals'::text, 'nexo-property-images'::text]))));

create policy nexo_bucket_insert_guard on storage.buckets as RESTRICTIVE for INSERT to anon,authenticated with check (((id <> ALL (ARRAY['nexo-property-originals'::text, 'nexo-property-images'::text])) AND (name <> ALL (ARRAY['nexo-property-originals'::text, 'nexo-property-images'::text]))));

create policy nexo_bucket_read on storage.buckets as PERMISSIVE for SELECT to authenticated using (((id = ANY (ARRAY['nexo-property-originals'::text, 'nexo-property-images'::text])) AND ( SELECT nexo_private.is_admin() AS is_admin)));

create policy nexo_bucket_read_guard on storage.buckets as RESTRICTIVE for SELECT to anon,authenticated using (((id <> ALL (ARRAY['nexo-property-originals'::text, 'nexo-property-images'::text])) OR ( SELECT nexo_private.is_admin() AS is_admin)));

create policy nexo_bucket_update_guard on storage.buckets as RESTRICTIVE for UPDATE to anon,authenticated using (((id <> ALL (ARRAY['nexo-property-originals'::text, 'nexo-property-images'::text])) AND (name <> ALL (ARRAY['nexo-property-originals'::text, 'nexo-property-images'::text])))) with check (((id <> ALL (ARRAY['nexo-property-originals'::text, 'nexo-property-images'::text])) AND (name <> ALL (ARRAY['nexo-property-originals'::text, 'nexo-property-images'::text]))));

create policy nexo_object_delete on storage.objects as PERMISSIVE for DELETE to authenticated using (nexo_private.image_object_allowed(bucket_id, name, 'delete'::text));

create policy nexo_object_delete_guard on storage.objects as RESTRICTIVE for DELETE to anon,authenticated using (((bucket_id <> ALL (ARRAY['nexo-property-originals'::text, 'nexo-property-images'::text])) OR nexo_private.image_object_allowed(bucket_id, name, 'delete'::text)));

create policy nexo_object_insert on storage.objects as PERMISSIVE for INSERT to authenticated with check (nexo_private.image_object_allowed(bucket_id, name, 'insert'::text));

create policy nexo_object_insert_guard on storage.objects as RESTRICTIVE for INSERT to anon,authenticated with check (((bucket_id <> ALL (ARRAY['nexo-property-originals'::text, 'nexo-property-images'::text])) OR nexo_private.image_object_allowed(bucket_id, name, 'insert'::text)));

create policy nexo_object_read on storage.objects as PERMISSIVE for SELECT to authenticated using (nexo_private.image_object_allowed(bucket_id, name, 'read'::text));

create policy nexo_object_read_guard on storage.objects as RESTRICTIVE for SELECT to anon,authenticated using (((bucket_id <> ALL (ARRAY['nexo-property-originals'::text, 'nexo-property-images'::text])) OR nexo_private.image_object_allowed(bucket_id, name, 'read'::text)));

create policy nexo_object_update_guard on storage.objects as RESTRICTIVE for UPDATE to anon,authenticated using ((bucket_id <> ALL (ARRAY['nexo-property-originals'::text, 'nexo-property-images'::text]))) with check ((bucket_id <> ALL (ARRAY['nexo-property-originals'::text, 'nexo-property-images'::text])));

alter function nexo_private.image_object_allowed(p_bucket text, p_name text, p_action text) owner to postgres;

revoke all on function nexo_private.image_object_allowed(p_bucket text, p_name text, p_action text) from public, anon, authenticated, service_role;

grant execute on function nexo_private.image_object_allowed(p_bucket text, p_name text, p_action text) to anon, authenticated;

commit;
