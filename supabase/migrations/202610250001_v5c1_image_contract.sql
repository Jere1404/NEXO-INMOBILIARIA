-- Reconstructed from read-only Supabase catalog exports; not the original historical text.
-- See docs/V5C-MIGRATION-RECOVERY.md. Do not reapply to an already installed project.
begin;
set local search_path = public, nexo_private, pg_catalog;

alter table public.property_images add column storage_kind text default 'legacy'::text not null;

alter table public.property_images add column original_extension text;

alter table public.property_images add column original_bytes bigint;

alter table public.property_images add column cleanup_requested_at timestamp with time zone;

alter table public.property_images add column cleanup_attempts integer default 0 not null;

alter table public.property_images add column cleanup_last_error text;

alter table public.property_images add column storage_prefix text generated always as (
CASE
    WHEN (storage_kind = 'managed'::text) THEN (((('properties/'::text || (property_id)::text) || '/'::text) || (id)::text) || '/'::text)
    ELSE NULL::text
END) stored;

alter table public.property_images add column original_object_key text generated always as (
CASE
    WHEN (storage_kind = 'managed'::text) THEN ((((('properties/'::text || (property_id)::text) || '/'::text) || (id)::text) || '/original.'::text) || original_extension)
    ELSE NULL::text
END) stored;

alter table public.property_images add constraint image_cleanup_tracking CHECK (((cleanup_attempts >= 0) AND ((cleanup_last_error IS NULL) OR ((length(cleanup_last_error) >= 1) AND (length(cleanup_last_error) <= 500))) AND ((cleanup_requested_at IS NOT NULL) OR ((cleanup_attempts = 0) AND (cleanup_last_error IS NULL)))));

alter table public.property_images add constraint image_storage_kind CHECK ((storage_kind = ANY (ARRAY['legacy'::text, 'managed'::text])));

alter table public.property_images add constraint legacy_image_storage_empty CHECK (((storage_kind <> 'legacy'::text) OR ((original_extension IS NULL) AND (original_bytes IS NULL) AND (cleanup_requested_at IS NULL) AND (cleanup_attempts = 0) AND (cleanup_last_error IS NULL))));

alter table public.property_images add constraint managed_image_original_contract CHECK (((storage_kind <> 'managed'::text) OR ((original_extension IS NOT NULL) AND (original_extension = ANY (ARRAY['jpg'::text, 'png'::text, 'webp'::text])) AND (original_bytes IS NOT NULL) AND ((original_bytes >= 1) AND (original_bytes <= 10485760)) AND (original_object_key IS NOT NULL))));

CREATE UNIQUE INDEX image_managed_original_key ON public.property_images USING btree (original_object_key) WHERE (storage_kind = 'managed'::text);

CREATE UNIQUE INDEX image_managed_storage_prefix ON public.property_images USING btree (storage_prefix) WHERE (storage_kind = 'managed'::text);

CREATE OR REPLACE FUNCTION nexo_private.guard_image_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ begin
  if tg_op = 'DELETE' then
    if old.storage_kind = 'managed' then
      -- Also blocks property ON DELETE CASCADE from losing managed cleanup records.
      raise exception 'Managed image records are retained until the cleanup workflow is implemented'
        using errcode = '23514';
    end if;
    return old;
  end if;
  if new.id is distinct from old.id or new.property_id is distinct from old.property_id
    or new.created_at is distinct from old.created_at or new.storage_kind is distinct from old.storage_kind
    or new.original_extension is distinct from old.original_extension
    or new.original_bytes is distinct from old.original_bytes then
    raise exception 'Image identity and original storage association are immutable' using errcode = '23514';
  end if;
  if old.cleanup_requested_at is not null and new.cleanup_requested_at is distinct from old.cleanup_requested_at then
    raise exception 'Cleanup request cannot be cleared or replaced' using errcode = '23514';
  end if;
  if new.cleanup_attempts < old.cleanup_attempts then
    raise exception 'Cleanup attempt counter cannot decrease' using errcode = '23514';
  end if;
  return new;
end $function$;

CREATE TRIGGER property_images_guard_identity BEFORE DELETE OR UPDATE ON public.property_images FOR EACH ROW EXECUTE FUNCTION nexo_private.guard_image_identity();

create policy nexo_image_delete_guard on public.property_images as RESTRICTIVE for DELETE to anon,authenticated using (( SELECT nexo_private.is_admin() AS is_admin));

create policy nexo_image_insert_guard on public.property_images as RESTRICTIVE for INSERT to anon,authenticated with check (( SELECT nexo_private.is_admin() AS is_admin));

create policy nexo_image_select_guard on public.property_images as RESTRICTIVE for SELECT to anon,authenticated using ((( SELECT nexo_private.is_admin() AS is_admin) OR ((storage_kind = 'legacy'::text) AND (processing_status = 'ready'::text) AND (EXISTS ( SELECT 1
   FROM properties p
  WHERE ((p.id = property_images.property_id) AND (p.status = 'published'::text)))))));

create policy nexo_image_update_guard on public.property_images as RESTRICTIVE for UPDATE to anon,authenticated using (( SELECT nexo_private.is_admin() AS is_admin)) with check (( SELECT nexo_private.is_admin() AS is_admin));

alter function nexo_private.guard_image_identity() owner to postgres;

revoke all on function nexo_private.guard_image_identity() from public, anon, authenticated, service_role;

commit;
